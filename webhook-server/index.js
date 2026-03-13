/**
 * Chowdeck Webhook Server
 * 
 * Receives webhooks from Chowdeck for delivery events and forwards to n8n.
 * Handles signature validation, rate limiting, and logging.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const CONFIG = {
  // n8n webhook URL to forward events to
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook/chowdeck',
  
  // Webhook secret for signature validation
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  // IP whitelist (comma-separated list of IPs)
  IP_WHITELIST: (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim()),
  
  // Rate limiting window and max requests
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  
  // Log file path
  LOG_FILE: process.env.LOG_FILE || '/app/logs/webhooks.log',
  
  // Enable/disable signature validation
  VALIDATE_SIGNATURE: process.env.VALIDATE_SIGNATURE !== 'false',
  
  // Enable/disable IP whitelist
  ENABLE_IP_WHITELIST: process.env.ENABLE_IP_WHITELIST === 'true'
};

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };
  
  // Console output
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data ? JSON.stringify(data) : '');
  
  // File output
  fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify(logEntry) + '\n');
}

// Initialize logging
log('info', 'Chowdeck Webhook Server starting', { port: PORT, config: { ...CONFIG, WEBHOOK_SECRET: '[REDACTED]' } });

// Security middleware
app.use(helmet());
app.use(express.json({ 
  verify: (req, res, buf) => {
    // Store raw body for signature verification
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Trust proxy (for getting real IP behind reverse proxy)
app.set('trust proxy', 1);

// IP Whitelist middleware
function ipWhitelist(req, res, next) {
  if (!CONFIG.ENABLE_IP_WHITELIST || CONFIG.IP_WHITELIST.length === 0) {
    return next();
  }
  
  const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  if (!CONFIG.IP_WHITELIST.includes(clientIp)) {
    log('warn', 'IP not in whitelist', { clientIp, path: req.path });
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'IP address not authorized'
    });
  }
  
  next();
}

// Rate limiting
const limiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT_WINDOW_MS,
  max: CONFIG.RATE_LIMIT_MAX,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log('warn', 'Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }
});

// Apply rate limiting to all routes
app.use(limiter);

// Signature validation middleware
function validateSignature(req, res, next) {
  if (!CONFIG.VALIDATE_SIGNATURE || !CONFIG.WEBHOOK_SECRET) {
    return next();
  }
  
  const signature = req.headers['x-chowdeck-signature'] || req.headers['x-webhook-signature'];
  
  if (!signature) {
    log('warn', 'Missing webhook signature', { ip: req.ip });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing webhook signature'
    });
  }
  
  // Compute expected signature (HMAC-SHA256)
  const expectedSignature = crypto
    .createHmac('sha256', CONFIG.WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');
  
  // Compare signatures (timing-safe)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
  
  if (!isValid) {
    log('warn', 'Invalid webhook signature', { ip: req.ip, signature: signature.substring(0, 10) + '...' });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid webhook signature'
    });
  }
  
  next();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version
  });
});

// Main webhook endpoint
app.post('/webhook/chowdeck', ipWhitelist, validateSignature, async (req, res) => {
  const startTime = Date.now();
  const eventId = crypto.randomUUID();
  
  try {
    const payload = req.body;
    const eventType = payload.event || payload.event_type || 'unknown';
    
    log('info', `Received webhook: ${eventType}`, { 
      eventId, 
      eventType, 
      orderId: payload.order_id || payload.id,
      ip: req.ip 
    });
    
    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      log('error', 'Invalid payload structure', { eventId, payload });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid payload structure'
      });
    }
    
    // Validate event type
    const validEvents = [
      'order_picked_up',
      'order_arrived_at_customer_location',
      'order_complete',
      'order_assigned',
      'order_awaiting_pickup'
    ];
    
    if (!validEvents.includes(eventType)) {
      log('warn', `Unknown event type: ${eventType}`, { eventId, eventType });
      // Still accept and forward - n8n can decide what to do with it
    }
    
    // Enrich payload with metadata
    const enrichedPayload = {
      ...payload,
      _webhook_metadata: {
        eventId,
        receivedAt: new Date().toISOString(),
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
        forwarded: true
      }
    };
    
    // Forward to n8n
    let n8nResponse;
    try {
      n8nResponse = await axios.post(CONFIG.N8N_WEBHOOK_URL, enrichedPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Id': eventId,
          'X-Event-Type': eventType
        },
        timeout: 30000 // 30 second timeout
      });
      
      log('info', `Forwarded to n8n successfully`, { 
        eventId, 
        eventType,
        n8nStatus: n8nResponse.status,
        duration: Date.now() - startTime
      });
    } catch (n8nError) {
      log('error', 'Failed to forward to n8n', { 
        eventId, 
        eventType,
        error: n8nError.message,
        response: n8nError.response?.data
      });
      
      // Still return 200 to Chowdeck so they don't retry
      // The webhook is stored in our logs for manual recovery
      return res.status(200).json({
        success: true,
        eventId,
        message: 'Webhook received but n8n forwarding failed',
        n8nError: n8nError.message
      });
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      eventId,
      message: 'Webhook received and forwarded successfully',
      forwardedTo: CONFIG.N8N_WEBHOOK_URL
    });
    
  } catch (error) {
    log('error', 'Error processing webhook', { 
      eventId, 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process webhook',
      eventId
    });
  }
});

// Webhook logs retrieval endpoint (for debugging)
app.get('/webhook/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    if (!fs.existsSync(CONFIG.LOG_FILE)) {
      return res.json({ logs: [] });
    }
    
    const logs = fs.readFileSync(CONFIG.LOG_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    
    res.json({ logs });
  } catch (error) {
    log('error', 'Error reading logs', { error: error.message });
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  log('info', `Chowdeck Webhook Server running on port ${PORT}`);
  console.log(`
╔════════════════════════════════════════════════════════╗
║     Chowdeck Webhook Server                            ║
╠════════════════════════════════════════════════════════╣
║  Port:        ${PORT.toString().padEnd(43)}║
║  n8n URL:     ${CONFIG.N8N_WEBHOOK_URL.padEnd(43)}║
║  Signature:   ${(CONFIG.VALIDATE_SIGNATURE ? 'Enabled' : 'Disabled').padEnd(43)}║
║  IP Whitelist: ${(CONFIG.ENABLE_IP_WHITELIST ? 'Enabled' : 'Disabled').padEnd(42)}║
║  Rate Limit:  ${(CONFIG.RATE_LIMIT_MAX + ' req/' + (CONFIG.RATE_LIMIT_WINDOW_MS/1000) + 's').padEnd(43)}║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
