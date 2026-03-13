# n8n Setup Guide for Satellite Kitchen

This guide will help you set up n8n for automating Satellite Kitchen workflows.

## Prerequisites

- Docker and Docker Compose installed
- Server with port 5678 available

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

## Next Steps

1. Create your first workflow for Chowdeck order notifications
2. Set up WhatsApp alerts to the chef's phone
3. Build automated reporting to Supabase
4. Explore n8n's 400+ integrations

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Forum](https://community.n8n.io/)
- [Workflow Examples](https://n8n.io/workflows/)
