# Test Scenarios

This document outlines test scenarios for validating the n8n Chowdeck Order Poller workflow.

---

## Test Case 1: New Order (Should Insert + Notify)

### Objective
Verify that a new order from Chowdeck is correctly inserted into the database and triggers a WhatsApp notification.

### Prerequisites
- Workflow is active
- Supabase connection is working
- WhatsApp API is configured
- No existing order with ID `ORD-TEST-NEW-001` in database

### Test Data
Use `test-data/mock-chowdeck-response.json` - first order (ORD-7F3A9B2C-1E4D)

### Steps
1. Ensure the order does not exist in the database:
   ```sql
   DELETE FROM orders WHERE external_order_id = 'ORD-7F3A9B2C-1E4D';
   DELETE FROM order_import_logs WHERE external_order_id = 'ORD-7F3A9B2C-1E4D';
   ```

2. Trigger the workflow manually or wait for scheduled execution

3. Monitor the execution in n8n

### Expected Results
- [ ] Workflow executes without errors
- [ ] Order is inserted into `orders` table with:
  - `external_order_id` = "ORD-7F3A9B2C-1E4D"
  - `source` = "chowdeck"
  - `status` = "new"
  - `customer_name` = "John Doe"
  - `total_amount` = 7800.00 (780000 kobo converted)
- [ ] Order items are inserted into `order_items` table (2 items)
- [ ] WhatsApp message is sent to chef
- [ ] `chef_notified_at` is updated with timestamp
- [ ] Success log entry created in `order_import_logs` with status "success"

### Validation Queries
```sql
-- Check order was inserted
SELECT * FROM orders WHERE external_order_id = 'ORD-7F3A9B2C-1E4D';

-- Check order items
SELECT * FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE external_order_id = 'ORD-7F3A9B2C-1E4D'
);

-- Check success log
SELECT * FROM order_import_logs 
WHERE external_order_id = 'ORD-7F3A9B2C-1E4D' 
AND status = 'success';
```

---

## Test Case 2: Duplicate Order (Should Skip)

### Objective
Verify that duplicate orders are detected and skipped to prevent database pollution.

### Prerequisites
- Order `ORD-7F3A9B2C-1E4D` already exists in database (from Test Case 1)

### Test Data
Same as Test Case 1 - order with ID `ORD-7F3A9B2C-1E4D`

### Steps
1. Verify order exists:
   ```sql
   SELECT * FROM orders WHERE external_order_id = 'ORD-7F3A9B2C-1E4D';
   ```

2. Trigger the workflow with the same order data

3. Monitor execution path in n8n

### Expected Results
- [ ] Workflow executes without errors
- [ ] "Check Duplicate" node finds existing record
- [ ] "If Duplicate?" routes to "Log Duplicate" branch (true)
- [ ] Order is NOT inserted again (no duplicate in database)
- [ ] "Log Duplicate" creates entry in `order_import_logs` with:
  - `status` = "skipped"
  - `message` = "Duplicate order - already exists in database"
- [ ] No WhatsApp notification sent for duplicate

### Validation Queries
```sql
-- Verify only one order exists
SELECT COUNT(*) as order_count 
FROM orders 
WHERE external_order_id = 'ORD-7F3A9B2C-1E4D';
-- Expected: 1

-- Check skip log
SELECT * FROM order_import_logs 
WHERE external_order_id = 'ORD-7F3A9B2C-1E4D' 
AND status = 'skipped'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Test Case 3: Empty Response (Should Log, No Error)

### Objective
Verify that the workflow handles empty API responses gracefully without errors.

### Prerequisites
- Workflow is active
- Chowdeck API returns empty orders array

### Test Data
```json
{
  "status": "success",
  "message": "Orders fetched successfully",
  "data": {
    "orders": [],
    "pagination": {
      "current_page": 1,
      "per_page": 350,
      "total": 0,
      "total_pages": 0
    }
  }
}
```

### Steps
1. Simulate empty response (or wait for time when no new orders exist)

2. Trigger the workflow

3. Monitor execution

### Expected Results
- [ ] Workflow executes without errors
- [ ] "Transform Orders" node returns `{ empty: true, orders: [], count: 0 }`
- [ ] "If Empty?" condition evaluates to true
- [ ] Workflow routes to "Log Empty" node
- [ ] "Log Empty" creates entry in `order_import_logs` with:
  - `status` = "empty"
  - `message` = "No new orders found"
  - `external_order_id` = "N/A"
- [ ] No database inserts attempted for orders
- [ ] No WhatsApp notifications sent

### Validation Queries
```sql
-- Check empty log
SELECT * FROM order_import_logs 
WHERE status = 'empty'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Test Case 4: Malformed Payload (Should Handle Gracefully)

### Objective
Verify that the workflow handles malformed or unexpected API responses without crashing.

### Test Scenarios

#### Scenario 4a: Missing Required Fields
**Test Data:**
```json
{
  "status": "success",
  "data": {
    "orders": [
      {
        "id": null,
        "status": "received",
        "customer": null,
        "items": null
      }
    ]
  }
}
```

**Expected Results:**
- [ ] Workflow does not crash
- [ ] Order is processed with defaults:
  - `external_order_id` = null (or handled gracefully)
  - `customer_name` = "Unknown"
  - `items` = empty array
- [ ] Error is logged appropriately

#### Scenario 4b: Invalid Data Types
**Test Data:**
```json
{
  "status": "success",
  "data": {
    "orders": [
      {
        "id": "ORD-INVALID",
        "status": "received",
        "pricing": {
          "total": "not_a_number"
        },
        "items": "not_an_array"
      }
    ]
  }
}
```

**Expected Results:**
- [ ] Workflow does not crash
- [ ] `total_amount` defaults to 0 (parseFloat returns NaN, handled)
- [ ] `items` defaults to empty array
- [ ] Order is inserted with available data

#### Scenario 4c: Null Response
**Test Data:**
```json
null
```

**Expected Results:**
- [ ] Workflow does not crash
- [ ] Empty result is returned
- [ ] Log entry created for empty response

#### Scenario 4d: Unexpected Structure
**Test Data:**
```json
{
  "error": "Internal Server Error",
  "code": 500
}
```

**Expected Results:**
- [ ] Workflow does not crash
- [ ] Error is caught by error handler
- [ ] Error is logged to `order_import_logs` with status "error"

---

## Test Case 5: WhatsApp Failure (Should Log, Retry)

### Objective
Verify that WhatsApp notification failures are logged and the workflow continues.

### Prerequisites
- New order ready to be processed
- WhatsApp API configured to simulate failure (or invalid credentials)

### Test Data
Use `test-data/mock-whatsapp-failure.json` as expected response

### Steps
1. Configure WhatsApp API to return error (use invalid auth or invalid phone)

2. Insert a new order or trigger workflow with new order data

3. Monitor execution through WhatsApp nodes

### Expected Results
- [ ] Order is inserted successfully
- [ ] Order items are inserted successfully
- [ ] WhatsApp API call is made
- [ ] WhatsApp API returns error (400/401/500)
- [ ] "If WhatsApp Success?" evaluates to false
- [ ] Workflow routes to "Log WhatsApp Fail" node
- [ ] Failure is logged in `order_import_logs` with:
  - `status` = "notification_failed"
  - `message` contains error details
- [ ] `chef_notified_at` remains NULL (not updated)
- [ ] Workflow completes without crashing

### Validation Queries
```sql
-- Check order was inserted but not notified
SELECT external_order_id, chef_notified_at 
FROM orders 
WHERE external_order_id = 'ORD-TEST-NEW-001';
-- Expected: chef_notified_at should be NULL

-- Check failure log
SELECT * FROM order_import_logs 
WHERE status = 'notification_failed'
ORDER BY created_at DESC
LIMIT 1;
```

### Retry Behavior
The workflow should support retry logic for WhatsApp failures:

1. **Immediate Retry:** n8n node-level retry (configured in HTTP Request node)
   - Max retries: 3
   - Retry delay: Exponential backoff

2. **Manual Retry:**
   - Failed notifications can be identified via logs
   - Manual re-trigger or separate retry workflow can be used

---

## Test Execution Summary Table

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| TC1 | New Order | Insert + Notify | Critical |
| TC2 | Duplicate Order | Skip + Log | Critical |
| TC3 | Empty Response | Log only, no error | High |
| TC4a | Missing Fields | Handle gracefully | High |
| TC4b | Invalid Types | Handle gracefully | High |
| TC4c | Null Response | Handle gracefully | Medium |
| TC4d | API Error | Log error | High |
| TC5 | WhatsApp Failure | Log failure, continue | High |

---

## Automated Testing

For automated testing, use the mock data files:

```bash
# Run unit tests
node test-transform-logic.js

# Expected output: All tests pass
```

---

## Regression Testing

After any workflow changes, run this full test suite:

1. [ ] TC1: New order flow
2. [ ] TC2: Duplicate detection
3. [ ] TC3: Empty response handling
4. [ ] TC4: Malformed payload handling
5. [ ] TC5: WhatsApp failure handling
6. [ ] Verify all database constraints still work
7. [ ] Verify logging is complete for all scenarios
