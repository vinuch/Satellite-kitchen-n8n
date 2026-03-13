# n8n Setup Guide for Satellite Kitchen

This guide will help you set up n8n for automating Satellite Kitchen workflows.

## Prerequisites

- Docker and Docker Compose installed
- Server with port 5678 available
- Chowdeck merchant account with API access
- Supabase project for data storage
- WhatsApp Business API or Twilio account

## Quick Start

### 1. Configure Environment Variables

Copy the example environment file and customize it:

```bash
cp .env.example .env
nano .env  # or your preferred editor
```

Edit the following values in `.env`:

| Variable | Description | Example |
|----------|-------------|---------|
| `N8N_HOST` | Your server IP or domain | `192.168.1.100` or `n8n.yourdomain.com` |
| `WEBHOOK_URL` | Public URL for webhooks | `http://your-server-ip:5678` |
| `N8N_BASIC_AUTH_USER` | Admin username | `admin` |
| `N8N_BASIC_AUTH_PASSWORD` | Secure password | `YourStrongPassword123!` |
| `N8N_ENCRYPTION_KEY` | Random encryption key | Generate with: `openssl rand -base64 32` |
| `CHOWDECK_TOKEN` | Your Chowdeck JWT token | From Chowdeck dashboard |
| `CHOWDECK_MERCHANT_API_KEY` | Your Chowdeck merchant API key | For delivery endpoints |
| `WEBHOOK_SECRET` | Secret for webhook validation | Generate with: `openssl rand -hex 32` |
| `SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | From Supabase settings |
| `WHATSAPP_API_KEY` | WhatsApp Business API key | From your WhatsApp provider |
| `CHEF_PHONE` | Chef's WhatsApp number | `+2348012345678` |

### 2. Start n8n

Run the following command to start n8n in detached mode:

```bash
docker compose up -d
```

This will:
- Download the latest n8n image
- Create a persistent volume for data
- Start n8n on port 5678

### 3. Access n8n

Open your browser and navigate to:

```
http://your-server-ip:5678
```

Or if running locally:

```
http://localhost:5678
```

### 4. First-Time Setup

1. **Create Owner Account**: On first launch, n8n will prompt you to create an owner account
2. **Set Up Basic Auth** (if enabled in `.env`):
   - You'll be prompted for the username/password set in your `.env` file
   - This adds an extra layer of security
3. **Configure Supabase Credentials**:
   - Go to Settings → Credentials
   - Add Supabase API credentials
   - Use your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

## Workflows

### 1. Chowdeck Order Poller (`chowdeck-poller-workflow.json`)

**Purpose**: Polls Chowdeck API for new orders and sends WhatsApp notifications to the chef.

**Features**:
- Fetches orders with `status=received`
- Transforms Chowdeck data to internal format
- Checks for duplicates before inserting
- **Handles website orders**: Skips orders without delivery_id (admin books manually)
- Sends WhatsApp notification to chef
- Logs all import attempts

**Schedule**: Configurable (default: every 5 minutes)

**Setup**:
1. Import `chowdeck-poller-workflow.json`
2. Configure Supabase credentials
3. Set environment variables: `CHOWDECK_API_URL`, `CHOWDECK_API_KEY`, `CHEF_PHONE`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`
4. Activate the workflow

### 2. Delivery Tracking (`delivery-tracking-workflow.json`)

**Purpose**: Tracks delivery status for orders with delivery_id and sends status updates to the chef.

**Features**:
- Runs every 5 minutes
- Queries Supabase for active deliveries (not delivered)
- Calls Chowdeck delivery endpoint for each
- Updates order status based on delivery status:
  - `rider_assigned` → `preparing`
  - `picked_up` → `rider_left`
  - `arrived` → `delivered` (or `rider_arrived`)
- Sends WhatsApp notifications on status changes
- Logs tracking history

**Setup**:
1. Import `delivery-tracking-workflow.json`
2. Configure Supabase credentials
3. Set environment variables: `CHOWDECK_API_URL`, `CHOWDECK_MERCHANT_API_KEY`, `CHEF_PHONE`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`
4. Activate the workflow

### 3. Webhook Handler (`webhook-handler-workflow.json`)

**Purpose**: Receives and processes Chowdeck delivery webhooks.

**Features**:
- Webhook endpoint for Chowdeck events
- Validates webhook signature using `WEBHOOK_SECRET`
- Handles events:
  - `order_picked_up` → Updates status to `rider_left`
  - `order_arrived_at_customer` → Updates status to `rider_arrived`
  - `order_complete` → Updates status to `delivered`
- Sends WhatsApp notifications
- Logs all webhook events

**Setup**:
1. Import `webhook-handler-workflow.json`
2. Configure Supabase credentials
3. Set environment variables: `WEBHOOK_SECRET`, `CHEF_PHONE`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`
4. Copy the webhook URL from the Webhook Trigger node
5. Configure the webhook URL in your Chowdeck merchant dashboard
6. Activate the workflow

### 4. Manager Alert (`manager-alert-workflow.json`)

**Purpose**: Sends alerts to the manager when orders fail to import.

**Features**:
- Monitors import logs
- Sends WhatsApp alerts on failures
- Configurable alert thresholds

## Database Schema

### Required Tables

#### orders
```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_order_id text not null,
  status text not null,
  customer_name text,
  customer_phone text,
  currency text default 'NGN',
  total_amount decimal(10,2),
  delivery_address text,
  delivery_id text,
  delivery_status text,
  rider_name text,
  rider_phone text,
  source_payload jsonb,
  imported_at timestamp with time zone,
  chef_notified_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  unique(source, external_order_id)
);
```

#### order_items
```sql
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  item_name text not null,
  quantity integer not null,
  unit_price decimal(10,2),
  raw_payload jsonb
);
```

#### order_import_logs
```sql
create table order_import_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_order_id text,
  run_id text,
  status text not null,
  message text,
  payload jsonb,
  created_at timestamp with time zone default now()
);
```

#### delivery_tracking_logs
```sql
create table delivery_tracking_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  delivery_id text,
  previous_status text,
  new_status text,
  rider_name text,
  rider_phone text,
  location_lat decimal(10,8),
  location_lng decimal(11,8),
  eta timestamp with time zone,
  error_message text,
  checked_at timestamp with time zone default now()
);
```

#### webhook_logs
```sql
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  order_id text,
  delivery_id text,
  status text not null,
  error_message text,
  payload jsonb,
  processed_at timestamp with time zone default now()
);
```

## Managing n8n

### View Logs

```bash
docker compose logs -f n8n
```

### Stop n8n

```bash
docker compose down
```

### Restart n8n

```bash
docker compose restart
```

### Update n8n

```bash
docker compose pull
docker compose up -d
```

## Publishing Workflows

### Save a Workflow

1. Build your workflow in the n8n editor
2. Click **Save** (top right)
3. Give your workflow a name
4. Toggle **Active** to enable it

### Export/Import Workflows

**Export:**
1. Open the workflow
2. Click the menu (⋮) → **Download**
3. Save the JSON file

**Import:**
1. Click **Workflow** → **Import from File**
2. Select the JSON file

### Backup Workflows

Workflows are stored in the Docker volume `n8n_data`. To backup:

```bash
# Create backup directory
mkdir -p ./backups

# Backup the volume
docker run --rm -v n8n_data:/source -v $(pwd)/backups:/backup alpine tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz -C /source .
```

## Security Recommendations

1. **Enable Basic Auth**: Set `N8N_BASIC_AUTH_ACTIVE=true` in `.env`
2. **Use HTTPS**: For production, place n8n behind a reverse proxy (nginx/traefik) with SSL
3. **Set Strong Encryption Key**: Generate a random key for `N8N_ENCRYPTION_KEY`
4. **Restrict Access**: Use firewall rules to limit port 5678 access if needed
5. **Secure Webhooks**: Always use `WEBHOOK_SECRET` to validate incoming webhooks
6. **Separate API Keys**: Use different keys for vendor API (`CHOWDECK_TOKEN`) and merchant API (`CHOWDECK_MERCHANT_API_KEY`)

## Troubleshooting

### n8n won't start

Check logs:
```bash
docker compose logs n8n
```

### Port already in use

Change `N8N_PORT` in `.env` to a different port (e.g., `5679`)

### Data persistence issues

Ensure the Docker volume is created:
```bash
docker volume ls | grep n8n_data
```

### Webhook not receiving events

1. Verify `WEBHOOK_URL` is publicly accessible
2. Check firewall rules
3. Verify webhook URL is correctly configured in Chowdeck dashboard
4. Check webhook logs in Supabase

### Delivery tracking not working

1. Verify `CHOWDECK_MERCHANT_API_KEY` is set correctly
2. Check that orders have `delivery_id` populated
3. Review `delivery_tracking_logs` for errors

## Next Steps

1. Create your first workflow for Chowdeck order notifications
2. Set up WhatsApp alerts to the chef's phone
3. Configure delivery tracking for real-time updates
4. Set up webhooks for instant delivery notifications
5. Build automated reporting to Supabase
6. Explore n8n's 400+ integrations

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Forum](https://community.n8n.io/)
- [Workflow Examples](https://n8n.io/workflows/)
- [Chowdeck API Documentation](https://docs.chowdeck.com)
