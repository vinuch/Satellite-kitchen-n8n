# Workflow Validation Checklist

Use this checklist to manually validate the n8n workflow setup after deployment.

## Pre-Validation Setup

- [ ] n8n instance is running and accessible
- [ ] All environment variables are configured (see `.env.example`)
- [ ] Supabase database is set up with required tables
- [ ] Chowdeck API credentials are valid
- [ ] WhatsApp API credentials are configured (if using notifications)

---

## Node Connection Verification

### 1. Schedule Trigger Node
- [ ] Node type: `n8n-nodes-base.scheduleTrigger`
- [ ] Connected to: HTTP Request - Chowdeck Orders
- [ ] Schedule: Every 1 minute (or desired interval)

### 2. HTTP Request - Chowdeck Orders Node
- [ ] Node type: `n8n-nodes-base.httpRequest`
- [ ] Connected to: Transform Orders
- [ ] Method: GET
- [ ] URL: Uses `$env.CHOWDECK_API_URL` environment variable
- [ ] Query Parameters: `status=received`
- [ ] Headers: Authorization Bearer token from `$env.CHOWDECK_API_KEY`
- [ ] Retry settings configured (3 retries with backoff)

### 3. Transform Orders Node
- [ ] Node type: `n8n-nodes-base.code`
- [ ] Connected to: If Empty?
- [ ] JavaScript code transforms API response correctly
- [ ] Handles empty responses gracefully

### 4. If Empty? Node
- [ ] Node type: `n8n-nodes-base.if`
- [ ] True branch (empty): Connected to Log Empty
- [ ] False branch (has orders): Connected to Split In Batches
- [ ] Condition: `$json.empty` equals `true`

### 5. Split In Batches Node
- [ ] Node type: `n8n-nodes-base.splitInBatches`
- [ ] Connected to: Check Duplicate
- [ ] Batch Size: 1

### 6. Check Duplicate Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Connected to: If Duplicate?
- [ ] Operation: Get All
- [ ] Table: orders
- [ ] Filters:
  - `external_order_id` = current order's external_order_id
  - `source` = "chowdeck"
- [ ] Credentials: Supabase API credentials configured

### 7. If Duplicate? Node
- [ ] Node type: `n8n-nodes-base.if`
- [ ] True branch (duplicate): Connected to Log Duplicate
- [ ] False branch (new): Connected to Insert Order
- [ ] Condition: `$json.length > 0` equals `true`

### 8. Insert Order Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Connected to: Insert Order Items
- [ ] Operation: Insert
- [ ] Table: orders
- [ ] Fields mapped correctly:
  - [ ] source = "chowdeck"
  - [ ] external_order_id
  - [ ] status
  - [ ] customer_name
  - [ ] customer_phone
  - [ ] currency
  - [ ] total_amount
  - [ ] delivery_address
  - [ ] source_payload (JSON stringified)
  - [ ] imported_at = `$now`

### 9. Insert Order Items Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Connected to: Format WhatsApp Message
- [ ] Operation: Insert
- [ ] Table: order_items
- [ ] Fields mapped correctly:
  - [ ] order_id = `$json.id` (from Insert Order)
  - [ ] item_name
  - [ ] quantity
  - [ ] unit_price
  - [ ] raw_payload (JSON stringified)

### 10. Format WhatsApp Message Node
- [ ] Node type: `n8n-nodes-base.code`
- [ ] Connected to: Send WhatsApp
- [ ] Uses `$env.CHEF_PHONE` for recipient

### 11. Send WhatsApp Node
- [ ] Node type: `n8n-nodes-base.httpRequest`
- [ ] Connected to: If WhatsApp Success?
- [ ] Method: POST
- [ ] URL: Uses `$env.WHATSAPP_API_URL`
- [ ] Headers: Authorization Bearer token from `$env.WHATSAPP_API_KEY`
- [ ] Body: `to` and `message` parameters

### 12. If WhatsApp Success? Node
- [ ] Node type: `n8n-nodes-base.if`
- [ ] True branch (success): Connected to Update Chef Notified At AND Log Success
- [ ] False branch (failure): Connected to Log WhatsApp Fail
- [ ] Condition: `$json.status >= 200 && $json.status < 300`

### 13. Update Chef Notified At Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Operation: Update
- [ ] Table: orders
- [ ] Filter: external_order_id = current order
- [ ] Field: chef_notified_at = `$now`

### 14. Log Success Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Operation: Insert
- [ ] Table: order_import_logs
- [ ] status = "success"

### 15. Log Duplicate Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Operation: Insert
- [ ] Table: order_import_logs
- [ ] status = "skipped"

### 16. Log Empty Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Operation: Insert
- [ ] Table: order_import_logs
- [ ] status = "empty"

### 17. Log WhatsApp Fail Node
- [ ] Node type: `n8n-nodes-base.supabase`
- [ ] Operation: Insert
- [ ] Table: order_import_logs
- [ ] status = "notification_failed"

---

## Credential Requirements

### Supabase Credentials
- [ ] Credential name: "Supabase API"
- [ ] Credential type: `supabaseApi`
- [ ] Host: Your Supabase project URL (e.g., `https://yourproject.supabase.co`)
- [ ] Service Role Key: Your Supabase service role key (NOT the anon key)

### Chowdeck API Credentials
- [ ] No credential object needed (uses environment variables)
- [ ] API Key stored in `CHOWDECK_API_KEY` environment variable
- [ ] API URL stored in `CHOWDECK_API_URL` environment variable

### WhatsApp API Credentials (if using Twilio)
- [ ] No credential object needed (uses environment variables)
- [ ] API Key stored in `WHATSAPP_API_KEY` environment variable
- [ ] API URL stored in `WHATSAPP_API_URL` environment variable

---

## Environment Variable Checks

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CHOWDECK_API_URL` | Chowdeck API base URL | `https://api.chowdeck.com/v1` |
| `CHOWDECK_API_KEY` | Chowdeck API authentication token | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_KEY` | Supabase service role key | `eyJhbGciOiJIUzI1NiIs...` |
| `CHEF_PHONE` | Chef's WhatsApp number | `+2348011111111` |
| `WHATSAPP_API_URL` | WhatsApp API endpoint | `https://api.twilio.com/2010-04-01/...` |
| `WHATSAPP_API_KEY` | WhatsApp API auth token | `Basic YW...` or Bearer token |

### n8n Environment Configuration

- [ ] Variables added to n8n Settings → External Secrets (or .env file)
- [ ] All variables are accessible in workflow expressions (`$env.VAR_NAME`)
- [ ] No hardcoded credentials in workflow JSON

---

## Database Schema Validation

### orders table
```sql
-- Verify table exists
SELECT * FROM orders LIMIT 1;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders';
```

Required columns:
- [ ] id (uuid, primary key)
- [ ] source (text)
- [ ] external_order_id (text)
- [ ] status (text)
- [ ] customer_name (text)
- [ ] customer_phone (text, nullable)
- [ ] currency (text)
- [ ] total_amount (numeric)
- [ ] delivery_address (text, nullable)
- [ ] source_payload (jsonb)
- [ ] chef_notified_at (timestamp, nullable)
- [ ] imported_at (timestamp)
- [ ] created_at (timestamp)

### order_items table
- [ ] id (uuid, primary key)
- [ ] order_id (uuid, foreign key to orders)
- [ ] item_name (text)
- [ ] quantity (integer)
- [ ] unit_price (numeric)
- [ ] raw_payload (jsonb)
- [ ] created_at (timestamp)

### order_import_logs table
- [ ] id (uuid, primary key)
- [ ] source (text)
- [ ] external_order_id (text)
- [ ] run_id (text)
- [ ] status (text)
- [ ] message (text)
- [ ] payload (jsonb)
- [ ] created_at (timestamp)

### Indexes
- [ ] Unique index on (source, external_order_id) in orders table
- [ ] Index on orders.imported_at for querying
- [ ] Index on order_import_logs.created_at for log cleanup

---

## Manual Test Execution

1. **Activate the workflow**
   - [ ] Toggle workflow to "Active" in n8n
   - [ ] Verify no errors on activation

2. **Trigger a test run**
   - [ ] Click "Execute Workflow" manually
   - [ ] Check execution logs for each node

3. **Verify database entries**
   - [ ] Check orders table for new entries
   - [ ] Check order_items table for line items
   - [ ] Check order_import_logs for success/empty entries

4. **Test duplicate handling**
   - [ ] Run workflow again with same order
   - [ ] Verify order is skipped (not duplicated)
   - [ ] Check log shows "skipped" status

5. **Test WhatsApp notification (if enabled)**
   - [ ] Verify message is sent to chef
   - [ ] Check chef_notified_at is updated
   - [ ] Test failure case and verify logging

---

## Post-Validation Checklist

- [ ] All nodes show green checkmarks in test execution
- [ ] No error messages in execution logs
- [ ] Database contains expected data
- [ ] Duplicate orders are properly skipped
- [ ] Empty responses are logged correctly
- [ ] WhatsApp notifications work (if configured)
- [ ] Failed notifications are logged with retry capability

---

## Troubleshooting Quick Reference

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| HTTP Request fails | Invalid API key or URL | Check `CHOWDECK_API_URL` and `CHOWDECK_API_KEY` |
| Supabase insert fails | Wrong credentials | Verify service role key, not anon key |
| Duplicate orders inserted | Missing unique constraint | Add unique index on (source, external_order_id) |
| WhatsApp not sending | Invalid phone format | Use E.164 format (e.g., +2348012345678) |
| Environment vars not working | Not configured in n8n | Add to Settings → External Secrets |
