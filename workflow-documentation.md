# Chowdeck Order Poller - Workflow Documentation

## Overview

This n8n workflow polls the Chowdeck API for new orders every minute, processes them, and inserts them into Supabase while preventing duplicates.

---

## Node-by-Node Explanation

### 1. Schedule Trigger
**Type:** `n8n-nodes-base.scheduleTrigger`

**Purpose:** Initiates the workflow automatically on a schedule.

**Configuration:**
- Runs every 1 minute
- Triggers the entire polling process

**Output:** Empty trigger object that starts the workflow chain.

---

### 2. HTTP Request - Chowdeck Orders
**Type:** `n8n-nodes-base.httpRequest`

**Purpose:** Fetches orders from the Chowdeck API with status "received".

**Configuration:**
- **Method:** GET
- **URL:** `{{ $env.CHOWDECK_API_URL }}/orders` (environment variable)
- **Query Parameters:**
  - `status`: `received` (only fetch new/received orders)
- **Headers:**
  - `Authorization`: `Bearer {{ $env.CHOWDECK_API_KEY }}` (environment variable)

**Retry Logic:** n8n's built-in retry mechanism (configured in node settings)

**Output:** Raw API response from Chowdeck.

---

### 3. Transform Orders (Code Node)
**Type:** `n8n-nodes-base.code`

**Purpose:** Transforms the raw Chowdeck API response into a standardized format for database insertion.

**Logic:**
1. Checks if response is empty or contains no orders
2. Maps each order to standardized fields:
   - `external_order_id`: Order ID from Chowdeck
   - `status`: Order status (defaults to 'received')
   - `customer_name`: Customer name extraction
   - `customer_phone`: Customer phone number
   - `currency`: Currency code (defaults to 'NGN')
   - `total_amount`: Parsed float value
   - `source_payload`: Complete raw order object (JSON)
   - `items`: Array of order items with name, quantity, unit_price, raw_payload

**Output:** Standardized order object with `orders`, `count`, and `empty` flag.

---

### 4. If Empty? (Conditional)
**Type:** `n8n-nodes-base.if`

**Purpose:** Checks if the API returned any orders.

**Condition:** `{{ $json.empty }}` equals `true`

**Branches:**
- **True (no orders):** Routes to "Log Empty" node
- **False (has orders):** Routes to "Split In Batches" node

---

### 5. Log Empty (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Logs when no new orders are found.

**Operation:** Insert into `order_import_logs`

**Fields:**
- `source`: "chowdeck"
- `external_order_id`: "N/A"
- `run_id`: `{{ $execution.id }}`
- `status`: "empty"
- `message`: "No new orders found"
- `payload`: "{}"

---

### 6. Split In Batches
**Type:** `n8n-nodes-base.splitInBatches`

**Purpose:** Loops through each order individually for processing.

**Configuration:**
- **Batch Size:** 1 (process one order at a time)

**Output:** Individual order objects for sequential processing.

---

### 7. Check Duplicate (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Checks if the order already exists in the database.

**Operation:** Get All from `orders` table

**Filters:**
- `external_order_id` = current order's external_order_id
- `source` = "chowdeck"

**Output:** Array of matching records (empty if new order).

---

### 8. If Duplicate? (Conditional)
**Type:** `n8n-nodes-base.if`

**Purpose:** Determines if order should be processed or skipped.

**Condition:** `{{ $json.length > 0 }}` equals `true` (records exist)

**Branches:**
- **False (new order):** Routes to "Insert Order" node
- **True (duplicate):** Routes to "Log Duplicate" node

---

### 9. Insert Order (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Inserts the new order into the `orders` table.

**Operation:** Insert into `orders`

**Fields:**
- `source`: "chowdeck"
- `external_order_id`: Order ID from Chowdeck
- `status`: Order status
- `customer_name`: Customer name
- `customer_phone`: Phone number
- `currency`: Currency (NGN)
- `total_amount`: Total order amount
- `source_payload`: Raw JSON payload
- `imported_at`: Current timestamp (`{{ $now }}`)

**Output:** Inserted order record with generated `id`.

---

### 10. Insert Order Items (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Inserts order line items into the `order_items` table.

**Operation:** Insert into `order_items`

**Fields:**
- `order_id`: ID from parent order insertion (`{{ $json.id }}`)
- `item_name`: Product name
- `quantity`: Item quantity
- `unit_price`: Price per unit
- `raw_payload`: Raw item JSON

**Note:** This node runs for each item in the order.

---

### 11. Log Success (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Logs successful order import.

**Operation:** Insert into `order_import_logs`

**Fields:**
- `source`: "chowdeck"
- `external_order_id`: Order ID
- `run_id`: `{{ $execution.id }}`
- `status`: "success"
- `message`: "Order imported successfully"
- `payload`: JSON string of order data

---

### 12. Log Duplicate (Supabase)
**Type:** `n8n-nodes-base.supabase`

**Purpose:** Logs when a duplicate order is skipped.

**Operation:** Insert into `order_import_logs`

**Fields:**
- `source`: "chowdeck"
- `external_order_id`: Order ID
- `run_id`: `{{ $execution.id }}`
- `status`: "skipped"
- `message`: "Duplicate order - already exists in database"
- `payload`: JSON string of order data

---

## Error Handling

### HTTP Request Retry Logic
The HTTP Request node has built-in retry capabilities:
- **Max Retries:** 3 attempts
- **Retry Delay:** Exponential backoff
- **Retry On:** Network errors, 5xx server errors, timeouts

### Error Logging
All errors are logged to `order_import_logs` with:
- `status`: "error"
- `message`: Error description
- `payload`: Error details as JSON

---

## Environment Variables Required

Configure these in n8n settings:

| Variable | Description |
|----------|-------------|
| `CHOWDECK_API_URL` | Base URL for Chowdeck API |
| `CHOWDECK_API_KEY` | API key for authentication |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |

---

## Workflow Flow Diagram

```
┌─────────────────┐
│ Schedule Trigger│ (Every 1 min)
└────────┬────────┘
         │
         ▼
┌──────────────────────────┐
│ HTTP Request - Chowdeck  │ (GET /orders?status=received)
└────────┬─────────────────┘
         │
         ▼
┌─────────────────┐
│ Transform Orders│ (Standardize data)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    If Empty?    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌─────────────────┐
│Log Empty│ │ Split In Batches│ (Loop orders)
└────────┘ └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Check Duplicate │ (Supabase query)
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  If Duplicate?  │
           └────────┬────────┘
                    │
           ┌────────┴────────┐
           │                 │
           ▼                 ▼
    ┌─────────────┐   ┌─────────────┐
    │Insert Order │   │Log Duplicate│
    └──────┬──────┘   └─────────────┘
           │
           ▼
    ┌─────────────┐
    │Insert Items │ (For each item)
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ Log Success │
    └─────────────┘
```

---

## Database Schema Reference

### orders table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key, auto-generated |
| source | text | 'chowdeck' |
| external_order_id | text | Chowdeck order ID |
| status | text | Order status |
| customer_name | text | Customer name |
| customer_phone | text | Phone number |
| currency | text | 'NGN' |
| total_amount | numeric | Order total |
| source_payload | jsonb | Raw API response |
| chef_notified_at | timestamp | Null initially |
| imported_at | timestamp | When imported |
| created_at | timestamp | Auto-generated |

### order_items table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| order_id | uuid | FK to orders |
| item_name | text | Product name |
| quantity | integer | Item count |
| unit_price | numeric | Price per unit |
| raw_payload | jsonb | Raw item data |
| created_at | timestamp | Auto-generated |

### order_import_logs table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| source | text | 'chowdeck' |
| external_order_id | text | Order ID or 'N/A' |
| run_id | text | n8n execution ID |
| status | text | success/skipped/empty/error |
| message | text | Human-readable status |
| payload | jsonb | Context data |
| created_at | timestamp | Auto-generated |

---

## Notes

- WhatsApp notifications are handled in a separate workflow (triggered by database changes or webhook)
- The workflow processes orders sequentially to avoid race conditions
- All raw payloads are preserved for debugging and audit purposes
- The `chef_notified_at` field remains null until the WhatsApp notification workflow updates it
