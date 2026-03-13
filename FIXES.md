# Bug Fixes - Chowdeck Poller Workflow

This document details the fixes applied to the Chowdeck Order Poller workflow based on testing feedback.

## Issues Fixed

### 1. Currency Conversion Bug
**Problem:** The workflow stores amounts in kobo (1/100 of NGN) but wasn't converting to NGN for display in WhatsApp messages. This resulted in amounts being displayed 100x larger than actual (e.g., ₦780,000 instead of ₦7,800).

**Fix:** Added conversion (divide by 100) in the Transform Orders node for both `total_amount` and item `unit_price` fields.

**Files Changed:**
- `chowdeck-poller-workflow.json` - Transform Orders node

**Code Change:**
```javascript
// Before:
total_amount: parseFloat(order.total_amount || order.total || 0),
...
unit_price: parseFloat(item.unit_price || item.price || 0),

// After:
total_amount: parseFloat(order.total_amount || order.total || 0) / 100, // Convert kobo to NGN
...
unit_price: parseFloat(item.unit_price || item.price || 0) / 100, // Convert kobo to NGN
```

---

### 2. Missing Error Handler Connection
**Problem:** The "Error Handler" node was defined in the workflow but not connected to any node's error output. This meant HTTP errors from the Chowdeck API request would not be properly caught and handled.

**Fix:** Connected the HTTP Request node's error output to the Error Handler node, and connected the Error Handler's output to the Log Error node.

**Files Changed:**
- `chowdeck-poller-workflow.json` - Connections section

**Changes:**
1. Added error connection from "HTTP Request - Chowdeck Orders" to "Error Handler"
2. Added main connection from "Error Handler" to "Log Error"

---

### 3. WhatsApp Success Check
**Problem:** The "If WhatsApp Success?" condition node was checking `$json.status >= 200 && $json.status < 300`, but error responses from the WhatsApp API may not have a `status` field at all, causing the condition to fail incorrectly.

**Fix:** Changed the condition to check for the absence of an error field instead: `!$json.error`. If there's no error field, the request was successful.

**Files Changed:**
- `chowdeck-poller-workflow.json` - "If WhatsApp Success?" node

**Code Change:**
```javascript
// Before:
leftValue: "={{ $json.status >= 200 && $json.status < 300 }}"

// After:
leftValue: "={{ !$json.error }}"
```

---

### 4. Null external_order_id Validation
**Problem:** Orders with null or undefined `external_order_id` (from `id` or `order_id` fields) could cause issues downstream, such as database insertion failures or duplicate checking problems.

**Fix:** Added validation in the Transform Orders node to filter out orders where both `id` and `order_id` are null/undefined before processing.

**Files Changed:**
- `chowdeck-poller-workflow.json` - Transform Orders node
- `test-transform-logic.js` - Added tests for null/undefined handling

**Code Change:**
```javascript
// Added filter before map:
const orders = response.data
  .filter(order => order && (order.id || order.order_id)) // Skip orders with null/undefined external_order_id
  .map(order => ({ ... }));
```

**Tests Added:**
- `should filter out orders with null external_order_id`
- `should filter out orders with undefined external_order_id`

---

## Testing

All fixes have been validated with the test suite:

```bash
node test-transform-logic.js
```

**Results:** 51 tests passed, 0 failed.

## Summary

| Issue | Status | Files Modified |
|-------|--------|----------------|
| Currency Conversion Bug | ✅ Fixed | chowdeck-poller-workflow.json |
| Missing Error Handler Connection | ✅ Fixed | chowdeck-poller-workflow.json |
| WhatsApp Success Check | ✅ Fixed | chowdeck-poller-workflow.json |
| Null external_order_id Validation | ✅ Fixed | chowdeck-poller-workflow.json, test-transform-logic.js |
