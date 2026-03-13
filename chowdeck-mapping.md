# Chowdeck API Integration - Data Mapping Documentation

## Overview

This document describes the data mapping between Chowdeck Vendor API responses and the internal order schema.

## API Endpoints

### Base URL
```
https://api.chowdeck.com/v1
```

### Order Status Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /vendor/order?status=received&per_page=350` | New orders awaiting confirmation |
| `GET /vendor/order?status=preparing,accepted_by_driver` | Orders being prepared |
| `GET /vendor/order?status=awaiting_pickup` | Orders ready for pickup |
| `GET /vendor/order?status=in_transit,arrived` | Orders out for delivery |
| `GET /vendor/order?status=success` | Completed/delivered orders |
| `GET /vendor/order?status=rejected` | Cancelled/rejected orders |

### Authentication

```http
Authorization: Bearer {JWT_TOKEN}
x-app-name: Vendor Hub
```

## Response Structure

### Root Object
```json
{
  "status": "success",
  "message": "Orders fetched successfully",
  "data": {
    "orders": [...],
    "pagination": {...}
  }
}
```

### Order Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique order ID (e.g., "ORD-7F3A9B2C-1E4D") |
| `reference` | string | Human-readable reference (e.g., "CDK-20240313-XYZ789") |
| `status` | string | Order status (see Status Mapping) |
| `payment_status` | string | Payment state: "paid", "pending", "refunded" |
| `payment_method` | string | "card", "wallet", "cash" |
| `created_at` | ISO8601 | Order creation timestamp |
| `updated_at` | ISO8601 | Last update timestamp |
| `scheduled_for` | ISO8601 \| null | Scheduled delivery time (if applicable) |
| `customer` | object | Customer details |
| `delivery_address` | object | Delivery location |
| `items` | array | Line items ordered |
| `pricing` | object | Pricing breakdown |
| `driver` | object \| null | Driver details (if assigned) |
| `vendor_notes` | string | Internal vendor notes |
| `customer_notes` | string | Customer special requests |
| `estimated_ready_time` | ISO8601 \| null | When order should be ready |
| `estimated_delivery_time` | ISO8601 \| null | Expected delivery time |
| `delivered_at` | ISO8601 \| null | Actual delivery timestamp |
| `rejection_reason` | string \| null | Reason for rejection |

### Customer Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Customer ID |
| `first_name` | string | First name |
| `last_name` | string | Last name |
| `phone` | string | Phone number (E.164 format) |
| `email` | string | Email address |

### Delivery Address Object

| Field | Type | Description |
|-------|------|-------------|
| `address` | string | Street address |
| `city` | string | City |
| `state` | string | State |
| `landmark` | string | Nearby landmark |
| `latitude` | number | GPS latitude |
| `longitude` | number | GPS longitude |

### Item Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Item ID |
| `name` | string | Item name |
| `description` | string | Item description |
| `quantity` | number | Quantity ordered |
| `unit_price` | number | Price per unit (in kobo/cents) |
| `total_price` | number | Total for this line (quantity × unit_price) |
| `modifiers` | array | Add-ons/extras |
| `special_instructions` | string | Custom requests |

### Modifier Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Modifier name |
| `price` | number | Additional cost |

### Pricing Object

| Field | Type | Description |
|-------|------|-------------|
| `subtotal` | number | Sum of item prices |
| `delivery_fee` | number | Delivery charge |
| `service_fee` | number | Platform service fee |
| `discount` | number | Discount applied |
| `total` | number | Final amount charged |

### Driver Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Driver ID |
| `name` | string | Driver name |
| `phone` | string | Driver phone |
| `vehicle_type` | string | "motorcycle", "car", "bicycle" |
| `estimated_arrival` | ISO8601 \| null | ETA at vendor/customer |

## Status Mapping

### Chowdeck → Internal Status

| Chowdeck Status | Internal Status | Description |
|-----------------|-----------------|-------------|
| `received` | `new` | Order just received, awaiting acceptance |
| `preparing` | `preparing` | Order accepted and being prepared |
| `accepted_by_driver` | `preparing` | Driver assigned, still preparing |
| `awaiting_pickup` | `ready` | Order ready, waiting for driver |
| `in_transit` | `out_for_delivery` | Driver picked up, en route |
| `arrived` | `out_for_delivery` | Driver at customer location |
| `success` | `delivered` | Successfully delivered |
| `rejected` | `cancelled` | Order cancelled/rejected |

### Notes

- `accepted_by_driver` is grouped with `preparing` as the food is still being prepared
- Both `in_transit` and `arrived` map to `out_for_delivery` for simplicity
- `rejected` includes both vendor rejections and customer cancellations

## Field Mapping Reference

| Internal Field | Chowdeck Source | Transform Notes |
|----------------|-----------------|-----------------|
| `external_order_id` | `id` | Direct mapping |
| `source` | hardcoded | Set to "chowdeck" |
| `reference` | `reference` | Human-readable order ref |
| `customer_name` | `customer.first_name + " " + customer.last_name` | Concatenated full name |
| `customer_phone` | `customer.phone` | Direct mapping (E.164) |
| `customer_email` | `customer.email` | Direct mapping |
| `delivery_address` | `delivery_address.address` | Full address string |
| `delivery_landmark` | `delivery_address.landmark` | Landmark if available |
| `delivery_lat` | `delivery_address.latitude` | GPS coordinate |
| `delivery_lng` | `delivery_address.longitude` | GPS coordinate |
| `items` | `items[]` | Transformed array (see below) |
| `subtotal` | `pricing.subtotal` | In smallest currency unit |
| `delivery_fee` | `pricing.delivery_fee` | In smallest currency unit |
| `service_fee` | `pricing.service_fee` | In smallest currency unit |
| `discount` | `pricing.discount` | In smallest currency unit |
| `total_amount` | `pricing.total` | In smallest currency unit |
| `status` | `status` | Mapped via status table |
| `payment_status` | `payment_status` | Direct mapping |
| `payment_method` | `payment_method` | Direct mapping |
| `driver_name` | `driver.name` | Null if no driver assigned |
| `driver_phone` | `driver.phone` | Null if no driver assigned |
| `customer_notes` | `customer_notes` | Direct mapping |
| `vendor_notes` | `vendor_notes` | Direct mapping |
| `created_at` | `created_at` | ISO8601 timestamp |
| `updated_at` | `updated_at` | ISO8601 timestamp |
| `estimated_ready_at` | `estimated_ready_time` | ISO8601 timestamp |
| `estimated_delivery_at` | `estimated_delivery_time` | ISO8601 timestamp |
| `delivered_at` | `delivered_at` | ISO8601 timestamp (success only) |
| `rejection_reason` | `rejection_reason` | Only for rejected orders |
| `source_payload` | entire order JSON | Raw response stored as JSON |

## Item Transformation

Each item in `items[]` is transformed to:

```javascript
{
  external_item_id: item.id,
  item_name: item.name,
  description: item.description,
  quantity: item.quantity,
  unit_price: item.unit_price,
  total_price: item.total_price,
  modifiers: item.modifiers.map(m => `${m.name} (+₦${m.price/100})`).join(", "),
  special_instructions: item.special_instructions
}
```

## Dedupe Strategy

To prevent duplicate order imports:

1. **Unique Constraint**: Database should have a unique index on `(source, external_order_id)`
2. **Pre-import Check**: Before inserting, query:
   ```sql
   SELECT id FROM orders 
   WHERE source = 'chowdeck' 
   AND external_order_id = ?
   ```
3. **Skip if Exists**: If record exists, skip import (or update if data changed)
4. **Idempotency**: The import process should be idempotent - running twice produces same result

## Currency Handling

- All monetary values from Chowdeck are in **kobo** (Nigerian Naira smallest unit)
- 1 NGN = 100 kobo
- Display values: `value / 100`
- Store raw values to preserve precision

## Error Handling

| Scenario | Action |
|----------|--------|
| API returns 401 | Refresh JWT token, retry once |
| API returns 429 | Backoff and retry with exponential delay |
| Missing required fields | Log error, skip order, alert admin |
| Unknown status value | Log warning, map to `unknown` status |
| Invalid phone format | Normalize or flag for review |

## Sample API Request

```bash
curl -X GET "https://api.chowdeck.com/v1/vendor/order?status=received&per_page=350" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "x-app-name: Vendor Hub" \
  -H "Content-Type: application/json"
```

## Pagination

The API supports pagination via query parameters:

| Parameter | Description |
|-----------|-------------|
| `per_page` | Items per page (max 350) |
| `page` | Page number (1-indexed) |

Response includes:
```json
{
  "pagination": {
    "current_page": 1,
    "per_page": 350,
    "total": 5,
    "total_pages": 1
  }
}
```
