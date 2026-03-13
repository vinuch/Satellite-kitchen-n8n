# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-03-13

### Added

#### Chowdeck Webhook Server
- **Standalone Webhook Server** (`webhook-server/`)
  - Node.js Express server for receiving Chowdeck webhooks
  - Endpoint: `POST /webhook/chowdeck`
  - Signature validation using HMAC-SHA256
  - IP whitelisting support
  - Rate limiting (configurable)
  - Comprehensive logging to file
  - Health check endpoint: `GET /health`
  - Log retrieval endpoint: `GET /webhook/logs`
  
- **Security Features**
  - Webhook signature validation with timing-safe comparison
  - Optional IP whitelist filtering
  - Rate limiting per IP address
  - Helmet.js security headers
  
- **Docker Integration**
  - Added `webhook-server` service to docker-compose.yml
  - Exposes port 3001 (configurable via `WEBHOOK_SERVER_PORT`)
  - Persistent volume for webhook logs
  - Health check configuration
  - Auto-restart on failure

- **Environment Variables**
  - `WEBHOOK_SERVER_PORT` - Port for webhook server (default: 3001)
  - `N8N_WEBHOOK_URL` - n8n webhook endpoint URL
  - `VALIDATE_SIGNATURE` - Enable/disable signature validation
  - `ENABLE_IP_WHITELIST` - Enable/disable IP filtering
  - `IP_WHITELIST` - Comma-separated allowed IPs
  - `RATE_LIMIT_WINDOW_MS` - Rate limit window
  - `RATE_LIMIT_MAX` - Max requests per window

- **Documentation**
  - `webhook-setup.md` - Complete setup and configuration guide
  - API endpoint documentation
  - Troubleshooting guide
  - Security configuration details

### Changed
- Updated docker-compose.yml to include webhook-server service
- Webhook handler workflow now receives enriched payloads with metadata

## [1.1.0] - 2025-03-13

### Added

#### Delivery Integration
- **Delivery Tracking Workflow** (`delivery-tracking-workflow.json`)
  - Scheduled trigger: runs every 5 minutes
  - Queries Supabase for orders with `delivery_id` but status not 'delivered'
  - Calls Chowdeck delivery endpoint: `GET /delivery/{delivery_id}`
  - Maps delivery status to order status:
    - `rider_assigned` → `preparing`
    - `picked_up` → `rider_left`
    - `arrived` → `delivered` (or `rider_arrived`)
  - Sends WhatsApp notifications to chef on status changes
  - Logs all tracking updates to `delivery_tracking_logs` table

- **Webhook Handler Workflow** (`webhook-handler-workflow.json`)
  - Webhook endpoint for Chowdeck delivery events
  - Validates webhook signatures using `WEBHOOK_SECRET`
  - Handles events:
    - `order_picked_up` → Updates order status to `rider_left`
    - `order_arrived_at_customer` → Updates order status to `rider_arrived`
    - `order_complete` → Updates order status to `delivered`
  - Sends WhatsApp notifications for each event
  - Logs all webhook events to `webhook_logs` table

#### Updated Workflows
- **Chowdeck Order Poller** (`chowdeck-poller-workflow.json`)
  - Added delivery fields to order transformation:
    - `delivery_id`
    - `delivery_status`
    - `rider_name`
    - `rider_phone`
  - Added source and delivery check:
    - Website orders without `delivery_id` are skipped (admin books manually)
    - Chowdeck orders proceed with normal flow
  - Added "Check Source & Delivery" node for conditional logic
  - Updated WhatsApp message format to include delivery info and source

#### Environment Variables
- Added `CHOWDECK_MERCHANT_API_KEY` - Separate API key for delivery endpoints
- Added `WEBHOOK_SECRET` - Secret for validating Chowdeck webhooks

#### Documentation
- Updated `chowdeck-mapping.md`:
  - Added Delivery Endpoints section
  - Added Webhook Events section
  - Added Delivery Status Mapping table
  - Added Delivery Object and Rider Object documentation
  - Added Website Order Handling section
  - Added Webhook Payload Example

- Updated `README.md`:
  - Added Delivery Tracking workflow documentation
  - Added Webhook Handler workflow documentation
  - Added database schema for `delivery_tracking_logs` and `webhook_logs` tables
  - Added delivery troubleshooting section
  - Updated security recommendations

### Changed
- `.env.example` now includes delivery integration variables
- Order poller now distinguishes between website and Chowdeck orders
- WhatsApp notifications now include delivery status and source information

### Security
- Webhook handler validates HMAC-SHA256 signatures
- Separate API keys for vendor and merchant endpoints

## [1.0.0] - 2025-03-13

### Added
- Initial release of n8n workflows for Satellite Kitchen
- **Chowdeck Order Poller**: Polls for new orders and notifies chef via WhatsApp
- **Manager Alert Workflow**: Sends alerts on import failures
- Complete documentation for setup and configuration
- Docker Compose configuration for easy deployment
- Environment variable templates
- Data mapping documentation for Chowdeck API

### Features
- Automated order polling from Chowdeck API
- WhatsApp notifications via Twilio
- Supabase integration for data persistence
- Duplicate order detection
- Comprehensive error handling and logging
