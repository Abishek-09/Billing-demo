import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from './dexie.js';
import { getTodayStr, generateBillNumber } from '../utils/billNumber.js';
import { round2, calculateLineTax, calculateBillTotals } from '../utils/tax.js';

/**
 * Seeds the IndexedDB with comprehensive demo data for development.
 * Populates data for:
 * 1. Users & Passwords (Raju, Priya, Owner)
 * 2. Categories & Tax Rates
 * 3. Menu Items with high-res images & metadata
 * 4. Day Session for today
 * 5. Closed & Voided Bills with Bill Items (Day Close)
 * 6. Stock Ledger & Stock Counts (Stock Count menu)
 * 7. Outlet Configuration
 */
export async function seedDatabase(force = false) {
  const existingItems = await db.items.count();
  const existingBills = await db.bills.count();
  const sample = await db.items.toCollection().first();

  // Self-heal: Ensure all existing items in database have sellBy and a valid image_url
  const allCurrentDbItems = await db.items.toArray();
  if (allCurrentDbItems.length > 0) {
    const defaultImageMap = {
      'c-22222222-0001-0001-0001-000000000001': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=500&q=80', // Tea
      'c-22222222-0001-0001-0001-000000000002': 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=500&q=80', // Cold
      'c-22222222-0001-0001-0001-000000000003': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80', // Bread
      'c-22222222-0001-0001-0001-000000000004': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80', // Puff
      'c-22222222-0001-0001-0001-000000000005': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80', // Cake
      'c-22222222-0001-0001-0001-000000000006': 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80', // Muffin
      'c-22222222-0001-0001-0001-000000000007': 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80', // Cookie
      'c-22222222-0001-0001-0001-000000000008': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80', // Snack
      'c-22222222-0001-0001-0001-000000000009': 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=500&q=80', // Sweet
    };

    for (const it of allCurrentDbItems) {
      const updates = {};
      if (!it.sellBy) {
        updates.sellBy = it.item_type === 'weight' || it.unit === 'kg' ? 'weight' : 'piece';
      }
      if (!it.image_url || it.image_url.trim() === '') {
        updates.image_url = defaultImageMap[it.category_id] || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80';
      }
      if (Object.keys(updates).length > 0) {
        await db.items.update(it.id, updates);
      }
    }
  }

  // If already seeded with full demo data and force is false, skip
  if (!force && existingItems >= 45 && existingBills >= 5 && sample?.image_url && sample?.sellBy) {
    return;
  }

  console.log('[Seed] Seeding comprehensive demo data for all menus...');

  // Stable IDs for consistent relations
  const USER_IDS = {
    raju: 'u-11111111-0001-0001-0001-000000000001',
    priya: 'u-11111111-0001-0001-0001-000000000002',
    owner: 'u-11111111-0001-0001-0001-000000000003',
  };

  const CAT_IDS = {
    tea: 'c-22222222-0001-0001-0001-000000000001',
    cold: 'c-22222222-0001-0001-0001-000000000002',
    bread: 'c-22222222-0001-0001-0001-000000000003',
    puff: 'c-22222222-0001-0001-0001-000000000004',
    cake: 'c-22222222-0001-0001-0001-000000000005',
    muffin: 'c-22222222-0001-0001-0001-000000000006',
    cookie: 'c-22222222-0001-0001-0001-000000000007',
    snack: 'c-22222222-0001-0001-0001-000000000008',
    sweet: 'c-22222222-0001-0001-0001-000000000009',
  };

  const TAX_IDS = {
    noTax: 't-33333333-0001-0001-0001-000000000001',
    gst5: 't-33333333-0001-0001-0001-000000000002',
    gst12: 't-33333333-0001-0001-0001-000000000003',
    gst18: 't-33333333-0001-0001-0001-000000000004',
  };

  const todayStr = getTodayStr();
  const now = new Date();
  const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 30, 0);

  const formatTimeOffset = (minutes) => {
    return new Date(todayBase.getTime() + minutes * 60000).toISOString();
  };

  // 1. Users
  const users = [
    {
      id: USER_IDS.raju,
      name: 'Raju',
      pin_hash: bcrypt.hashSync('1234', 8),
      role: 'cashier',
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: USER_IDS.priya,
      name: 'Priya',
      pin_hash: bcrypt.hashSync('5678', 8),
      role: 'cashier',
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: USER_IDS.owner,
      name: 'Owner',
      pin_hash: bcrypt.hashSync('0000', 8),
      role: 'owner',
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
  ];

  // 2. Tax Rates
  const taxRates = [
    { id: TAX_IDS.noTax, label: 'No Tax', rate_pct: 0, hsn_sac: '', created_at: formatTimeOffset(-600) },
    { id: TAX_IDS.gst5, label: 'GST 5%', rate_pct: 5, hsn_sac: '2106', created_at: formatTimeOffset(-600) },
    { id: TAX_IDS.gst12, label: 'GST 12%', rate_pct: 12, hsn_sac: '1905', created_at: formatTimeOffset(-600) },
    { id: TAX_IDS.gst18, label: 'GST 18%', rate_pct: 18, hsn_sac: '2106', created_at: formatTimeOffset(-600) },
  ];

  // 3. Categories
  const categories = [
    { id: CAT_IDS.tea, name: 'Tea & Coffee', sort_order: 1, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.cold, name: 'Cold Beverages', sort_order: 2, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.bread, name: 'Breads & Buns', sort_order: 3, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.puff, name: 'Savouries & Puffs', sort_order: 4, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.cake, name: 'Cakes & Pastries', sort_order: 5, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.muffin, name: 'Muffins & Brownies', sort_order: 6, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.cookie, name: 'Cookies & Biscuits', sort_order: 7, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.snack, name: 'Snacks', sort_order: 8, active: 1, created_at: formatTimeOffset(-600) },
    { id: CAT_IDS.sweet, name: 'Sweets', sort_order: 9, active: 1, created_at: formatTimeOffset(-600) },
  ];

  // 4. Products / Items
  const items = [
    // Tea & Coffee (made-to-order)
    {
      id: 'i-001',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Cutting Chai',
      description: 'Traditional Mumbai spiced milk tea, brewed with ginger & cardamom',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 15,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-002',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Masala Chai',
      description: 'Fragrant blend of whole spices, slow-steeped Assam tea leaves',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 20,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-003',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Ginger Tea',
      description: 'Freshly crushed ginger root infused hot milk tea',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 20,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-004',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Black Coffee',
      description: 'Dark roasted single-origin Arabica pour-over coffee',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 30,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-005',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Filter Coffee',
      description: 'Authentic South Indian chicory-blend decoction with frothy milk',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 35,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-006',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Lemon Tea',
      description: 'Light organic black tea steeped with fresh lemon juice & honey',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 25,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Breads (packaged, barcoded)
    {
      id: 'i-007',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.noTax,
      tax_rate_pct: 0,
      name: 'White Bread',
      description: 'Classic soft white sandwich loaf baked fresh every morning',
      barcode: '8901234560011',
      item_type: 'unit',
      unit: 'pkt',
      price: 40,
      badge: '1 pkt',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-008',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.noTax,
      tax_rate_pct: 0,
      name: 'Brown Bread',
      description: '100% whole wheat high-fiber bread with toasted sesame crust',
      barcode: '8901234560012',
      item_type: 'unit',
      unit: 'pkt',
      price: 50,
      badge: '1 pkt',
      image_url: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-009',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.noTax,
      tax_rate_pct: 0,
      name: 'Milk Bread',
      description: 'Hokkaido-style pillowy soft sweet milk bread loaf',
      barcode: '8901234560013',
      item_type: 'unit',
      unit: 'pkt',
      price: 45,
      badge: '1 pkt',
      image_url: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-010',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Pav (6pc)',
      description: 'Fresh golden butter-soft Indian bakery slider rolls',
      barcode: '8901234560014',
      item_type: 'unit',
      unit: 'pkt',
      price: 30,
      badge: '6 pcs',
      image_url: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Cakes & Pastries
    {
      id: 'i-011',
      category_id: CAT_IDS.cake,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Chocolate Pastry',
      description: 'Rich Dutch cocoa sponge with velvety dark chocolate ganache',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 45,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-012',
      category_id: CAT_IDS.cake,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Pineapple Pastry',
      description: 'Light vanilla sponge layered with whipped cream and candied pineapple',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 40,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-013',
      category_id: CAT_IDS.cake,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Black Forest Cake',
      description: 'Signature cherry compote, dark chocolate curls & Chantilly cream',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 600,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-014',
      category_id: CAT_IDS.cake,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Vanilla Cake',
      description: 'Madagascar vanilla bean sponge with silky buttercream frosting',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 500,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-015',
      category_id: CAT_IDS.cake,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Plum Cake',
      description: 'Aged rum-soaked dry fruits, candied orange peel & aromatic winter spices',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 450,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1605807646983-377bc7a76543?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Cookies & Biscuits
    {
      id: 'i-016',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Butter Cookies',
      description: 'Melt-in-mouth golden cookies baked with pure unsalted dairy butter',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 400,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-017',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Nankhatai',
      description: 'Traditional cardamom & roasted almond shortbread cookies',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 350,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-018',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Khari Biscuit',
      description: 'Ultra flaky, multi-layered savory puff pastry biscuits',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 300,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-019',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Coconut Cookies',
      description: 'Crunchy golden cookies packed with toasted desiccated coconut',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 380,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Snacks
    {
      id: 'i-020',
      category_id: CAT_IDS.snack,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Samosa',
      description: 'Crispy golden triangular pastry stuffed with spicy cumin potatoes & peas',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 20,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-021',
      category_id: CAT_IDS.snack,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Vada Pav',
      description: 'Golden batata vada in soft pav with garlic chutney & fried chili',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 25,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-022',
      category_id: CAT_IDS.snack,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Bread Pakora',
      description: 'Spiced potato sandwich slice dipped in seasoned gram flour batter & crisp-fried',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 20,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-023',
      category_id: CAT_IDS.snack,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Bun Maska',
      description: 'Warm toasted crusty bun slathered with whipped salted butter',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 30,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Sweets
    {
      id: 'i-024',
      category_id: CAT_IDS.sweet,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Gulab Jamun',
      description: 'Soft golden milk dumplings steeped in warm rosewater and saffron sugar syrup',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 500,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-025',
      category_id: CAT_IDS.sweet,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Jalebi',
      description: 'Crisp spiral pretzels soaked in aromatic saffron-cardamom syrup',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 400,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-026',
      category_id: CAT_IDS.sweet,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Barfi',
      description: 'Rich pistachio & silver vark decorated creamy condensed milk fudge',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 550,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Additional Tea & Coffee
    {
      id: 'i-027',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Kulhad Chai',
      description: 'Slow-simmered special cardamom tea served in traditional earthen clay kulhad',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 25,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-028',
      category_id: CAT_IDS.tea,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Hot Chocolate',
      description: 'Rich velvety dark Belgian chocolate steamed with fresh full-cream milk',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 55,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Cold Beverages
    {
      id: 'i-029',
      category_id: CAT_IDS.cold,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Cold Coffee with Ice Cream',
      description: 'Chilled blended espresso shake topped with vanilla bean ice cream scoop',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 60,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-030',
      category_id: CAT_IDS.cold,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Iced Lemon Mint Tea',
      description: 'Crisp cold-brewed Assam black tea with crushed fresh mint & zesty lemon',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 40,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-031',
      category_id: CAT_IDS.cold,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Rose Milk',
      description: 'Chilled fragrant organic Damascus rose syrup blended with sweet chilled milk',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 40,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-032',
      category_id: CAT_IDS.cold,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Mango Lassi',
      description: 'Thick creamy churned yogurt sweetened with Alphonso mango pulp',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 50,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1570701564993-e00652af8aa7?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-033',
      category_id: CAT_IDS.cold,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Fresh Lime Soda',
      description: 'Sparkling soda pressed with freshly squeezed tart lime & rock salt',
      barcode: '',
      item_type: 'unit',
      unit: 'cup',
      price: 35,
      badge: '1 cup',
      image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Additional Breads & Buns
    {
      id: 'i-034',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.noTax,
      tax_rate_pct: 0,
      name: 'Sourdough Country Loaf',
      description: 'Naturally fermented 36-hour wild yeast artisan crusty sourdough loaf',
      barcode: '8901234560015',
      item_type: 'unit',
      unit: 'loaf',
      price: 120,
      badge: '1 loaf',
      image_url: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-035',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.noTax,
      tax_rate_pct: 0,
      name: 'Multigrain Bread',
      description: 'Hearty loaf with oats, flaxseed, chia, sunflower & pumpkin seeds',
      barcode: '8901234560016',
      item_type: 'unit',
      unit: 'pkt',
      price: 65,
      badge: '1 pkt',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-036',
      category_id: CAT_IDS.bread,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Garlic Herb Focaccia',
      description: 'Ligurian extra virgin olive oil flatbread with roasted garlic & rosemary',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 85,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Savouries & Puffs
    {
      id: 'i-037',
      category_id: CAT_IDS.puff,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Veg Puff',
      description: 'Multi-layered flaky golden puff pastry stuffed with spiced potato & carrot',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 25,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-038',
      category_id: CAT_IDS.puff,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Paneer Tikka Puff',
      description: 'Crisp buttery puff filled with marinated tandoori spiced cottage cheese',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 35,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-039',
      category_id: CAT_IDS.puff,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Egg Puff',
      description: 'Flaky baked pastry pocket with seasoned boiled egg half & caramelized onions',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 30,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-040',
      category_id: CAT_IDS.puff,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Cheese Garlic Toast',
      description: 'Toasted artisan bread with garlic herb butter and melted mozzarella',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 60,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=500&q=80',
      track_stock: 0,
      is_made_to_order: 1,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Muffins & Brownies
    {
      id: 'i-041',
      category_id: CAT_IDS.muffin,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Walnut Fudge Brownie',
      description: 'Dense dark chocolate fudge square studded with roasted Californian walnuts',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 65,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-042',
      category_id: CAT_IDS.muffin,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Blueberry Crumble Muffin',
      description: 'Moist vanilla cake muffin loaded with wild blueberries and butter streusel',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 55,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-043',
      category_id: CAT_IDS.muffin,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Choco Lava Cake',
      description: 'Warm cocoa sponge with an oozing warm melted chocolate center',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 70,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-044',
      category_id: CAT_IDS.muffin,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Red Velvet Cupcake',
      description: 'Crimson cocoa cupcake topped with whipped Madagascar cream cheese swirl',
      barcode: '',
      item_type: 'unit',
      unit: 'pc',
      price: 45,
      badge: '1 pc',
      image_url: 'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Additional Cookies & Biscuits
    {
      id: 'i-045',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Jeera Butter Biscuits',
      description: 'Crisp sweet and savory tea biscuits infused with roasted cumin seeds',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 340,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-046',
      category_id: CAT_IDS.cookie,
      tax_rate_id: TAX_IDS.gst12,
      tax_rate_pct: 12,
      name: 'Almond Biscotti',
      description: 'Twice-baked Italian crunchy dipping biscuits packed with whole toasted almonds',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 480,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },

    // Additional Sweets
    {
      id: 'i-047',
      category_id: CAT_IDS.sweet,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Kaju Katli',
      description: 'Diamond diamond-cut fudge made from premium Goan cashews & edible silver leaf',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 850,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
    {
      id: 'i-048',
      category_id: CAT_IDS.sweet,
      tax_rate_id: TAX_IDS.gst5,
      tax_rate_pct: 5,
      name: 'Motichoor Ladoo',
      description: 'Melt-in-mouth golden gram flour pearls fried in pure desi ghee with saffron',
      barcode: '',
      item_type: 'weight',
      unit: 'kg',
      price: 380,
      badge: 'By Weight',
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
      track_stock: 1,
      is_made_to_order: 0,
      active: 1,
      created_at: formatTimeOffset(-600),
      updated_at: formatTimeOffset(-600),
    },
  ];

  // 5. Outlet Config
  const config = [
    { key: 'shop_name', value: 'Bake & Brew', updated_at: formatTimeOffset(0) },
    { key: 'shop_address', value: '42, MG Road, Pune - 411001', updated_at: formatTimeOffset(0) },
    { key: 'shop_phone', value: '+91 98765 43210', updated_at: formatTimeOffset(0) },
    { key: 'gstin', value: '27AABCU9603R1ZM', updated_at: formatTimeOffset(0) },
    { key: 'fssai', value: '11521099000123', updated_at: formatTimeOffset(0) },
    { key: 'bill_prefix', value: 'BB', updated_at: formatTimeOffset(0) },
    { key: 'footer_message', value: 'Thank you! Visit again.', updated_at: formatTimeOffset(0) },
  ];

  // 6. Day Session (Active for today)
  const sessionId = 'session-demo-' + todayStr;
  const todaySession = {
    id: sessionId,
    opened_by: USER_IDS.raju,
    closed_by: null,
    date: todayStr,
    status: 'open',
    next_token: 13,
    next_bill_seq: 10,
    opened_at: formatTimeOffset(0), // 07:30 AM
    closed_at: null,
    z_report_json: null,
  };

  // 7. Initial Stock Ledger entries (Opening Stock)
  const openingStockEntries = items
    .filter(item => item.track_stock)
    .map(item => {
      const initialQty = item.item_type === 'weight' ? 15 : 60;
      return {
        id: `stock-opening-${item.id}`,
        item_id: item.id,
        day_session_id: sessionId,
        ref_type: 'opening_stock',
        ref_id: null,
        qty_change: initialQty,
        balance_after: initialQty,
        notes: 'Morning opening stock',
        created_at: formatTimeOffset(5),
      };
    });

  // 8. Demo Bills & Bill Items (Closed & Voided Sales)
  const demoBillsDef = [
    {
      billSeq: 1,
      offsetMins: 35, // 08:05 AM
      cashierId: USER_IDS.raju,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-002', qty: 2, weight: null, token: 1 }, // Masala Chai
        { itemId: 'i-020', qty: 2, weight: null, token: 2 }, // Samosa
      ],
    },
    {
      billSeq: 2,
      offsetMins: 55, // 08:25 AM
      cashierId: USER_IDS.raju,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-007', qty: 1, weight: null, token: null }, // White Bread
        { itemId: 'i-016', qty: 1, weight: 0.25, token: null }, // Butter Cookies (0.25kg)
      ],
    },
    {
      billSeq: 3,
      offsetMins: 80, // 08:50 AM
      cashierId: USER_IDS.priya,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-005', qty: 2, weight: null, token: 3 }, // Filter Coffee
        { itemId: 'i-023', qty: 2, weight: null, token: 4 }, // Bun Maska
      ],
    },
    {
      billSeq: 4,
      offsetMins: 110, // 09:20 AM
      cashierId: USER_IDS.raju,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-013', qty: 1, weight: 0.5, token: null }, // Black Forest Cake (0.5kg)
        { itemId: 'i-011', qty: 2, weight: null, token: null }, // Chocolate Pastry
      ],
    },
    {
      billSeq: 5,
      offsetMins: 145, // 09:55 AM
      cashierId: USER_IDS.priya,
      status: 'closed',
      discount: { type: 'percent', value: 10, preset: 'Regular 10%' },
      items: [
        { itemId: 'i-001', qty: 3, weight: null, token: 5 }, // Cutting Chai
        { itemId: 'i-021', qty: 3, weight: null, token: 6 }, // Vada Pav
        { itemId: 'i-017', qty: 1, weight: 0.2, token: null }, // Nankhatai (0.2kg)
      ],
    },
    {
      billSeq: 6,
      offsetMins: 175, // 10:25 AM
      cashierId: USER_IDS.raju,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-008', qty: 1, weight: null, token: null }, // Brown Bread
        { itemId: 'i-010', qty: 1, weight: null, token: null }, // Pav (6pc)
        { itemId: 'i-022', qty: 2, weight: null, token: 7 }, // Bread Pakora
      ],
    },
    {
      billSeq: 7,
      offsetMins: 200, // 10:50 AM
      cashierId: USER_IDS.priya,
      status: 'closed',
      discount: null,
      items: [
        { itemId: 'i-024', qty: 1, weight: 0.5, token: null }, // Gulab Jamun (0.5kg)
        { itemId: 'i-025', qty: 1, weight: 0.25, token: null }, // Jalebi (0.25kg)
        { itemId: 'i-002', qty: 2, weight: null, token: 8 }, // Masala Chai
      ],
    },
    {
      billSeq: 8,
      offsetMins: 220, // 11:10 AM
      cashierId: USER_IDS.raju,
      status: 'closed',
      discount: { type: 'percent', value: 20, preset: 'Staff 20%' },
      items: [
        { itemId: 'i-014', qty: 1, weight: 1.0, token: null }, // Vanilla Cake (1kg)
        { itemId: 'i-018', qty: 1, weight: 0.5, token: null }, // Khari Biscuit (0.5kg)
      ],
    },
    {
      billSeq: 9,
      offsetMins: 235, // 11:25 AM
      cashierId: USER_IDS.raju,
      status: 'voided',
      voidReason: 'Customer walked out before payment',
      voidedBy: USER_IDS.owner,
      discount: null,
      items: [
        { itemId: 'i-006', qty: 2, weight: null, token: 9 }, // Lemon Tea
        { itemId: 'i-012', qty: 1, weight: null, token: null }, // Pineapple Pastry
      ],
    },
  ];

  const bills = [];
  const billItems = [];
  const salesLedgerEntries = [];

  const stockTracker = {};
  for (const item of items) {
    if (item.track_stock) {
      stockTracker[item.id] = item.item_type === 'weight' ? 15 : 60;
    }
  }

  for (const def of demoBillsDef) {
    const billId = `bill-demo-${def.billSeq}`;
    const billNumber = generateBillNumber('BB', def.billSeq);
    const createdAt = formatTimeOffset(def.offsetMins);

    const calculatedLineItems = def.items.map((line, idx) => {
      const item = items.find(i => i.id === line.itemId);
      const isWeight = item.item_type === 'weight';
      const lineTotal = isWeight
        ? round2(item.price * line.weight)
        : round2(item.price * line.qty);

      const { cgst, sgst } = calculateLineTax(lineTotal, item.tax_rate_pct);

      return {
        id: `bi-${billId}-${idx + 1}`,
        bill_id: billId,
        item_id: item.id,
        category_id: item.category_id,
        name: item.name,
        item_type: item.item_type,
        unit: item.unit,
        price: item.price,
        quantity: isWeight ? 1 : line.qty,
        weight_kg: isWeight ? line.weight : null,
        line_total: lineTotal,
        tax_rate_pct: item.tax_rate_pct,
        cgst,
        sgst,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        is_made_to_order: item.is_made_to_order,
        token_number: line.token,
        image_url: item.image_url,
      };
    });

    const billTotals = calculateBillTotals(calculatedLineItems, def.discount);

    const billRecord = {
      id: billId,
      day_session_id: sessionId,
      cashier_id: def.cashierId,
      bill_number: billNumber,
      status: def.status,
      subtotal: billTotals.subtotal,
      discount_amount: billTotals.discount_amount,
      tax_total: billTotals.tax_total,
      grand_total: billTotals.grand_total,
      cgst_total: billTotals.cgst_total,
      sgst_total: billTotals.sgst_total,
      payment_mode: def.paymentMode || (def.billSeq % 3 === 0 ? 'card' : def.billSeq % 2 === 0 ? 'upi' : 'cash'),
      discount_type: def.discount?.type || null,
      discount_value: def.discount?.value || 0,
      discount_preset: def.discount?.preset || null,
      discount_by: def.discount ? def.cashierId : null,
      void_reason: def.status === 'voided' ? def.voidReason : null,
      voided_by: def.status === 'voided' ? def.voidedBy : null,
      voided_at: def.status === 'voided' ? formatTimeOffset(def.offsetMins + 2) : null,
      held_at: null,
      created_at: createdAt,
      synced_at: null,
    };

    bills.push(billRecord);
    billItems.push(...calculatedLineItems);

    // If bill was closed, decrement stock
    if (def.status === 'closed') {
      for (const line of calculatedLineItems) {
        const item = items.find(i => i.id === line.item_id);
        if (item?.track_stock) {
          const qtyChange = line.weight_kg ? -line.weight_kg : -line.quantity;
          const newBal = round2((stockTracker[item.id] || 0) + qtyChange);
          stockTracker[item.id] = newBal;

          salesLedgerEntries.push({
            id: `stock-sale-${billId}-${line.id}`,
            item_id: item.id,
            day_session_id: sessionId,
            ref_type: 'sale',
            ref_id: billId,
            qty_change: qtyChange,
            balance_after: newBal,
            notes: `Bill ${billNumber}`,
            created_at: createdAt,
          });
        }
      }
    }
  }

  // 9. Stock Counts (For Stock Count Menu)
  const stockCountEntries = [
    {
      id: `${sessionId}-i-007`, // White Bread
      item_id: 'i-007',
      day_session_id: sessionId,
      expected: round2(stockTracker['i-007'] || 59),
      actual: round2(stockTracker['i-007'] || 59),
      variance: 0,
      created_at: formatTimeOffset(210),
    },
    {
      id: `${sessionId}-i-011`, // Chocolate Pastry
      item_id: 'i-011',
      day_session_id: sessionId,
      expected: round2(stockTracker['i-011'] || 58),
      actual: round2((stockTracker['i-011'] || 58) - 1),
      variance: -1,
      created_at: formatTimeOffset(210),
    },
    {
      id: `${sessionId}-i-020`, // Samosa
      item_id: 'i-020',
      day_session_id: sessionId,
      expected: round2(stockTracker['i-020'] || 58),
      actual: round2(stockTracker['i-020'] || 58),
      variance: 0,
      created_at: formatTimeOffset(210),
    },
    {
      id: `${sessionId}-i-013`, // Black Forest Cake
      item_id: 'i-013',
      day_session_id: sessionId,
      expected: round2(stockTracker['i-013'] || 14.5),
      actual: round2(stockTracker['i-013'] || 14.5),
      variance: 0,
      created_at: formatTimeOffset(210),
    },
  ];

  // 10. Historical Closed Sessions & Past Bills (For multi-period reports & Z-report history)
  const historicalSessions = [];
  const historicalBills = [];
  const historicalBillItems = [];

  const toIsoDateOnly = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const pastConfigs = [
    { daysAgo: 1, billsCount: 6, openHour: 8, closeHour: 21 }, // Yesterday
    { daysAgo: 2, billsCount: 5, openHour: 8, closeHour: 21 }, // 2 days ago
    { daysAgo: 7, billsCount: 7, openHour: 8, closeHour: 22 }, // Last week same day
    { daysAgo: 8, billsCount: 5, openHour: 8, closeHour: 21 }, // Last week
  ];

  pastConfigs.forEach((cfg) => {
    const pastD = new Date(now);
    pastD.setDate(pastD.getDate() - cfg.daysAgo);
    const pDateStr = toIsoDateOnly(pastD);
    const pSessionId = `session-demo-${pDateStr}`;

    const openTime = new Date(pastD.getFullYear(), pastD.getMonth(), pastD.getDate(), cfg.openHour, 0, 0).toISOString();
    const closeTime = new Date(pastD.getFullYear(), pastD.getMonth(), pastD.getDate(), cfg.closeHour, 30, 0).toISOString();

    historicalSessions.push({
      id: pSessionId,
      opened_by: USER_IDS.raju,
      closed_by: USER_IDS.owner,
      date: pDateStr,
      status: 'closed',
      next_token: 20,
      next_bill_seq: cfg.billsCount + 1,
      opened_at: openTime,
      closed_at: closeTime,
      z_report_json: null,
    });

    for (let bSeq = 1; bSeq <= cfg.billsCount; bSeq++) {
      const bId = `bill-demo-${pDateStr}-${bSeq}`;
      const bNumber = `BB-${pDateStr.replace(/-/g, '').slice(2)}-${String(bSeq).padStart(3, '0')}`;
      const bHour = cfg.openHour + (bSeq * 1.8);
      const bTime = new Date(pastD.getFullYear(), pastD.getMonth(), pastD.getDate(), Math.floor(bHour), Math.round((bHour % 1) * 60), 0).toISOString();
      const isVoid = bSeq === cfg.billsCount && cfg.daysAgo === 1;

      const it1 = items[(bSeq * 3) % items.length];
      const it2 = items[(bSeq * 3 + 1) % items.length];
      const isWeight1 = it1.item_type === 'weight';
      const isWeight2 = it2.item_type === 'weight';
      const qty1 = isWeight1 ? 1 : 2;
      const weight1 = isWeight1 ? 0.5 : null;
      const lineTotal1 = isWeight1 ? round2(it1.price * 0.5) : round2(it1.price * 2);
      const { cgst: cgst1, sgst: sgst1 } = calculateLineTax(lineTotal1, it1.tax_rate_pct);

      const qty2 = isWeight2 ? 1 : 1;
      const weight2 = isWeight2 ? 0.25 : null;
      const lineTotal2 = isWeight2 ? round2(it2.price * 0.25) : round2(it2.price * 1);
      const { cgst: cgst2, sgst: sgst2 } = calculateLineTax(lineTotal2, it2.tax_rate_pct);

      const subtotal = round2(lineTotal1 + lineTotal2);
      const discountAmount = bSeq % 2 === 0 ? round2(subtotal * 0.1) : 0;
      const cgst = round2((cgst1 + cgst2) * (discountAmount > 0 ? 0.9 : 1));
      const sgst = round2((sgst1 + sgst2) * (discountAmount > 0 ? 0.9 : 1));
      const grandTotal = round2(subtotal - discountAmount + cgst + sgst);

      historicalBills.push({
        id: bId,
        day_session_id: pSessionId,
        cashier_id: bSeq % 2 === 0 ? USER_IDS.priya : USER_IDS.raju,
        bill_number: bNumber,
        status: isVoid ? 'voided' : 'closed',
        subtotal,
        discount_amount: discountAmount,
        tax_total: round2(cgst + sgst),
        grand_total: grandTotal,
        cgst_total: cgst,
        sgst_total: sgst,
        payment_mode: bSeq % 3 === 0 ? 'card' : bSeq % 2 === 0 ? 'upi' : 'cash',
        discount_type: discountAmount > 0 ? 'percent' : null,
        discount_value: discountAmount > 0 ? 10 : 0,
        discount_preset: discountAmount > 0 ? 'Regular 10%' : null,
        discount_by: discountAmount > 0 ? USER_IDS.raju : null,
        void_reason: isVoid ? 'Order cancelled by customer before payment' : null,
        voided_by: isVoid ? USER_IDS.owner : null,
        voided_at: isVoid ? bTime : null,
        held_at: null,
        created_at: bTime,
        synced_at: null,
      });

      historicalBillItems.push(
        {
          id: `bi-${bId}-1`,
          bill_id: bId,
          item_id: it1.id,
          category_id: it1.category_id,
          name: it1.name,
          item_type: it1.item_type,
          unit: it1.unit,
          price: it1.price,
          quantity: qty1,
          weight_kg: weight1,
          line_total: lineTotal1,
          tax_rate_pct: it1.tax_rate_pct,
          cgst: cgst1,
          sgst: sgst1,
        },
        {
          id: `bi-${bId}-2`,
          bill_id: bId,
          item_id: it2.id,
          category_id: it2.category_id,
          name: it2.name,
          item_type: it2.item_type,
          unit: it2.unit,
          price: it2.price,
          quantity: qty2,
          weight_kg: weight2,
          line_total: lineTotal2,
          tax_rate_pct: it2.tax_rate_pct,
          cgst: cgst2,
          sgst: sgst2,
        }
      );
    }
  });

  // Write all collections cleanly using bulkPut to eliminate duplicate key errors
  await db.transaction('rw', [
    db.users,
    db.categories,
    db.tax_rates,
    db.items,
    db.outlet_config,
    db.day_sessions,
    db.bills,
    db.bill_items,
    db.stock_ledger,
    db.stock_counts,
  ], async () => {
    // Clear dynamic tables if forcing or refreshing to avoid dangling items
    await db.items.clear();
    await db.categories.clear();
    await db.tax_rates.clear();
    await db.day_sessions.clear();
    await db.bills.clear();
    await db.bill_items.clear();
    await db.stock_ledger.clear();
    await db.stock_counts.clear();

    // Populate
    await db.users.bulkPut(users);
    await db.categories.bulkPut(categories);
    const normalizedItems = items.map(it => ({
      ...it,
      sellBy: it.item_type === 'weight' ? 'weight' : 'piece',
    }));
    await db.items.bulkPut(normalizedItems);
    await db.outlet_config.bulkPut(config);
    await db.day_sessions.bulkPut([...historicalSessions, todaySession]);
    await db.bills.bulkPut([...historicalBills, ...bills]);
    await db.bill_items.bulkPut([...historicalBillItems, ...billItems]);
    await db.stock_ledger.bulkPut([
      ...openingStockEntries,
      ...salesLedgerEntries,
    ]);
    await db.stock_counts.bulkPut(stockCountEntries);
  });

  console.log('[Seed] Database successfully populated with comprehensive demo records for all menus!');
}

// Expose on window for manual reset in developer console
if (typeof window !== 'undefined') {
  window.seedDatabase = seedDatabase;
  window.resetDemoData = () => seedDatabase(true);
}

export default seedDatabase;
