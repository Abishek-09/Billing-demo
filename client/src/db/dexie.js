import Dexie from 'dexie';

export const db = new Dexie('BakeAndBrewPOS');

db.version(1).stores({
  // Master data — synced from server
  users:        'id, role, active',
  categories:   'id, sort_order, active',
  tax_rates:    'id',
  items:        'id, category_id, barcode, item_type, active, name',

  // Transactional data — created locally, synced to server
  day_sessions: 'id, date, status',
  bills:        'id, day_session_id, bill_number, status, created_at, cashier_id',
  bill_items:   'id, bill_id, item_id',
  stock_ledger: 'id, item_id, day_session_id, ref_type, ref_id',
  stock_counts: 'id, item_id, day_session_id',
  audit_log:    'id, user_id, action, entity_type, entity_id, created_at',
  sync_queue:   'id, entity_type, status, created_at',
  print_queue:  'id, bill_id, print_type, status, created_at',

  // Config
  outlet_config: 'key',
});

export default db;
