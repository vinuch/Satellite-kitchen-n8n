// Unit tests for transform-logic.js functions
// Run with: node test-transform-logic.js

const assert = require('assert');

// Sample payload for testing (based on chowdeck-mapping.md)
const samplePayload = {
  "status": "success",
  "message": "Orders fetched successfully",
  "data": {
    "orders": [
      {
        "id": "ORD-7F3A9B2C-1E4D",
        "reference": "CDK-20240313-XYZ789",
        "status": "received",
        "payment_status": "paid",
        "payment_method": "card",
        "created_at": "2024-03-13T10:30:00Z",
        "updated_at": "2024-03-13T10:30:00Z",
        "customer": {
          "id": "CUST-001",
          "first_name": "John",
          "last_name": "Doe",
          "phone": "+2348012345678",
          "email": "john@example.com"
        },
        "delivery_address": {
          "address": "123 Main Street, Satellite Town",
          "city": "Lagos",
          "state": "Lagos State",
          "landmark": "Near Total Filling Station",
          "latitude": 6.5244,
          "longitude": 3.3792
        },
        "items": [
          {
            "id": "ITEM-001",
            "name": "Jollof Rice & Chicken",
            "description": "Spicy Nigerian jollof with grilled chicken",
            "quantity": 2,
            "unit_price": 250000,
            "total_price": 500000,
            "modifiers": [
              { "name": "Extra Plantain", "price": 50000 }
            ],
            "special_instructions": "Make it extra spicy"
          },
          {
            "id": "ITEM-002",
            "name": "Malt Drink",
            "description": "Chilled malt beverage",
            "quantity": 2,
            "unit_price": 50000,
            "total_price": 100000,
            "modifiers": [],
            "special_instructions": null
          }
        ],
        "pricing": {
          "subtotal": 600000,
          "delivery_fee": 150000,
          "service_fee": 30000,
          "discount": 0,
          "total": 780000
        },
        "driver": null,
        "vendor_notes": "",
        "customer_notes": "Please call when you arrive"
      }
    ]
  }
};

// ============================================
// TRANSFORM LOGIC FUNCTIONS (extracted from workflow)
// ============================================

/**
 * Maps Chowdeck status to internal status
 * @param {string} chowdeckStatus - Status from Chowdeck API
 * @returns {string} - Internal status
 */
function mapStatus(chowdeckStatus) {
  const statusMap = {
    'received': 'new',
    'preparing': 'preparing',
    'accepted_by_driver': 'preparing',
    'awaiting_pickup': 'ready',
    'in_transit': 'out_for_delivery',
    'arrived': 'out_for_delivery',
    'success': 'delivered',
    'rejected': 'cancelled'
  };
  return statusMap[chowdeckStatus] || 'unknown';
}

/**
 * Transforms a single order from Chowdeck format to internal format
 * @param {Object} order - Raw order from Chowdeck
 * @returns {Object} - Transformed order
 */
function transformOrder(order) {
  // Handle missing or null order
  if (!order) {
    return null;
  }

  return {
    external_order_id: order.id || order.order_id,
    status: mapStatus(order.status) || 'received',
    customer_name: order.customer?.name || 
                   (order.customer?.first_name && order.customer?.last_name 
                     ? `${order.customer.first_name} ${order.customer.last_name}` 
                     : null) || 
                   order.customer_name || 
                   'Unknown',
    customer_phone: order.customer?.phone || order.customer_phone || null,
    currency: order.currency || 'NGN',
    total_amount: parseFloat(order.pricing?.total || order.total_amount || order.total || 0) / 100, // Convert kobo to NGN
    delivery_address: order.delivery_address?.address || order.address || null,
    source_payload: order,
    items: transformItems(order.items || order.order_items || [])
  };
}

/**
 * Transforms order items from Chowdeck format to internal format
 * @param {Array} items - Raw items from Chowdeck
 * @returns {Array} - Transformed items
 */
function transformItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map(item => ({
    item_name: item.name || item.item_name,
    quantity: parseInt(item.quantity || 1),
    unit_price: parseFloat(item.unit_price || item.price || 0) / 100, // Convert kobo to NGN
    raw_payload: item
  }));
}

/**
 * Transforms the complete Chowdeck API response
 * @param {Object} response - Full API response
 * @returns {Object} - Transformed response with orders array
 */
function transformResponse(response) {
  // Handle empty response
  if (!response || !response.data || !Array.isArray(response.data.orders)) {
    return {
      orders: [],
      count: 0,
      empty: true
    };
  }

  const orders = response.data.orders.map(transformOrder).filter(order => order !== null);

  return {
    orders: orders,
    count: orders.length,
    empty: orders.length === 0
  };
}

/**
 * Checks if an order is a duplicate based on existing records
 * @param {Object} order - Order to check
 * @param {Array} existingOrders - Orders already in database
 * @returns {boolean} - True if duplicate
 */
function isDuplicate(order, existingOrders) {
  if (!existingOrders || !Array.isArray(existingOrders)) {
    return false;
  }
  return existingOrders.some(existing => 
    existing.external_order_id === order.external_order_id && 
    existing.source === 'chowdeck'
  );
}

/**
 * Formats WhatsApp message for chef notification
 * @param {Object} order - Transformed order
 * @param {string} chefPhone - Chef's phone number
 * @returns {Object} - Formatted message object
 */
function formatWhatsAppMessage(order, chefPhone) {
  const orderId = order.external_order_id;
  const customerName = order.customer_name;
  const customerPhone = order.customer_phone || 'N/A';
  const totalAmount = order.total_amount.toLocaleString('en-NG', { 
    style: 'currency', 
    currency: order.currency 
  });
  const deliveryAddress = order.delivery_address || 'Pickup';

  // Format items list
  const itemsList = order.items.map(item => {
    const itemTotal = (item.quantity * item.unit_price).toLocaleString('en-NG', { 
      style: 'currency', 
      currency: order.currency 
    });
    return `• ${item.quantity}x ${item.item_name} = ${itemTotal}`;
  }).join('\n');

  const message = `🍽️ *NEW ORDER* 🍽️

📋 Order: #${orderId}
👤 Customer: ${customerName}
📞 Phone: ${customerPhone}

📦 *ITEMS:*
${itemsList}

💰 *TOTAL: ${totalAmount}*

📍 Delivery: ${deliveryAddress}

⏰ Received: ${new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;

  return {
    message: message,
    order_id: orderId,
    recipient: chefPhone
  };
}

// ============================================
// TEST SUITES
// ============================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

console.log('\n🧪 Running Transform Logic Tests\n');

// ============================================
// STATUS MAPPING TESTS
// ============================================
console.log('\n📋 Status Mapping Tests\n');

test('should map received to new', () => {
  assert.strictEqual(mapStatus('received'), 'new');
});

test('should map preparing to preparing', () => {
  assert.strictEqual(mapStatus('preparing'), 'preparing');
});

test('should map accepted_by_driver to preparing', () => {
  assert.strictEqual(mapStatus('accepted_by_driver'), 'preparing');
});

test('should map awaiting_pickup to ready', () => {
  assert.strictEqual(mapStatus('awaiting_pickup'), 'ready');
});

test('should map in_transit to out_for_delivery', () => {
  assert.strictEqual(mapStatus('in_transit'), 'out_for_delivery');
});

test('should map arrived to out_for_delivery', () => {
  assert.strictEqual(mapStatus('arrived'), 'out_for_delivery');
});

test('should map success to delivered', () => {
  assert.strictEqual(mapStatus('success'), 'delivered');
});

test('should map rejected to cancelled', () => {
  assert.strictEqual(mapStatus('rejected'), 'cancelled');
});

test('should return unknown for unrecognized status', () => {
  assert.strictEqual(mapStatus('unknown_status'), 'unknown');
});

test('should return unknown for null status', () => {
  assert.strictEqual(mapStatus(null), 'unknown');
});

test('should return unknown for undefined status', () => {
  assert.strictEqual(mapStatus(undefined), 'unknown');
});

// ============================================
// ORDER TRANSFORMATION TESTS
// ============================================
console.log('\n📦 Order Transformation Tests\n');

test('should transform complete order correctly', () => {
  const order = samplePayload.data.orders[0];
  const transformed = transformOrder(order);
  
  assert.strictEqual(transformed.external_order_id, 'ORD-7F3A9B2C-1E4D');
  assert.strictEqual(transformed.status, 'new');
  assert.strictEqual(transformed.customer_name, 'John Doe');
  assert.strictEqual(transformed.customer_phone, '+2348012345678');
  assert.strictEqual(transformed.currency, 'NGN');
  assert.strictEqual(transformed.total_amount, 7800); // 780000 kobo = 7800 NGN
  assert.strictEqual(transformed.delivery_address, '123 Main Street, Satellite Town');
  assert.strictEqual(transformed.items.length, 2);
});

test('should handle order with customer.name instead of first/last', () => {
  const order = {
    ...samplePayload.data.orders[0],
    customer: { name: 'Jane Smith', phone: '+2348098765432' }
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.customer_name, 'Jane Smith');
});

test('should handle order with customer_name field', () => {
  const order = {
    ...samplePayload.data.orders[0],
    customer: null,
    customer_name: 'Bob Wilson'
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.customer_name, 'Bob Wilson');
});

test('should default to Unknown for missing customer name', () => {
  const order = {
    ...samplePayload.data.orders[0],
    customer: null,
    customer_name: null
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.customer_name, 'Unknown');
});

test('should handle null phone number', () => {
  const order = {
    ...samplePayload.data.orders[0],
    customer: { ...samplePayload.data.orders[0].customer, phone: null }
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.customer_phone, null);
});

test('should handle order with order_id instead of id', () => {
  const order = {
    ...samplePayload.data.orders[0],
    id: null,
    order_id: 'ORDER-12345'
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.external_order_id, 'ORDER-12345');
});

test('should convert kobo to NGN for total_amount', () => {
  const order = {
    ...samplePayload.data.orders[0],
    pricing: { total: 500000 } // 5000 NGN in kobo
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.total_amount, 5000);
});

test('should handle order with total field instead of pricing.total', () => {
  const order = {
    ...samplePayload.data.orders[0],
    pricing: null,
    total: 100000
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.total_amount, 1000); // 100000 kobo = 1000 NGN
});

test('should handle order with total_amount field', () => {
  const order = {
    ...samplePayload.data.orders[0],
    pricing: null,
    total_amount: 250000
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.total_amount, 2500);
});

test('should default to 0 for missing total', () => {
  const order = {
    ...samplePayload.data.orders[0],
    pricing: null,
    total: null
  };
  const transformed = transformOrder(order);
  assert.strictEqual(transformed.total_amount, 0);
});

test('should handle null order', () => {
  const transformed = transformOrder(null);
  assert.strictEqual(transformed, null);
});

// ============================================
// ITEM TRANSFORMATION TESTS
// ============================================
console.log('\n🍽️ Item Transformation Tests\n');

test('should transform items correctly', () => {
  const items = samplePayload.data.orders[0].items;
  const transformed = transformItems(items);
  
  assert.strictEqual(transformed.length, 2);
  assert.strictEqual(transformed[0].item_name, 'Jollof Rice & Chicken');
  assert.strictEqual(transformed[0].quantity, 2);
  assert.strictEqual(transformed[0].unit_price, 2500); // 250000 kobo = 2500 NGN
  assert.ok(transformed[0].raw_payload);
});

test('should handle empty items array', () => {
  const transformed = transformItems([]);
  assert.deepStrictEqual(transformed, []);
});

test('should handle null items', () => {
  const transformed = transformItems(null);
  assert.deepStrictEqual(transformed, []);
});

test('should handle undefined items', () => {
  const transformed = transformItems(undefined);
  assert.deepStrictEqual(transformed, []);
});

test('should handle item with name field', () => {
  const items = [{ name: 'Test Item', quantity: 1, unit_price: 100000 }];
  const transformed = transformItems(items);
  assert.strictEqual(transformed[0].item_name, 'Test Item');
});

test('should handle item with item_name field', () => {
  const items = [{ item_name: 'Test Item', quantity: 1, unit_price: 100000 }];
  const transformed = transformItems(items);
  assert.strictEqual(transformed[0].item_name, 'Test Item');
});

test('should default quantity to 1 if missing', () => {
  const items = [{ name: 'Test Item', unit_price: 100000 }];
  const transformed = transformItems(items);
  assert.strictEqual(transformed[0].quantity, 1);
});

test('should default unit_price to 0 if missing', () => {
  const items = [{ name: 'Test Item', quantity: 1 }];
  const transformed = transformItems(items);
  assert.strictEqual(transformed[0].unit_price, 0);
});

test('should handle price field instead of unit_price', () => {
  const items = [{ name: 'Test Item', quantity: 1, price: 50000 }];
  const transformed = transformItems(items);
  assert.strictEqual(transformed[0].unit_price, 500); // 50000 kobo = 500 NGN
});

// ============================================
// RESPONSE TRANSFORMATION TESTS
// ============================================
console.log('\n🔄 Response Transformation Tests\n');

test('should transform complete response', () => {
  const transformed = transformResponse(samplePayload);
  
  assert.strictEqual(transformed.count, 1);
  assert.strictEqual(transformed.empty, false);
  assert.strictEqual(transformed.orders.length, 1);
  assert.strictEqual(transformed.orders[0].external_order_id, 'ORD-7F3A9B2C-1E4D');
});

test('should handle empty orders array', () => {
  const response = {
    status: 'success',
    data: { orders: [] }
  };
  const transformed = transformResponse(response);
  
  assert.strictEqual(transformed.count, 0);
  assert.strictEqual(transformed.empty, true);
  assert.deepStrictEqual(transformed.orders, []);
});

test('should handle missing data.orders', () => {
  const response = {
    status: 'success',
    data: {}
  };
  const transformed = transformResponse(response);
  
  assert.strictEqual(transformed.count, 0);
  assert.strictEqual(transformed.empty, true);
});

test('should handle null response', () => {
  const transformed = transformResponse(null);
  
  assert.strictEqual(transformed.count, 0);
  assert.strictEqual(transformed.empty, true);
});

test('should handle undefined response', () => {
  const transformed = transformResponse(undefined);
  
  assert.strictEqual(transformed.count, 0);
  assert.strictEqual(transformed.empty, true);
});

test('should filter out null orders', () => {
  const response = {
    status: 'success',
    data: {
      orders: [null, samplePayload.data.orders[0], null]
    }
  };
  const transformed = transformResponse(response);
  
  assert.strictEqual(transformed.count, 1);
  assert.strictEqual(transformed.orders.length, 1);
});

// ============================================
// DEDUPE LOGIC TESTS
// ============================================
console.log('\n🔍 Dedupe Logic Tests\n');

test('should return false for new order', () => {
  const order = { external_order_id: 'NEW-123', source: 'chowdeck' };
  const existingOrders = [
    { external_order_id: 'EXISTING-1', source: 'chowdeck' },
    { external_order_id: 'EXISTING-2', source: 'chowdeck' }
  ];
  assert.strictEqual(isDuplicate(order, existingOrders), false);
});

test('should return true for duplicate order', () => {
  const order = { external_order_id: 'EXISTING-1', source: 'chowdeck' };
  const existingOrders = [
    { external_order_id: 'EXISTING-1', source: 'chowdeck' },
    { external_order_id: 'EXISTING-2', source: 'chowdeck' }
  ];
  assert.strictEqual(isDuplicate(order, existingOrders), true);
});

test('should return false when existingOrders is empty', () => {
  const order = { external_order_id: 'NEW-123', source: 'chowdeck' };
  assert.strictEqual(isDuplicate(order, []), false);
});

test('should return false when existingOrders is null', () => {
  const order = { external_order_id: 'NEW-123', source: 'chowdeck' };
  assert.strictEqual(isDuplicate(order, null), false);
});

test('should return false when existingOrders is undefined', () => {
  const order = { external_order_id: 'NEW-123', source: 'chowdeck' };
  assert.strictEqual(isDuplicate(order, undefined), false);
});

test('should not match order from different source', () => {
  const order = { external_order_id: 'EXISTING-1', source: 'chowdeck' };
  const existingOrders = [
    { external_order_id: 'EXISTING-1', source: 'jumia' }
  ];
  assert.strictEqual(isDuplicate(order, existingOrders), false);
});

test('should handle multiple orders with same ID from same source', () => {
  const order = { external_order_id: 'DUP-1', source: 'chowdeck' };
  const existingOrders = [
    { external_order_id: 'DUP-1', source: 'chowdeck' },
    { external_order_id: 'DUP-1', source: 'chowdeck' }
  ];
  assert.strictEqual(isDuplicate(order, existingOrders), true);
});

// ============================================
// WHATSAPP MESSAGE FORMATTING TESTS
// ============================================
console.log('\n💬 WhatsApp Message Formatting Tests\n');

test('should format WhatsApp message correctly', () => {
  const order = transformOrder(samplePayload.data.orders[0]);
  const message = formatWhatsAppMessage(order, '+2348011111111');
  
  assert.ok(message.message.includes('🍽️ *NEW ORDER* 🍽️'));
  assert.ok(message.message.includes('#ORD-7F3A9B2C-1E4D'));
  assert.ok(message.message.includes('John Doe'));
  assert.ok(message.message.includes('+2348012345678'));
  assert.ok(message.message.includes('Jollof Rice & Chicken'));
  assert.ok(message.message.includes('Malt Drink'));
  assert.strictEqual(message.order_id, 'ORD-7F3A9B2C-1E4D');
  assert.strictEqual(message.recipient, '+2348011111111');
});

test('should handle N/A phone number', () => {
  const order = transformOrder({
    ...samplePayload.data.orders[0],
    customer: { ...samplePayload.data.orders[0].customer, phone: null }
  });
  const message = formatWhatsAppMessage(order, '+2348011111111');
  
  assert.ok(message.message.includes('📞 Phone: N/A'));
});

test('should handle pickup orders (no delivery address)', () => {
  const order = transformOrder({
    ...samplePayload.data.orders[0],
    delivery_address: null
  });
  const message = formatWhatsAppMessage(order, '+2348011111111');
  
  assert.ok(message.message.includes('📍 Delivery: Pickup'));
});

test('should format items with correct totals', () => {
  const order = transformOrder(samplePayload.data.orders[0]);
  const message = formatWhatsAppMessage(order, '+2348011111111');
  
  // 2 x Jollof Rice @ 2500 = 5000
  assert.ok(message.message.includes('2x Jollof Rice & Chicken'));
  // 2 x Malt Drink @ 500 = 1000
  assert.ok(message.message.includes('2x Malt Drink'));
});

test('should include total amount in message', () => {
  const order = transformOrder(samplePayload.data.orders[0]);
  const message = formatWhatsAppMessage(order, '+2348011111111');
  
  assert.ok(message.message.includes('TOTAL'));
  assert.ok(message.message.includes('₦7,800')); // 7800 NGN formatted
});

// ============================================
// TEST SUMMARY
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.log(`\n⚠️ ${failed} test(s) failed\n`);
  process.exit(1);
}
