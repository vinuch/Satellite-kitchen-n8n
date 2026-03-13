# Webhook Server Setup Guide

This guide explains how to set up and configure the Chowdeck Webhook Server for receiving delivery event notifications.

## Overview

The webhook server acts as a middleware between Chowdeck and n8n:
- Receives webhooks from Chowdeck on delivery events
- Validates signatures and IP addresses
- Forwards events to n8n webhook workflow
- Logs all events for debugging

## Architecture

```
┌──────────┐     POST /webhook/chowdeck     ┌─────────────────┐     POST /webhook     ┌─────┐
│ Chowdeck │ ─────────────────────────────→ │ Webhook Server  │ ────────────────────→ │ n8n │
│          │                                 │   (Port 3001)   │                      │     │
└──────────┘                                 └─────────────────┘                      └─────┘
                                                    │
                                                    ↓
                                            ┌───────────────┐
                                            │  Logs File    │
                                            │ webhooks.log  │
                                            └───────────────┘
```

## Supported Events

The webhook server handles the following Chowdeck events:

| Event | Description |
|-------|-------------|
| `order_assigned` | Rider has been assigned to order |
| `order_awaiting_pickup` | Order is ready and waiting for rider |
| `order_picked_up` | Rider has picked up the order |
| `order_arrived_at_customer_location` | Rider has arrived at customer location |
| `order_complete` | Order delivery is complete |

## Environment Variables

Create a `.env` file in the project root or set these in your environment:

```env
# Required
N8N_WEBHOOK_URL=http://n8n:5678/webhook/chowdeck-webhook
WEBHOOK_SECRET=your_chowdeck_webhook_secret

# Optional
PORT=3001
VALIDATE_SIGNATURE=true
ENABLE_IP_WHITELIST=false
IP_WHITELIST=192.168.1.1,10.0.0.1
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOG_FILE=/app/logs/webhooks.log
```

### Variable Descriptions

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `N8N_WEBHOOK_URL` | Yes | `http://n8n:5678/webhook/chowdeck` | n8n webhook endpoint URL |
| `WEBHOOK_SECRET` | Yes | - | Secret key for validating Chowdeck signatures |
| `PORT` | No | `3001` | Port the webhook server listens on |
| `VALIDATE_SIGNATURE` | No | `true` | Enable HMAC-SHA256 signature validation |
| `ENABLE_IP_WHITELIST` | No | `false` | Enable IP address filtering |
| `IP_WHITELIST` | No | - | Comma-separated list of allowed IPs |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limiting window in milliseconds |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
| `LOG_FILE` | No | `/app/logs/webhooks.log` | Path to webhook log file |

## Running with Docker

The webhook server is included in the docker-compose.yml:

```bash
# Start all services (n8n + webhook server)
docker-compose up -d

# View webhook server logs
docker-compose logs -f webhook-server

# Restart webhook server only
docker-compose restart webhook-server
```

## Running Locally (Development)

```bash
cd webhook-server

# Install dependencies
npm install

# Create .env file
cp ../.env.example .env
# Edit .env with your values

# Start development server with auto-reload
npm run dev

# Or start production server
npm start
```

## API Endpoints

### Health Check
```bash
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2025-03-13T22:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Receive Webhook
```bash
POST /webhook/chowdeck
Content-Type: application/json
X-Chowdeck-Signature: <hmac-signature>

Body:
{
  "event": "order_picked_up",
  "order_id": "12345",
  "delivery_id": "DEL-67890",
  "timestamp": "2025-03-13T22:00:00Z",
  "data": { ... }
}

Response:
{
  "success": true,
  "eventId": "uuid-v4",
  "message": "Webhook received and forwarded successfully",
  "forwardedTo": "http://n8n:5678/webhook/chowdeck"
}
```

### View Logs
```bash
GET /webhook/logs?limit=50

Response:
{
  "logs": [
    {
      "timestamp": "2025-03-13T22:00:00.000Z",
      "level": "info",
      "message": "Received webhook: order_picked_up",
      "data": { ... }
    }
  ]
}
```

## Webhook Payload Example

```json
{
  "event": "order_picked_up",
  "order_id": "ORD-12345",
  "delivery_id": "DEL-67890",
  "timestamp": "2025-03-13T22:00:00Z",
  "data": {
    "rider": {
      "name": "John Doe",
      "phone": "+2348012345678",
      "vehicle_type": "motorcycle"
    },
    "pickup_time": "2025-03-13T22:05:00Z",
    "estimated_delivery": "2025-03-13T22:30:00Z"
  },
  "_webhook_metadata": {
    "eventId": "uuid-v4",
    "receivedAt": "2025-03-13T22:00:01Z",
    "sourceIp": "192.168.1.100",
    "userAgent": "Chowdeck-Webhook/1.0",
    "forwarded": true
  }
}
```

## Security

### Signature Validation

The server validates webhooks using HMAC-SHA256:

1. Chowdeck sends signature in `X-Chowdeck-Signature` header
2. Server computes expected signature using `WEBHOOK_SECRET`
3. Signatures are compared using timing-safe comparison

### IP Whitelisting

To restrict access to known Chowdeck IPs:

1. Set `ENABLE_IP_WHITELIST=true`
2. Add IPs to `IP_WHITELIST` (comma-separated)
3. Restart the server

**Note:** If using a reverse proxy (nginx, cloudflare), ensure `trust proxy` is configured correctly.

### Rate Limiting

Default: 100 requests per minute per IP

Adjust via environment variables:
- `RATE_LIMIT_WINDOW_MS`: Window duration in milliseconds
- `RATE_LIMIT_MAX`: Maximum requests per window

## Troubleshooting

### Check Server Health
```bash
curl http://localhost:3001/health
```

### View Recent Logs
```bash
# Via API
curl http://localhost:3001/webhook/logs?limit=20

# Via Docker
docker-compose exec webhook-server cat /app/logs/webhooks.log

# Via file system
tail -f webhook-server/logs/webhooks.log
```

### Test Webhook Locally
```bash
curl -X POST http://localhost:3001/webhook/chowdeck \
  -H "Content-Type: application/json" \
  -H "X-Chowdeck-Signature: test-signature" \
  -d '{
    "event": "order_picked_up",
    "order_id": "TEST-123",
    "delivery_id": "DEL-456",
    "timestamp": "2025-03-13T22:00:00Z"
  }'
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid webhook signature" | Check `WEBHOOK_SECRET` matches Chowdeck configuration |
| "IP not in whitelist" | Add Chowdeck IPs to `IP_WHITELIST` or disable whitelist |
| "Rate limit exceeded" | Increase `RATE_LIMIT_MAX` or wait for window reset |
| "n8n forwarding failed" | Verify n8n is running and webhook URL is correct |
| Logs not showing | Ensure log directory exists and has write permissions |

## Configuration in Chowdeck Dashboard

1. Log into Chowdeck Merchant Dashboard
2. Navigate to Settings → Webhooks
3. Add webhook URL: `https://your-domain.com/webhook/chowdeck`
4. Set secret key (save this as `WEBHOOK_SECRET`)
5. Select events to subscribe to:
   - Order Assigned
   - Order Awaiting Pickup
   - Order Picked Up
   - Order Arrived at Customer Location
   - Order Complete
6. Save and test the webhook

## Monitoring

### Log Rotation

The webhook server appends to a single log file. Set up log rotation:

```bash
# Using logrotate
/etc/logrotate.d/chowdeck-webhook:
/app/logs/webhooks.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
```

### Health Monitoring

Monitor these endpoints:
- `GET /health` - Server health status
- `GET /webhook/logs` - Recent webhook activity

### Alerts

Set up alerts for:
- High error rate (>5% of requests failing)
- n8n forwarding failures
- Rate limiting triggered frequently
- Disk space (log files growing)

## Development

### Project Structure
```
webhook-server/
├── index.js          # Main server file
├── package.json      # Dependencies
└── logs/             # Log files (created at runtime)
    └── webhooks.log
```

### Adding New Event Types

1. Update `validEvents` array in `index.js`
2. Update n8n workflow to handle new event
3. Update this documentation

### Testing

```bash
# Run with test environment
NODE_ENV=test WEBHOOK_SECRET=test npm start

# Send test webhook
curl -X POST http://localhost:3001/webhook/chowdeck \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{}}'
```
