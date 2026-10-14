// =============================================================================
// Bake & Brew POS — Prisma Database Seed Script
// Populates default roles, categories, 20+ bakery products, shop settings,
// an active DaySession, and a sample PAID bill (1 weight item + 1 piece item).
// =============================================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Bake & Brew database seed...');

  // ---------------------------------------------------------------------------
  // 1. CLEANUP (Idempotent: deletes in order respecting foreign keys)
  // ---------------------------------------------------------------------------
  await prisma.auditLog.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.daySession.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.shopSetting.deleteMany();

  // ---------------------------------------------------------------------------
  // 2. STAFF SEEDING (Hashed PINs with bcrypt)
  // ---------------------------------------------------------------------------
  console.log('👤 Seeding Staff...');
  const salt = bcrypt.genSaltSync(10);

  const owner = await prisma.staff.create({
    data: {
      name: 'Karthik Raja',
      role: 'OWNER',
      pinHash: bcrypt.hashSync('0000', salt),
      isActive: true,
    },
  });

  const manager = await prisma.staff.create({
    data: {
      name: 'Suresh Kumar',
      role: 'MANAGER',
      pinHash: bcrypt.hashSync('4321', salt),
      isActive: true,
    },
  });

  const cashier = await prisma.staff.create({
    data: {
      name: 'Raju',
      role: 'CASHIER',
      pinHash: bcrypt.hashSync('1234', salt),
      isActive: true,
    },
  });

  // ---------------------------------------------------------------------------
  // 3. CATEGORIES SEEDING (8 Core Bakery Categories)
  // ---------------------------------------------------------------------------
  console.log('🏷️  Seeding Categories...');
  const categoryDefs = [
    { name: 'Tea & Coffee', sortOrder: 1 },
    { name: 'Breads & Buns', sortOrder: 2 },
    { name: 'Savouries & Puffs', sortOrder: 3 },
    { name: 'Cakes & Pastries', sortOrder: 4 },
    { name: 'Muffins & Brownies', sortOrder: 5 },
    { name: 'Cookies & Biscuits', sortOrder: 6 },
    { name: 'Snacks', sortOrder: 7 },
    { name: 'Sweets', sortOrder: 8 },
  ];

  const catMap = {};
  for (const c of categoryDefs) {
    const created = await prisma.category.create({ data: c });
    catMap[c.name] = created.id;
  }

  // ---------------------------------------------------------------------------
  // 4. PRODUCTS SEEDING (20+ Bakery & Tea Stall Items)
  // ---------------------------------------------------------------------------
  console.log('🥐 Seeding Products...');
  const productDefs = [
    // Tea & Coffee (5% GST, Sold by piece/cup)
    {
      code: 'TEA-001',
      name: 'Cutting Chai',
      description: 'Traditional Mumbai spiced milk tea brewed with crushed ginger & cardamom',
      imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 15.00,
      gstRate: 5,
      stockQty: 200.000,
      lowStockLevel: 20.000,
    },
    {
      code: 'TEA-002',
      name: 'Masala Chai',
      description: 'Fragrant blend of whole spices slow-steeped with premium Assam CTC tea',
      imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 20.00,
      gstRate: 5,
      stockQty: 180.000,
      lowStockLevel: 20.000,
    },
    {
      code: 'TEA-003',
      name: 'Ginger Tea',
      description: 'Hot revitalizing milk tea infused with freshly grated mountain ginger',
      imageUrl: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 20.00,
      gstRate: 5,
      stockQty: 150.000,
      lowStockLevel: 15.000,
    },
    {
      code: 'COF-001',
      name: 'Black Coffee',
      description: 'Dark roasted single-origin Arabica pour-over black coffee',
      imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 30.00,
      gstRate: 5,
      stockQty: 120.000,
      lowStockLevel: 15.000,
    },
    {
      code: 'COF-002',
      name: 'Filter Coffee',
      description: 'Authentic South Indian chicory-blend decoction with frothy steamed milk',
      imageUrl: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 35.00,
      gstRate: 5,
      stockQty: 160.000,
      lowStockLevel: 20.000,
    },
    {
      code: 'TEA-004',
      name: 'Lemon Tea',
      description: 'Organic black tea steeped with freshly squeezed lemon juice and raw honey',
      imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Tea & Coffee'],
      sellBy: 'PIECE',
      unit: 'cup',
      price: 25.00,
      gstRate: 5,
      stockQty: 100.000,
      lowStockLevel: 10.000,
    },

    // Breads & Buns (5% / 12% GST, Sold by piece/pkt)
    {
      code: 'BRD-001',
      name: 'White Bread',
      description: 'Classic soft white sandwich loaf baked fresh every morning',
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Breads & Buns'],
      sellBy: 'PIECE',
      unit: 'pkt',
      price: 40.00,
      gstRate: 5,
      stockQty: 50.000,
      lowStockLevel: 8.000,
    },
    {
      code: 'BRD-002',
      name: 'Brown Bread',
      description: '100% whole wheat high-fiber bread with toasted sesame crust',
      imageUrl: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Breads & Buns'],
      sellBy: 'PIECE',
      unit: 'pkt',
      price: 50.00,
      gstRate: 5,
      stockQty: 40.000,
      lowStockLevel: 8.000,
    },
    {
      code: 'BRD-003',
      name: 'Garlic Herb Focaccia',
      description: 'Ligurian extra virgin olive oil flatbread topped with roasted garlic & rosemary',
      imageUrl: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Breads & Buns'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 85.00,
      gstRate: 12,
      stockQty: 25.000,
      lowStockLevel: 5.000,
    },
    {
      code: 'BRD-004',
      name: 'Pav (6pc)',
      description: 'Fresh golden butter-soft Indian bakery slider rolls',
      imageUrl: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Breads & Buns'],
      sellBy: 'PIECE',
      unit: 'pkt',
      price: 30.00,
      gstRate: 5,
      stockQty: 60.000,
      lowStockLevel: 10.000,
    },

    // Cakes & Pastries (12% GST, Weight items priced per kg, Pastries per pc)
    {
      code: 'CAK-001',
      name: 'Black Forest Cake',
      description: 'Signature cherry compote, dark chocolate curls & Chantilly cream',
      imageUrl: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cakes & Pastries'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 600.00,
      gstRate: 12,
      stockQty: 15.000,
      lowStockLevel: 3.000,
    },
    {
      code: 'CAK-002',
      name: 'Vanilla Cake',
      description: 'Madagascar vanilla bean sponge layered with silky buttercream frosting',
      imageUrl: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cakes & Pastries'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 500.00,
      gstRate: 12,
      stockQty: 12.000,
      lowStockLevel: 2.500,
    },
    {
      code: 'CAK-003',
      name: 'Plum Cake',
      description: 'Aged dry fruit cake enriched with candied orange peel & festive winter spices',
      imageUrl: 'https://images.unsplash.com/photo-1605807646983-377bc7a76543?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cakes & Pastries'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 450.00,
      gstRate: 12,
      stockQty: 20.000,
      lowStockLevel: 4.000,
    },
    {
      code: 'CAK-004',
      name: 'Chocolate Pastry',
      description: 'Rich Dutch cocoa sponge topped with velvety dark chocolate ganache',
      imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cakes & Pastries'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 45.00,
      gstRate: 12,
      stockQty: 30.000,
      lowStockLevel: 5.000,
    },
    {
      code: 'CAK-005',
      name: 'Pineapple Pastry',
      description: 'Light vanilla sponge layered with whipped cream and candied pineapple chunks',
      imageUrl: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cakes & Pastries'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 40.00,
      gstRate: 12,
      stockQty: 25.000,
      lowStockLevel: 5.000,
    },

    // Muffins & Brownies (12% GST)
    {
      code: 'MUF-001',
      name: 'Walnut Fudge Brownie',
      description: 'Dense dark chocolate fudge square studded with roasted Californian walnuts',
      imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Muffins & Brownies'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 65.00,
      gstRate: 12,
      stockQty: 35.000,
      lowStockLevel: 6.000,
    },
    {
      code: 'MUF-002',
      name: 'Blueberry Crumble Muffin',
      description: 'Moist vanilla cake muffin loaded with wild blueberries and butter streusel',
      imageUrl: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Muffins & Brownies'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 55.00,
      gstRate: 12,
      stockQty: 28.000,
      lowStockLevel: 5.000,
    },

    // Cookies & Biscuits (12% GST, Weight items)
    {
      code: 'COK-001',
      name: 'Butter Cookies',
      description: 'Melt-in-mouth golden cookies baked with pure unsalted dairy butter',
      imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cookies & Biscuits'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 400.00,
      gstRate: 12,
      stockQty: 18.000,
      lowStockLevel: 3.000,
    },
    {
      code: 'COK-002',
      name: 'Nankhatai',
      description: 'Traditional cardamom & roasted almond shortbread cookies',
      imageUrl: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Cookies & Biscuits'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 350.00,
      gstRate: 12,
      stockQty: 14.000,
      lowStockLevel: 2.500,
    },

    // Snacks & Savouries (5% GST)
    {
      code: 'SNK-001',
      name: 'Samosa',
      description: 'Crispy golden triangular pastry stuffed with spicy cumin potatoes & peas',
      imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Snacks'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 20.00,
      gstRate: 5,
      stockQty: 80.000,
      lowStockLevel: 15.000,
    },
    {
      code: 'SNK-002',
      name: 'Vada Pav',
      description: 'Golden spiced potato vada inside fresh pav with garlic chutney & fried green chili',
      imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Snacks'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 25.00,
      gstRate: 5,
      stockQty: 60.000,
      lowStockLevel: 10.000,
    },
    {
      code: 'SNK-003',
      name: 'Bun Maska',
      description: 'Warm toasted crusty bun slathered with whipped salted Amul butter',
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Snacks'],
      sellBy: 'PIECE',
      unit: 'pc',
      price: 30.00,
      gstRate: 5,
      stockQty: 50.000,
      lowStockLevel: 8.000,
    },

    // Sweets (5% GST, Weight items)
    {
      code: 'SWT-001',
      name: 'Gulab Jamun',
      description: 'Soft golden milk dumplings steeped in warm rosewater and saffron sugar syrup',
      imageUrl: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Sweets'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 500.00,
      gstRate: 5,
      stockQty: 10.000,
      lowStockLevel: 2.000,
    },
    {
      code: 'SWT-002',
      name: 'Jalebi',
      description: 'Crisp fried spirals soaked in aromatic saffron-cardamom syrup',
      imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      categoryId: catMap['Sweets'],
      sellBy: 'WEIGHT',
      unit: 'kg',
      price: 400.00,
      gstRate: 5,
      stockQty: 8.000,
      lowStockLevel: 1.500,
    },
  ];

  const productMap = {};
  for (const p of productDefs) {
    const created = await prisma.product.create({ data: p });
    productMap[p.code] = created;
  }

  // ---------------------------------------------------------------------------
  // 5. SHOP SETTING (Single Row)
  // ---------------------------------------------------------------------------
  console.log('⚙️  Seeding Shop Settings...');
  await prisma.shopSetting.create({
    data: {
      shopName: 'Bake & Brew',
      address: '42, MG Road, Anna Nagar, Chennai - 600040, Tamil Nadu',
      phone: '+91 98765 43210',
      gstin: '33AABCU9603R1ZM',
      receiptFooter: 'நன்றி! மீண்டும் வருக! / Thank you, visit again!',
      printerWidth: 80,
    },
  });

  // ---------------------------------------------------------------------------
  // 6. DAY SESSIONS (Yesterday CLOSED + Today OPEN)
  // ---------------------------------------------------------------------------
  console.log('🌙 Seeding Day Sessions (Closed session for yesterday + Open session for today)...');
  
  const yesterdayOpen = new Date();
  yesterdayOpen.setDate(yesterdayOpen.getDate() - 1);
  yesterdayOpen.setHours(7, 30, 0, 0);

  const yesterdayClose = new Date();
  yesterdayClose.setDate(yesterdayClose.getDate() - 1);
  yesterdayClose.setHours(22, 15, 0, 0);

  // Closed Session: Demonstrates a 100% completed day session with zero null fields
  const closedSession = await prisma.daySession.create({
    data: {
      openedAt: yesterdayOpen,
      closedAt: yesterdayClose,
      openedById: cashier.id,
      closedById: manager.id,
      openingCash: 1000.00,
      closingCash: 4850.00,
      status: 'CLOSED',
      totalSales: 3850.00,
      totalBills: 12,
      itemsSold: 16.500,
      discountsGiven: 80.00,
      cgst: 105.00,
      sgst: 105.00,
      voidedBills: 1,
    },
  });

  // Active Open Session for Today
  const activeSession = await prisma.daySession.create({
    data: {
      openedAt: new Date(),
      closedAt: null,
      openedById: cashier.id,
      closedById: null,
      openingCash: 1500.00,
      closingCash: 0.00,
      status: 'OPEN',
      totalSales: 0.00,
      totalBills: 0,
      itemsSold: 0.000,
      discountsGiven: 0.00,
      cgst: 0.00,
      sgst: 0.00,
      voidedBills: 0,
    },
  });

  // ---------------------------------------------------------------------------
  // 7. SAMPLE BILLS & LINE ITEMS (Demo values for all columns, zero NULLs)
  // ---------------------------------------------------------------------------
  console.log('🧾 Seeding Sample Bills with fully populated demo values...');

  // Item 1: Piece Item -> 2 cups Cutting Chai @ ₹15 = ₹30.00 (5% GST)
  const chaiProduct = productMap['TEA-001'];
  const chaiQty = 2;
  const chaiUnitPrice = 15.00;
  const chaiBase = chaiUnitPrice * chaiQty; // 30.00
  const chaiGst = 5;
  const chaiTax = chaiBase * (chaiGst / 100); // 1.50 (0.75 CGST + 0.75 SGST)
  const chaiTotal = chaiBase + chaiTax; // 31.50

  // Item 2: Weight Item -> 0.500 kg Black Forest Cake @ ₹600/kg = ₹300.00 (12% GST)
  const cakeProduct = productMap['CAK-001'];
  const cakeWeight = 0.500;
  const cakeUnitPrice = 600.00;
  const cakeBase = cakeUnitPrice * cakeWeight; // 300.00
  const cakeGst = 12;
  const cakeTax = cakeBase * (cakeGst / 100); // 36.00 (18.00 CGST + 18.00 SGST)
  const cakeTotal = cakeBase + cakeTax; // 336.00

  // Bill 1: PAID Bill with 2 items (Demo values filled for all columns)
  const billSubtotal = chaiBase + cakeBase; // 330.00
  const billDiscount = 10.00; // Demo discount
  const billCgst = (chaiTax / 2) + (cakeTax / 2); // 0.75 + 18.00 = 18.75
  const billSgst = (chaiTax / 2) + (cakeTax / 2); // 0.75 + 18.00 = 18.75
  const billGrandTotal = (billSubtotal - billDiscount) + billCgst + billSgst; // 320 + 37.50 = 357.50

  const sampleBill = await prisma.bill.create({
    data: {
      billNo: 'BB-261014-001',
      sessionId: activeSession.id,
      cashierId: cashier.id,
      status: 'PAID',
      subtotal: billSubtotal,
      discountAmount: billDiscount,
      discountNote: 'Regular customer loyalty discount',
      cgst: billCgst,
      sgst: billSgst,
      totalAmount: billGrandTotal,
      paymentMode: 'UPI',
      amountReceived: billGrandTotal,
      changeReturned: 0.00,
      voidReason: 'None',
      voidedById: null,
      createdAt: new Date(),
      paidAt: new Date(),
      items: {
        create: [
          {
            productId: chaiProduct.id,
            productName: chaiProduct.name,
            unit: chaiProduct.unit,
            sellBy: chaiProduct.sellBy,
            unitPrice: chaiProduct.price,
            gstRate: chaiProduct.gstRate,
            qty: chaiQty, // 2
            weightKg: 0.000, // Demo value: 0.000 kg instead of NULL
            lineDiscount: 0.00,
            lineTotal: chaiTotal,
          },
          {
            productId: cakeProduct.id,
            productName: cakeProduct.name,
            unit: cakeProduct.unit,
            sellBy: cakeProduct.sellBy,
            unitPrice: cakeProduct.price,
            gstRate: cakeProduct.gstRate,
            qty: 1, // Demo value: 1 pack/portion instead of NULL
            weightKg: cakeWeight, // 0.500 kg
            lineDiscount: 0.00,
            lineTotal: cakeTotal,
          },
        ],
      },
    },
  });

  // Bill 2: VOIDED Bill (Demonstrates voidReason and voidedById with demo values)
  const samosaProduct = productMap['SNK-001'];
  const samosaQty = 2;
  const samosaUnitPrice = 20.00;
  const samosaBase = samosaUnitPrice * samosaQty; // 40.00
  const samosaTax = samosaBase * 0.05; // 2.00
  const samosaTotal = samosaBase + samosaTax; // 42.00

  await prisma.bill.create({
    data: {
      billNo: 'BB-261014-002',
      sessionId: activeSession.id,
      cashierId: cashier.id,
      status: 'VOIDED',
      subtotal: samosaBase,
      discountAmount: 0.00,
      discountNote: 'None',
      cgst: 1.00,
      sgst: 1.00,
      totalAmount: samosaTotal,
      paymentMode: 'CASH',
      amountReceived: 50.00,
      changeReturned: 8.00,
      voidReason: 'Customer requested order cancellation before packing',
      voidedById: manager.id,
      createdAt: new Date(),
      paidAt: new Date(),
      items: {
        create: [
          {
            productId: samosaProduct.id,
            productName: samosaProduct.name,
            unit: samosaProduct.unit,
            sellBy: samosaProduct.sellBy,
            unitPrice: samosaProduct.price,
            gstRate: samosaProduct.gstRate,
            qty: samosaQty,
            weightKg: 0.000, // Demo value instead of NULL
            lineDiscount: 0.00,
            lineTotal: samosaTotal,
          },
        ],
      },
    },
  });

  // Update active session counters
  await prisma.daySession.update({
    where: { id: activeSession.id },
    data: {
      totalSales: billGrandTotal,
      totalBills: 1,
      itemsSold: chaiQty + cakeWeight, // 2.500
      discountsGiven: billDiscount,
      cgst: billCgst,
      sgst: billSgst,
      voidedBills: 1,
    },
  });

  // Initial stock count check row (fully populated)
  await prisma.stockCount.create({
    data: {
      productId: cakeProduct.id,
      countedQty: 14.500,
      systemQty: 14.500,
      difference: 0.000,
      countedById: cashier.id,
      note: 'Morning stock verification after first sale',
    },
  });

  // Initial audit log
  await prisma.auditLog.create({
    data: {
      staffId: owner.id,
      action: 'DATABASE_INITIALIZED',
      entity: 'System',
      entityId: '1',
      details: {
        version: '1.0.0',
        environment: 'XAMPP / MySQL',
        seededAt: new Date().toISOString(),
      },
    },
  });

  console.log(`✅ Seed completed successfully!`);
  console.log(`   Staff created: 3 (Owner PIN: 0000, Manager PIN: 4321, Cashier PIN: 1234)`);
  console.log(`   Categories created: ${categoryDefs.length}`);
  console.log(`   Products created: ${productDefs.length}`);
  console.log(`   DaySessions created: 2 (1 CLOSED yesterday + 1 OPEN today)`);
  console.log(`   Sample Bills created:`);
  console.log(`     - BB-261014-001 (PAID, 2 items, Total: ₹${billGrandTotal})`);
  console.log(`     - BB-261014-002 (VOIDED, 1 item, Total: ₹${samosaTotal})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
