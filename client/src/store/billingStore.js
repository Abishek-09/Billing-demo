import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/dexie.js';
import { calculateWeightPrice, calculateDiscount, calculateBillTotals, round2, calculateLineTax } from '../utils/tax.js';
import { generateBillNumber, getTodayStr } from '../utils/billNumber.js';

const useBillingStore = create((set, get) => ({
  // Current bill state
  cartItems: [],        // Array of bill_item objects
  billDiscount: null,   // { type: 'percent'|'flat', value: number, preset: string|null }
  totals: {
    subtotal: 0,
    discount_amount: 0,
    bill_discount_amount: 0,
    line_discounts_total: 0,
    cgst_total: 0,
    sgst_total: 0,
    tax_total: 0,
    grand_total: 0,
  },
  heldBills: [],        // In-memory list of held bill snapshots
  lastBillId: null,

  // Recalculate totals whenever cart changes
  _recalcTotals: () => {
    const { cartItems, billDiscount } = get();
    const totals = calculateBillTotals(cartItems, billDiscount);
    set({ totals });
  },

  /**
   * Add an item to the cart. For weight items, weightKg must be provided.
   */
  addItem: (item, taxRate, weightKg = null) => {
    const { cartItems } = get();
    const isWeight = item.sellBy === 'weight' || item.item_type === 'weight' || item.unit === 'kg';

    // For non-weight items, check if already in cart and increment
    if (!isWeight) {
      const existingIdx = cartItems.findIndex(ci => ci.item_id === item.id && !ci.weight_kg);
      if (existingIdx >= 0) {
        const updated = [...cartItems];
        const existing = { ...updated[existingIdx] };
        existing.quantity += 1;
        existing.line_total = round2(existing.price * existing.quantity);
        // Recalculate line discount if any
        if (existing.discount_value > 0) {
          existing.discount_amount = calculateDiscount(
            existing.line_total, existing.discount_type, existing.discount_value
          );
        }
        // Recalculate line tax
        const netLine = round2(existing.line_total - (existing.discount_amount || 0));
        const { cgst, sgst } = calculateLineTax(netLine, existing.tax_rate_pct);
        existing.cgst = cgst;
        existing.sgst = sgst;
        updated[existingIdx] = existing;
        set({ cartItems: updated });
        get()._recalcTotals();
        return;
      }
    }

    // Calculate line total
    let lineTotal;
    if (isWeight && weightKg) {
      lineTotal = calculateWeightPrice(item.price, weightKg);
    } else {
      lineTotal = round2(item.price);
    }

    const { cgst, sgst } = calculateLineTax(lineTotal, taxRate?.rate_pct || 0);

    const billItem = {
      id: uuidv4(),
      item_id: item.id,
      item_name: item.name,
      image_url: item.image_url || null,
      price: item.price,
      quantity: isWeight ? 1 : 1,
      unit: item.unit || (isWeight ? 'kg' : 'pc'),
      sellBy: isWeight ? 'weight' : 'piece',
      weight_kg: isWeight ? weightKg : null,
      line_total: lineTotal,
      discount_amount: 0,
      discount_type: null,
      discount_value: 0,
      discount_preset: null,
      discount_by: null,
      tax_rate_pct: taxRate?.rate_pct || 0,
      cgst,
      sgst,
      hsn_sac: taxRate?.hsn_sac || '',
      token_number: null,
      is_made_to_order: item.is_made_to_order || 0,
      item_type: item.item_type,
      track_stock: item.track_stock,
      category_id: item.category_id,
      created_at: new Date().toISOString(),
    };

    set({ cartItems: [...cartItems, billItem] });
    get()._recalcTotals();
  },

  /**
   * Update quantity for a cart item.
   */
  updateQuantity: (itemId, newQty) => {
    if (newQty < 1) return;
    const { cartItems } = get();
    const updated = cartItems.map(ci => {
      if (ci.id !== itemId) return ci;
      const item = { ...ci, quantity: newQty };
      item.line_total = round2(item.price * newQty);
      if (item.discount_value > 0) {
        item.discount_amount = calculateDiscount(item.line_total, item.discount_type, item.discount_value);
      }
      const netLine = round2(item.line_total - (item.discount_amount || 0));
      const { cgst, sgst } = calculateLineTax(netLine, item.tax_rate_pct);
      item.cgst = cgst;
      item.sgst = sgst;
      return item;
    });
    set({ cartItems: updated });
    get()._recalcTotals();
  },

  /**
   * Update weight for a weight-based item.
   */
  updateWeight: (itemId, newWeight) => {
    if (newWeight <= 0) return;
    const { cartItems } = get();
    const updated = cartItems.map(ci => {
      if (ci.id !== itemId) return ci;
      const item = { ...ci, weight_kg: newWeight };
      item.line_total = calculateWeightPrice(item.price, newWeight);
      if (item.discount_value > 0) {
        item.discount_amount = calculateDiscount(item.line_total, item.discount_type, item.discount_value);
      }
      const netLine = round2(item.line_total - (item.discount_amount || 0));
      const { cgst, sgst } = calculateLineTax(netLine, item.tax_rate_pct);
      item.cgst = cgst;
      item.sgst = sgst;
      return item;
    });
    set({ cartItems: updated });
    get()._recalcTotals();
  },

  /**
   * Apply line-level discount.
   */
  applyLineDiscount: (itemId, type, value, preset, userId) => {
    const { cartItems } = get();
    const updated = cartItems.map(ci => {
      if (ci.id !== itemId) return ci;
      const item = { ...ci };
      item.discount_type = type;
      item.discount_value = value;
      item.discount_preset = preset || null;
      item.discount_by = userId;
      item.discount_amount = calculateDiscount(item.line_total, type, value);
      const netLine = round2(item.line_total - item.discount_amount);
      const { cgst, sgst } = calculateLineTax(netLine, item.tax_rate_pct);
      item.cgst = cgst;
      item.sgst = sgst;
      return item;
    });
    set({ cartItems: updated });
    get()._recalcTotals();
  },

  /**
   * Remove line discount.
   */
  removeLineDiscount: (itemId) => {
    const { cartItems } = get();
    const updated = cartItems.map(ci => {
      if (ci.id !== itemId) return ci;
      const item = { ...ci };
      item.discount_type = null;
      item.discount_value = 0;
      item.discount_preset = null;
      item.discount_by = null;
      item.discount_amount = 0;
      const { cgst, sgst } = calculateLineTax(item.line_total, item.tax_rate_pct);
      item.cgst = cgst;
      item.sgst = sgst;
      return item;
    });
    set({ cartItems: updated });
    get()._recalcTotals();
  },

  /**
   * Apply bill-level discount.
   */
  applyBillDiscount: (type, value, preset) => {
    set({ billDiscount: { type, value, preset: preset || null } });
    get()._recalcTotals();
  },

  removeBillDiscount: () => {
    set({ billDiscount: null });
    get()._recalcTotals();
  },

  /**
   * Remove item from cart.
   */
  removeItem: (itemId) => {
    const { cartItems } = get();
    set({ cartItems: cartItems.filter(ci => ci.id !== itemId) });
    get()._recalcTotals();
  },

  /**
   * Clear the entire cart.
   */
  clearCart: () => {
    set({
      cartItems: [],
      billDiscount: null,
      totals: {
        subtotal: 0, discount_amount: 0, bill_discount_amount: 0,
        line_discounts_total: 0, cgst_total: 0, sgst_total: 0,
        tax_total: 0, grand_total: 0,
      },
    });
  },

  /**
   * Finalize bill — save to IndexedDB, decrement stock, assign tokens.
   * This is the critical path — must be synchronous-feeling and crash-safe.
   */
  finalizeBill: async (cashierId, cashierName) => {
    const { cartItems, billDiscount, totals } = get();
    if (cartItems.length === 0) return null;

    const now = new Date().toISOString();
    const today = getTodayStr();

    // Get or create day session
    let session = await db.day_sessions.where('date').equals(today).first();
    if (!session) {
      session = {
        id: uuidv4(),
        opened_by: cashierId,
        closed_by: null,
        date: today,
        status: 'open',
        next_token: 1,
        next_bill_seq: 1,
        opened_at: now,
        closed_at: null,
        z_report_json: null,
      };
      await db.day_sessions.add(session);
    }

    if (session.status === 'closed') {
      throw new Error('Day is closed. Cannot create new bills.');
    }

    // Get bill prefix
    const prefixConfig = await db.outlet_config.get('bill_prefix');
    const prefix = prefixConfig?.value || 'BB';

    const billNumber = generateBillNumber(prefix, session.next_bill_seq);
    const billId = uuidv4();

    // Assign token numbers for made-to-order items
    let currentToken = session.next_token;
    const finalItems = cartItems.map(ci => {
      const item = { ...ci, bill_id: billId };
      if (ci.is_made_to_order) {
        item.token_number = currentToken;
        currentToken++;
      }
      return item;
    });

    // Build bill object
    const bill = {
      id: billId,
      day_session_id: session.id,
      cashier_id: cashierId,
      bill_number: billNumber,
      status: 'closed',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      cgst_total: totals.cgst_total,
      sgst_total: totals.sgst_total,
      discount_type: billDiscount?.type || null,
      discount_value: billDiscount?.value || 0,
      discount_preset: billDiscount?.preset || null,
      discount_by: billDiscount ? cashierId : null,
      void_reason: null,
      voided_by: null,
      voided_at: null,
      held_at: null,
      created_at: now,
      synced_at: null,
    };

    // Single IndexedDB transaction — crash-safe
    await db.transaction('rw',
      [db.bills, db.bill_items, db.day_sessions, db.stock_ledger, db.sync_queue, db.audit_log],
      async () => {
        // Save bill
        await db.bills.add(bill);

        // Save bill items
        await db.bill_items.bulkAdd(finalItems);

        // Update day session counters
        await db.day_sessions.update(session.id, {
          next_token: currentToken,
          next_bill_seq: session.next_bill_seq + 1,
        });

        // Decrement stock for tracked items
        for (const item of finalItems) {
          if (item.track_stock) {
            // Get current balance
            const lastLedger = await db.stock_ledger
              .where('item_id').equals(item.item_id)
              .reverse()
              .sortBy('created_at');
            const currentBalance = lastLedger.length > 0
              ? lastLedger[0].balance_after : 0;
            const qtyChange = item.weight_kg
              ? -item.weight_kg
              : -item.quantity;

            await db.stock_ledger.add({
              id: uuidv4(),
              item_id: item.item_id,
              day_session_id: session.id,
              ref_type: 'sale',
              ref_id: billId,
              qty_change: qtyChange,
              balance_after: round2(currentBalance + qtyChange),
              notes: `Bill ${billNumber}`,
              created_at: now,
            });
          }
        }

        // Add to sync queue
        await db.sync_queue.add({
          id: uuidv4(),
          entity_type: 'bill',
          entity_id: billId,
          payload_json: JSON.stringify({ bill, items: finalItems }),
          status: 'pending',
          retry_count: 0,
          created_at: now,
          synced_at: null,
          error: null,
        });

        // Audit log
        await db.audit_log.add({
          id: uuidv4(),
          user_id: cashierId,
          action: 'bill_created',
          entity_type: 'bill',
          entity_id: billId,
          before_json: null,
          after_json: JSON.stringify({ bill_number: billNumber, grand_total: totals.grand_total }),
          created_at: now,
        });
      }
    );

    // Clear cart
    get().clearCart();
    set({ lastBillId: billId });

    return { bill, items: finalItems };
  },

  /**
   * Hold (park) current bill.
   */
  holdBill: () => {
    const { cartItems, billDiscount, totals, heldBills } = get();
    if (cartItems.length === 0) return;

    const held = {
      id: uuidv4(),
      cartItems: [...cartItems],
      billDiscount: billDiscount ? { ...billDiscount } : null,
      totals: { ...totals },
      held_at: new Date().toISOString(),
    };

    set({ heldBills: [...heldBills, held] });
    get().clearCart();
  },

  /**
   * Retrieve a held bill.
   */
  retrieveHeldBill: (heldId) => {
    const { heldBills } = get();
    const held = heldBills.find(h => h.id === heldId);
    if (!held) return;

    set({
      cartItems: held.cartItems,
      billDiscount: held.billDiscount,
      heldBills: heldBills.filter(h => h.id !== heldId),
    });
    get()._recalcTotals();
  },

  /**
   * Remove a held bill.
   */
  removeHeldBill: (heldId) => {
    const { heldBills } = get();
    set({ heldBills: heldBills.filter(h => h.id !== heldId) });
  },

  /**
   * Void a finalized bill — requires owner verification done before calling.
   */
  voidBill: async (billId, reason, voidedByUserId) => {
    const now = new Date().toISOString();

    await db.transaction('rw',
      [db.bills, db.bill_items, db.stock_ledger, db.audit_log, db.sync_queue],
      async () => {
        const bill = await db.bills.get(billId);
        if (!bill || bill.status === 'voided') return;

        // Reverse stock changes
        const items = await db.bill_items.where('bill_id').equals(billId).toArray();
        for (const item of items) {
          if (item.track_stock) {
            const lastLedger = await db.stock_ledger
              .where('item_id').equals(item.item_id)
              .reverse()
              .sortBy('created_at');
            const currentBalance = lastLedger.length > 0
              ? lastLedger[0].balance_after : 0;
            const qtyChange = item.weight_kg
              ? item.weight_kg
              : item.quantity;

            await db.stock_ledger.add({
              id: uuidv4(),
              item_id: item.item_id,
              day_session_id: bill.day_session_id,
              ref_type: 'void_reversal',
              ref_id: billId,
              qty_change: qtyChange,
              balance_after: round2(currentBalance + qtyChange),
              notes: `Void reversal: ${bill.bill_number}`,
              created_at: now,
            });
          }
        }

        // Update bill status
        await db.bills.update(billId, {
          status: 'voided',
          void_reason: reason,
          voided_by: voidedByUserId,
          voided_at: now,
        });

        // Audit
        await db.audit_log.add({
          id: uuidv4(),
          user_id: voidedByUserId,
          action: 'bill_voided',
          entity_type: 'bill',
          entity_id: billId,
          before_json: JSON.stringify({ status: 'closed' }),
          after_json: JSON.stringify({ status: 'voided', reason }),
          created_at: now,
        });

        // Sync queue
        await db.sync_queue.add({
          id: uuidv4(),
          entity_type: 'bill_void',
          entity_id: billId,
          payload_json: JSON.stringify({ billId, reason, voided_by: voidedByUserId }),
          status: 'pending',
          retry_count: 0,
          created_at: now,
          synced_at: null,
          error: null,
        });
      }
    );
  },
}));

export default useBillingStore;
