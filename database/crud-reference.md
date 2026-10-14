# Bake & Brew POS — Prisma Client CRUD Reference

> **Notice:** This document contains standalone, copy-pasteable Prisma Client usage examples for your future backend (Express, Fastify, Next.js, or NestJS). It contains **no server framework code**—only pure Prisma ORM queries.

---

## 1. Setup & Initialization

In your future backend files:
```javascript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```

---

## 2. Product CRUD Examples

### 2.1 CREATE Product
Creates a new product (either sold by piece or sold by weight).
> **Validation Note:** Prisma does not enforce check constraints directly. Your backend controller must assert that `price > 0`, `stockQty >= 0`, and if `sellBy === 'WEIGHT'`, `unit === 'kg'`.

```javascript
// Example A: Create a Piece-based product (e.g. Garlic Herb Focaccia)
const newPieceProduct = await prisma.product.create({
  data: {
    code: 'BRD-005',
    name: 'Garlic Herb Focaccia',
    description: 'Fresh rosemary and roasted garlic flatbread',
    imageUrl: 'https://example.com/focaccia.jpg',
    categoryId: 2, // Breads & Buns
    sellBy: 'PIECE',
    unit: 'pc',
    price: 85.00,
    gstRate: 12,
    stockQty: 25.000,
    lowStockLevel: 5.000,
    isActive: true,
  },
  include: {
    category: true,
  },
});

// Example B: Create a Weight-based product (e.g. Plum Cake sold per kg)
const newWeightProduct = await prisma.product.create({
  data: {
    code: 'CAK-006',
    name: 'Rich Plum Cake',
    description: 'Dry fruits and spiced seasonal cake',
    categoryId: 4, // Cakes & Pastries
    sellBy: 'WEIGHT',
    unit: 'kg',
    price: 450.00, // Price per kg
    gstRate: 12,
    stockQty: 18.500, // In stock: 18.5 kg
    lowStockLevel: 3.000,
    isActive: true,
  },
});
```

---

### 2.2 READ Product(s)

```javascript
// Find a single product by unique barcode / SKU code
const product = await prisma.product.findUnique({
  where: { code: 'TEA-001' },
  include: { category: true },
});

// Get all active products for the POS catalog, grouped or filtered by Category
const activeCatalog = await prisma.product.findMany({
  where: {
    isActive: true,
  },
  orderBy: [
    { category: { sortOrder: 'asc' } },
    { name: 'asc' },
  ],
  include: {
    category: {
      select: { id: true, name: true },
    },
  },
});

// Search products by name or code (case-insensitive search)
const searchResults = await prisma.product.findMany({
  where: {
    isActive: true,
    OR: [
      { name: { contains: 'Chai' } },
      { code: { contains: 'TEA' } },
    ],
  },
});

// Find products running low on stock (stockQty <= lowStockLevel)
// Note: Handled in SQL or by comparing fields
const lowStockProducts = await prisma.$queryRaw`
  SELECT id, code, name, stockQty, lowStockLevel, unit 
  FROM products 
  WHERE isActive = 1 AND stockQty <= lowStockLevel
`;
```

---

### 2.3 UPDATE Product

```javascript
// Update price, stock count, and description
const updatedProduct = await prisma.product.update({
  where: { code: 'CAK-001' },
  data: {
    price: 650.00, // New price per kg
    stockQty: 22.500, // Updated stock in kg
    description: 'Updated recipe with Belgian chocolate curls',
  },
});

// Atomic Stock Decrement after a sale (using Prisma decrement helper)
await prisma.product.update({
  where: { id: 1 },
  data: {
    stockQty: {
      decrement: 0.500, // Deducts 500 grams or whole piece count
    },
  },
});
```

---

### 2.4 DELETE / ARCHIVE Product
Because historical `BillItem` records reference `Product` with `onDelete: Restrict`, hard-deleting a product that was previously billed will throw a foreign key error (`P2003`).

```javascript
// RECOMMENDED: Soft-delete (Archive) so past invoices remain valid
const archivedProduct = await prisma.product.update({
  where: { id: 5 },
  data: { isActive: false },
});

// HARD DELETE (Only succeeds if product was NEVER sold in any bill)
try {
  await prisma.product.delete({
    where: { id: 99 },
  });
  console.log('Product deleted cleanly.');
} catch (error) {
  if (error.code === 'P2003') {
    console.warn('Cannot hard-delete product with existing bills. Archive it instead by setting isActive = false.');
  } else {
    throw error;
  }
}
```

---

## 3. Bill & BillItem CRUD Examples

### 3.1 CREATE Bill with Nested BillItems (Atomic Transaction)
When creating a bill, snapshot the product's name, unit, unitPrice, and gstRate at the exact moment of checkout. This protects invoice accuracy against future price edits.

```javascript
// Sample Checkout: 2 cups Cutting Chai (Piece) + 0.500 kg Black Forest Cake (Weight)
const newBill = await prisma.bill.create({
  data: {
    billNo: 'BB-' + Date.now().toString().slice(-6),
    sessionId: 1,      // Active DaySession ID
    cashierId: 3,      // Staff ID of the cashier
    status: 'PAID',
    subtotal: 330.00,
    discountAmount: 10.00,
    discountNote: 'Regular customer discount',
    cgst: 18.75,
    sgst: 18.75,
    totalAmount: 357.50, // (330 - 10) + 18.75 + 18.75
    paymentMode: 'UPI',
    amountReceived: 357.50,
    changeReturned: 0.00,
    paidAt: new Date(),
    
    // Nested Create for BillItems
    items: {
      create: [
        {
          productId: 1,
          productName: 'Cutting Chai', // Snapshot
          unit: 'cup',                 // Snapshot
          sellBy: 'PIECE',             // Snapshot
          unitPrice: 15.00,            // Snapshot
          gstRate: 5,                  // Snapshot
          qty: 2,
          weightKg: null,
          lineDiscount: 0.00,
          lineTotal: 31.50,
        },
        {
          productId: 11,
          productName: 'Black Forest Cake', // Snapshot
          unit: 'kg',                       // Snapshot
          sellBy: 'WEIGHT',                 // Snapshot
          unitPrice: 600.00,                // Snapshot
          gstRate: 12,                      // Snapshot
          qty: null,
          weightKg: 0.500,
          lineDiscount: 0.00,
          lineTotal: 336.00,
        },
      ],
    },
  },
  include: {
    items: true,
    cashier: {
      select: { id: true, name: true, role: true },
    },
    session: true,
  },
});
```

---

### 3.2 READ Bill(s) & Invoices

```javascript
// Fetch complete bill details with items and cashier for receipt printout
const billDetails = await prisma.bill.findUnique({
  where: { billNo: 'BB-261014-001' },
  include: {
    items: true,
    cashier: {
      select: { id: true, name: true },
    },
    session: {
      select: { id: true, openedAt: true, status: true },
    },
  },
});

// Fetch sales report list with date range filter and pagination
const billsReport = await prisma.bill.findMany({
  where: {
    createdAt: {
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lte: new Date('2026-10-31T23:59:59.999Z'),
    },
    status: 'PAID', // Exclude VOIDED or HELD bills
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
  skip: 0,
  include: {
    items: true,
    cashier: { select: { name: true } },
  },
});

// Aggregated totals for Day Close / Z-Report
const salesSummary = await prisma.bill.aggregate({
  where: {
    sessionId: 1,
    status: 'PAID',
  },
  _sum: {
    subtotal: true,
    discountAmount: true,
    cgst: true,
    sgst: true,
    totalAmount: true,
  },
  _count: {
    id: true,
  },
});
```

---

### 3.3 UPDATE Bill (e.g. Voiding a Bill with AuditLog)
A manager or cashier voids a bill. This must be an atomic transaction updating the bill status and logging the audit event.

```javascript
const billIdToVoid = 1;
const managerStaffId = 2;
const reason = 'Customer changed mind before preparation';

const [voidedBill, log] = await prisma.$transaction([
  // 1. Mark the bill as VOIDED
  prisma.bill.update({
    where: { id: billIdToVoid },
    data: {
      status: 'VOIDED',
      voidReason: reason,
      voidedById: managerStaffId,
    },
  }),

  // 2. Insert tamper-proof audit log entry
  prisma.auditLog.create({
    data: {
      staffId: managerStaffId,
      action: 'BILL_VOIDED',
      entity: 'Bill',
      entityId: String(billIdToVoid),
      details: {
        reason: reason,
        voidedAt: new Date().toISOString(),
      },
    },
  }),
]);
```

---

### 3.4 DELETE Bill (Cascades to BillItems)
Because `BillItem.bill` is configured with `onDelete: Cascade`, deleting a bill automatically deletes all of its line items in a single operation.

```javascript
// Deleting a bill also deletes all associated bill_items rows
const deletedBill = await prisma.bill.delete({
  where: { id: 10 },
  include: {
    items: true, // Returns items that were removed
  },
});
```

---

## 4. BillItem CRUD (Direct Line Item Operations)

### 4.1 CREATE BillItem (Adding item to an open / held order)
```javascript
const addedItem = await prisma.billItem.create({
  data: {
    billId: 1,
    productId: 2, // Masala Chai
    productName: 'Masala Chai',
    unit: 'cup',
    sellBy: 'PIECE',
    unitPrice: 20.00,
    gstRate: 5,
    qty: 1,
    lineTotal: 21.00,
  },
});
```

### 4.2 READ BillItem(s) (e.g., Top-selling items analytics)
```javascript
// Find top sold products by frequency
const topSellingItems = await prisma.billItem.groupBy({
  by: ['productId', 'productName'],
  _sum: {
    qty: true,
    weightKg: true,
    lineTotal: true,
  },
  orderBy: {
    _sum: {
      lineTotal: 'desc',
    },
  },
  take: 10,
});
```

### 4.3 UPDATE BillItem (Updating quantity or line discount)
```javascript
const updatedItem = await prisma.billItem.update({
  where: { id: 15 },
  data: {
    qty: 3,
    lineTotal: 63.00,
  },
});
```

### 4.4 DELETE BillItem (Removing an item from a held order)
```javascript
const removedItem = await prisma.billItem.delete({
  where: { id: 15 },
});
```
