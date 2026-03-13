# Troubleshooting Guide

Common issues and solutions for the n8n Chowdeck Order Poller workflow.

---

## Table of Contents

1. [Common Setup Issues](#common-setup-issues)
2. [Docker Problems](#docker-problems)
3. [n8n Credential Issues](#n8n-credential-issues)
4. [WhatsApp Sandbox Issues](#whatsapp-sandbox-issues)
5. [Database Connection Problems](#database-connection-problems)

---

## Common Setup Issues

### Issue: Workflow shows "ERROR" status

**Symptoms:**
- Workflow execution shows red error indicators
- Error message in execution log

**Possible Causes & Solutions:**

1. **Missing Environment Variables**
   ```bash
   # Check if all required variables are set
   echo $CHOWDECK_API_URL
   echo $CHOWDECK_API_KEY
   echo $SUPABASE_URL
   echo $SUPABASE_KEY
   ```
   
   **Solution:** Add missing variables to `.env` file or n8n Settings → External Secrets

2. **Invalid JSON in Environment Variables**
   - Some variables may contain special characters that break JSON parsing
   
   **Solution:** Wrap values in quotes if they contain special characters:
   ```bash
   CHOWDECK_API_KEY="Bearer eyJhbG..."
   ```

3. **Workflow Not Activated**
   - Workflow is in "Inactive" state
   
   **Solution:** Toggle workflow to "Active" in n8n UI

---

### Issue: "Cannot read property 'data' of undefined"

**Symptoms:**
- Error in "Transform Orders" node
- Occurs when API response is unexpected

**Solution:**
Check that the Chowdeck API is returning the expected structure:
```javascript
// Expected response structure
{
  "data": {
    "orders": [...]
  }
}
```

If the API returns a different structure, update the Transform Orders node code.

---

### Issue: Orders not being inserted

**Symptoms:**
- Workflow runs successfully
- No new records in database

**Possible Causes & Solutions:**

1. **Duplicate Detection Working**
   - Check `order_import_logs` for "skipped" entries
   - This is expected behavior for duplicates

2. **Supabase RLS Policies**
   - Row Level Security may be blocking inserts
   
   **Solution:** Disable RLS for service role key or add proper policies:
   ```sql
   ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
   -- OR create policy
   CREATE POLICY "Service role can insert orders" 
   ON orders FOR INSERT 
   TO service_role 
   WITH CHECK (true);
   ```

3. **Missing Required Fields**
   - Database constraints preventing insert
   
   **Solution:** Check Supabase logs for constraint violations

---

## Docker Problems

### Issue: n8n container fails to start

**Symptoms:**
```
Error: EACCES: permission denied, mkdir '/home/node/.n8n'
```

**Solution:**
Fix permissions for the n8n directory:
```bash
# Create directories with correct permissions
mkdir -p ~/.n8n
sudo chown -R 1000:1000 ~/.n8n

# Or use docker-compose with user mapping
```

---

### Issue: "Connection refused" to n8n

**Symptoms:**
- Cannot access n8n at `http://localhost:5678`
- Container is running but not accessible

**Possible Causes & Solutions:**

1. **Port Not Exposed**
   
   **Solution:** Check `docker-compose.yml`:
   ```yaml
   ports:
     - "5678:5678"
   ```

2. **Container Not Healthy**
   
   **Solution:** Check container logs:
   ```bash
   docker-compose logs n8n
   ```

3. **Firewall Blocking**
   
   **Solution:** Open port 5678:
   ```bash
   sudo ufw allow 5678/tcp
   ```

---

### Issue: Data not persisting after container restart

**Symptoms:**
- Workflows disappear after `docker-compose down`
- Credentials need to be re-added

**Solution:**
Ensure volumes are properly mounted in `docker-compose.yml`:
```yaml
volumes:
  - ~/.n8n:/home/node/.n8n
```

---

### Issue: Out of memory errors

**Symptoms:**
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed
```

**Solution:**
Increase Node.js memory limit:
```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=4096
```

---

## n8n Credential Issues

### Issue: "Credentials not found" error

**Symptoms:**
- Node shows credential error
- Workflow fails at Supabase or HTTP nodes

**Solution:**
1. Go to Settings → Credentials
2. Create new credential of type "Supabase API"
3. Select the credential in the Supabase nodes
4. Save workflow

---

### Issue: Supabase "Invalid API key"

**Symptoms:**
- 401 Unauthorized errors from Supabase
- "Invalid API key" or "JWT expired"

**Possible Causes & Solutions:**

1. **Using Anon Key Instead of Service Role Key**
   
   **Solution:** Use the service role key (starts with `eyJ...`) from:
   Supabase Dashboard → Project Settings → API → service_role key

2. **Key Expired**
   
   **Solution:** Regenerate key in Supabase Dashboard

3. **Wrong URL**
   
   **Solution:** Use project URL (e.g., `https://abc123.supabase.co`), not the REST endpoint

---

### Issue: Environment variables not accessible

**Symptoms:**
- `$env.VAR_NAME` returns undefined
- Variables work in shell but not in n8n

**Solution:**
1. **For Docker deployment:**
   Add variables to `docker-compose.yml`:
   ```yaml
   environment:
     - CHOWDECK_API_URL=${CHOWDECK_API_URL}
     - CHOWDECK_API_KEY=${CHOWDECK_API_KEY}
   ```

2. **For n8n cloud:**
   Add variables in n8n Settings → External Secrets

3. **Verify in workflow:**
   Add a "Set" node to test:
   ```javascript
   {
     "test_var": "={{ $env.CHOWDECK_API_URL }}"
   }
   ```

---

## WhatsApp Sandbox Issues

### Issue: "To number is not a valid WhatsApp number"

**Symptoms:**
- Error 21211 from Twilio
- Message not delivered

**Possible Causes & Solutions:**

1. **Number Not Registered on WhatsApp**
   
   **Solution:** Verify the chef's number is registered on WhatsApp

2. **Wrong Format**
   
   **Solution:** Use E.164 format:
   - ✅ `+2348012345678`
   - ❌ `08012345678`
   - ❌ `2348012345678`

3. **Number Not in Sandbox**
   
   **Solution:** For Twilio Sandbox, the number must:
   - Join by sending message to your Twilio Sandbox number
   - Or be approved in Twilio Console

---

### Issue: "Authentication failed" from WhatsApp API

**Symptoms:**
- 401 Unauthorized errors
- "Invalid Account SID" or "Authentication failed"

**Solution:**
1. Verify Account SID and Auth Token from Twilio Console
2. For HTTP Basic Auth, format as:
   ```
   Authorization: Basic {base64(AccountSID:AuthToken)}
   ```
3. Check if token has expired and regenerate if needed

---

### Issue: Messages queued but not delivered

**Symptoms:**
- API returns success (status: queued)
- Message never arrives

**Possible Causes & Solutions:**

1. **WhatsApp Session Expired**
   
   **Solution:** In Twilio Sandbox, user must re-join every 24 hours by sending a message

2. **Rate Limiting**
   
   **Solution:** Implement delays between messages or upgrade Twilio plan

3. **Template Not Approved** (for business API)
   
   **Solution:** Use pre-approved templates or apply for custom template approval

---

### Issue: "Message failed" with error code

**Common Twilio Error Codes:**

| Code | Meaning | Solution |
|------|---------|----------|
| 21211 | Invalid 'To' number | Check phone format and WhatsApp registration |
| 21608 | Number not verified | Verify number in Twilio Console |
| 63003 | Channel not found | Check WhatsApp Business Account setup |
| 63016 | Template not found | Use approved template or join sandbox |
| 63018 | Message rate limit | Slow down message sending |

---

## Database Connection Problems

### Issue: "Connection terminated unexpectedly"

**Symptoms:**
- Intermittent database errors
- "Connection terminated" in logs

**Possible Causes & Solutions:**

1. **Connection Pool Exhausted**
   
   **Solution:** Increase connection pool size or reduce concurrent operations

2. **Network Issues**
   
   **Solution:** Check network connectivity to Supabase:
   ```bash
   ping yourproject.supabase.co
   ```

3. **Long-Running Queries**
   
   **Solution:** Add timeouts and optimize queries

---

### Issue: "Unique constraint violation"

**Symptoms:**
- Error inserting order
- "duplicate key value violates unique constraint"

**Solution:**
This is expected for duplicates. The workflow should handle this:
1. Check if order exists before inserting
2. If constraint error occurs, log and continue

If seeing unexpected violations:
```sql
-- Check existing orders
SELECT external_order_id, created_at 
FROM orders 
WHERE external_order_id = 'YOUR-ORDER-ID';

-- Check for data issues
SELECT source, external_order_id, COUNT(*) 
FROM orders 
GROUP BY source, external_order_id 
HAVING COUNT(*) > 1;
```

---

### Issue: "Column does not exist"

**Symptoms:**
- Error referencing column names
- "column X does not exist"

**Solution:**
Verify database schema matches expected columns:
```sql
-- Check orders table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders';

-- Check order_items table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order_items';
```

Run the schema setup SQL if columns are missing.

---

### Issue: Slow query performance

**Symptoms:**
- Workflow execution is slow
- Database queries timeout

**Solution:**
Add indexes for common queries:
```sql
-- For duplicate checking
CREATE INDEX idx_orders_source_external_id 
ON orders(source, external_order_id);

-- For recent orders lookup
CREATE INDEX idx_orders_imported_at 
ON orders(imported_at DESC);

-- For logs
CREATE INDEX idx_import_logs_created_at 
ON order_import_logs(created_at DESC);
```

---

### Issue: SSL/TLS connection errors

**Symptoms:**
- "SSL connection has been closed unexpectedly"
- Certificate errors

**Solution:**
For Supabase, ensure SSL mode is enabled:
```javascript
// In connection settings
{
  "ssl": {
    "rejectUnauthorized": false
  }
}
```

Or in connection string:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

---

## Getting Help

If issues persist:

1. **Check n8n Logs:**
   ```bash
   docker-compose logs n8n
   ```

2. **Check Execution Log:**
   - In n8n UI, open the failed execution
   - Review each node's input/output

3. **Enable Debug Mode:**
   Set environment variable:
   ```bash
   N8N_LOG_LEVEL=debug
   ```

4. **Community Resources:**
   - n8n Community Forum: https://community.n8n.io
   - Supabase Discord: https://discord.gg/supabase
   - Twilio Support: https://support.twilio.com

5. **File an Issue:**
   Include:
   - Error message
   - Workflow JSON (sanitized)
   - Environment details (n8n version, deployment method)
   - Steps to reproduce
