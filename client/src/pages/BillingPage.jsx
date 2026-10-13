import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence } from 'framer-motion';
import db from '../db/dexie.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import useAuthStore from '../store/authStore.js';
import useBillingStore from '../store/billingStore.js';
import useToastStore from '../store/toastStore.js';
import { formatINR, round2 } from '../utils/tax.js';
import { formatTime } from '../utils/billNumber.js';
import NumPad from '../components/NumPad.jsx';
import OwnerPinPrompt from '../components/OwnerPinPrompt.jsx';
import ProductCard from '../components/ProductCard.jsx';
import CartLineItem from '../components/CartLineItem.jsx';
import WeightPicker from '../components/WeightPicker.jsx';
import { Scale } from 'lucide-react';
import { printBill, printKitchenToken } from '../services/printer.js';

// Discount presets
const DISCOUNT_PRESETS = [
  { label: 'Regular 10%', type: 'percent', value: 10 },
  { label: 'Staff 20%', type: 'percent', value: 20 },
  { label: '₹50 Off', type: 'flat', value: 50 },
];

export default function BillingPage() {
  const { t } = useI18n();
  const { user, verifyOwnerPin } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const {
    cartItems, billDiscount, totals, heldBills, lastBillId,
    addItem, updateQuantity, updateWeight, removeItem, clearCart,
    applyLineDiscount, removeLineDiscount, applyBillDiscount, removeBillDiscount,
    finalizeBill, holdBill, retrieveHeldBill, removeHeldBill, voidBill,
  } = useBillingStore();

  // Master data from Dexie
  const categories = useLiveQuery(() => db.categories.where('active').equals(1).sortBy('sort_order'), []);
  const allItems = useLiveQuery(() => db.items.where('active').equals(1).toArray(), []);
  const taxRates = useLiveQuery(() => db.tax_rates.toArray(), []);

  // UI state & URL Search Params
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get('category');
  const [activeCategory, setActiveCategory] = useState(urlCategory || null);

  // Sync activeCategory when URL search parameter changes (e.g. sidebar navigation)
  useEffect(() => {
    const cat = searchParams.get('category');
    setActiveCategory(cat || null);
  }, [searchParams]);

  const handleSelectCategory = (catId) => {
    setActiveCategory(catId);
    if (catId) {
      setSearchParams({ category: catId });
    } else {
      setSearchParams({});
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [sellByFilter, setSellByFilter] = useState('all'); // 'all' | 'weight' | 'piece'
  const [weightPickerState, setWeightPickerState] = useState({
    show: false,
    item: null,
    taxRate: null,
    editCartItemId: null,
    initialWeightKg: null,
  });
  const [discountPanel, setDiscountPanel] = useState({ show: false, lineItemId: null, mode: 'bill' });
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [voidState, setVoidState] = useState({ show: false, billId: null, reason: '' });
  const [showVoidPin, setShowVoidPin] = useState(false);

  // --- Keyboard navigation & focus zone state ---
  const [focusZone, setFocusZone] = useState('search'); // 'search' | 'grid' | 'bill' | 'weightPicker'
  const [selectedGridIndex, setSelectedGridIndex] = useState(-1);
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);        // Double-submit guard
  const isPrinting = isSaving;
  const [lastBillResult, setLastBillResult] = useState(null); // For Ctrl+P reprint

  const gridRef = useRef(null);
  const cartListRef = useRef(null);
  const searchInputRef = useRef(null);
  const cartEndRef = useRef(null);

  // Cart strip input state & refs
  const itemCodeRef = useRef(null);
  const quantityRef = useRef(null);
  const paymentRef = useRef(null);
  const [kbItemCode, setKbItemCode] = useState('');
  const [kbQuantity, setKbQuantity] = useState('1');
  const [kbMatchedItem, setKbMatchedItem] = useState(null);
  const [kbError, setKbError] = useState('');

  // Tax rate lookup map
  const taxRateMap = useMemo(() => {
    if (!taxRates) return {};
    return taxRates.reduce((map, tr) => { map[tr.id] = tr; return map; }, {});
  }, [taxRates]);

  // Helper: check if product is sold by weight
  const isItemWeight = useCallback((item) => {
    return item?.sellBy === 'weight' || item?.item_type === 'weight' || item?.unit === 'kg';
  }, []);

  // Filter items by category and search
  const filteredItems = useMemo(() => {
    if (!allItems) return [];
    let items = allItems;
    if (activeCategory) {
      items = items.filter(i => i.category_id === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.startsWith(q))
      );
    }
    return items;
  }, [allItems, activeCategory, searchQuery]);

  // Separate weight and piece items
  const weightItems = useMemo(() => {
    return filteredItems.filter(isItemWeight);
  }, [filteredItems, isItemWeight]);

  const pieceItems = useMemo(() => {
    return filteredItems.filter(i => !isItemWeight(i));
  }, [filteredItems, isItemWeight]);

  // Combined flat items list for grid keyboard navigation
  const displayedGridItems = useMemo(() => {
    if (sellByFilter === 'weight') return weightItems;
    if (sellByFilter === 'piece') return pieceItems;
    return [...weightItems, ...pieceItems];
  }, [sellByFilter, weightItems, pieceItems]);

  // Auto-scroll cart to bottom when items added
  useEffect(() => {
    cartEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cartItems.length]);

  // Auto-focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // --- Item resolver for keyboard billing ---
  // Matches by: exact barcode → exact name → single partial name match
  const resolveItem = useCallback((code) => {
    if (!allItems || !code.trim()) return null;
    const q = code.trim().toLowerCase();
    // 1. Exact barcode match (highest priority)
    const byBarcode = allItems.find(i => i.barcode === code.trim());
    if (byBarcode) return byBarcode;
    // 2. Exact name match (case-insensitive)
    const byName = allItems.find(i => i.name.toLowerCase() === q);
    if (byName) return byName;
    // 3. Single partial name match
    const partials = allItems.filter(i => i.name.toLowerCase().includes(q));
    if (partials.length === 1) return partials[0];
    return null;
  }, [allItems]);

  // --- Keyboard Enter handlers ---

  // Enter in Item Code field
  const handleItemCodeEnter = useCallback(() => {
    setKbError('');
    // EMPTY → jump to payment (means "done adding items")
    if (!kbItemCode.trim()) {
      if (cartItems.length === 0) {
        setKbError('No items in bill');
        return;
      }
      paymentRef.current?.focus();
      return;
    }
    // Resolve item by code/name
    const item = resolveItem(kbItemCode);
    if (!item) {
      setKbError(`Item "${kbItemCode}" not found`);
      itemCodeRef.current?.select();
      return;
    }
    setKbMatchedItem(item);
    setKbQuantity(item.item_type === 'weight' ? '' : '1');
    quantityRef.current?.focus();
    quantityRef.current?.select();
  }, [kbItemCode, cartItems, resolveItem]);

  // Enter in Quantity field
  const handleQuantityEnter = useCallback(() => {
    setKbError('');
    if (!kbMatchedItem) {
      setKbError('No item selected');
      itemCodeRef.current?.focus();
      return;
    }
    const taxRate = taxRateMap[kbMatchedItem.tax_rate_id];

    if (kbMatchedItem.item_type === 'weight') {
      // Weight items: parse as decimal weight in kg
      const weight = parseFloat(kbQuantity);
      if (!weight || weight <= 0) {
        setKbError('Enter weight in kg (e.g. 0.5)');
        quantityRef.current?.select();
        return;
      }
      addItem(kbMatchedItem, taxRate, weight);
    } else {
      // Unit items: parse as integer quantity ≥ 1
      const intQty = parseInt(kbQuantity, 10);
      if (!intQty || intQty < 1) {
        setKbError('Quantity must be ≥ 1');
        quantityRef.current?.select();
        return;
      }
      addItem(kbMatchedItem, taxRate);
      // addItem adds qty=1 (or increments existing). Set exact quantity if > 1.
      if (intQty > 1) {
        // Get the freshly added/updated cart item
        setTimeout(() => {
          const currentCart = useBillingStore.getState().cartItems;
          const added = currentCart.find(ci => ci.item_id === kbMatchedItem.id);
          if (added) updateQuantity(added.id, intQty);
        }, 0);
      }
    }
    // Clear and return to item code for next entry
    setKbItemCode('');
    setKbQuantity('1');
    setKbMatchedItem(null);
    itemCodeRef.current?.focus();
  }, [kbMatchedItem, kbQuantity, taxRateMap, addItem, updateQuantity]);

  // Enter in Payment field → finalize + print
  const handlePaymentEnter = useCallback(async () => {
    if (isSaving) return; // Double-print guard
    if (cartItems.length === 0) return;
    setIsSaving(true);
    try {
      const result = await finalizeBill(user?.id, user?.name);
      if (result) {
        setLastBillResult(result);
        addToast(`Bill ${result.bill.bill_number} — ${formatINR(result.bill.grand_total)}`, 'success');
        // Print bill
        await printBill(result.bill, result.items).catch(() => {
          addToast('Print failed — use Ctrl+P to retry', 'warning');
        });
        // Print kitchen tokens for made-to-order items
        const mtoItems = result.items.filter(i => i.is_made_to_order && i.token_number);
        if (mtoItems.length > 0) {
          printKitchenToken(mtoItems, result.bill.bill_number).catch(() => {});
        }
      }
    } catch (err) {
      addToast(err.message || 'Error finalizing bill', 'error');
    } finally {
      // 1-second cooldown before re-enabling
      setTimeout(() => setIsSaving(false), 1000);
    }
    // Clear and refocus for next bill
    setKbItemCode('');
    setKbQuantity('1');
    setKbMatchedItem(null);
    setKbError('');
    setSelectedCartIndex(-1);
    itemCodeRef.current?.focus();
  }, [isSaving, cartItems, finalizeBill, user, addToast]);

  // --- Add product respecting quantity input & weight-based selling ---
  const addProductToBill = useCallback((item) => {
    if (!item) return;
    const taxRate = taxRateMap[item.tax_rate_id];

    if (isItemWeight(item)) {
      // Weight items: open WeightPicker modal
      setWeightPickerState({
        show: true,
        item,
        taxRate,
        editCartItemId: null,
        initialWeightKg: null,
      });
      setFocusZone('weightPicker');
      return;
    }

    // Piece items: quantity must be a whole number, block decimals
    const qty = parseInt(kbQuantity, 10) || 1;
    if (qty <= 1) {
      addItem(item, taxRate);
    } else {
      addItem(item, taxRate);
      setTimeout(() => {
        const currentCart = useBillingStore.getState().cartItems;
        const found = currentCart.find(ci => ci.item_id === item.id && !ci.weight_kg);
        if (found) {
          updateQuantity(found.id, found.quantity + qty - 1);
        }
      }, 0);
    }
  }, [taxRateMap, kbQuantity, addItem, updateQuantity, isItemWeight]);

  // Detect grid columns dynamically based on card offsetTop
  const getGridCols = useCallback(() => {
    if (!gridRef.current) return 3;
    // Query actual product card DOM elements across sections
    const cardEls = gridRef.current.querySelectorAll('[id^="item-"]');
    if (!cardEls || cardEls.length < 2) return 1;
    const firstTop = cardEls[0].offsetTop;
    for (let i = 1; i < cardEls.length; i++) {
      if (cardEls[i].offsetTop > firstTop) {
        return i;
      }
    }
    return Math.min(cardEls.length, 4);
  }, []);

  // Auto-scroll highlighted card into view reliably using card ID
  useEffect(() => {
    if (focusZone === 'grid' && selectedGridIndex >= 0 && displayedGridItems[selectedGridIndex]) {
      const targetId = `item-${displayedGridItems[selectedGridIndex].id}`;
      const card = document.getElementById(targetId);
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusZone, selectedGridIndex, displayedGridItems]);

  // Auto-scroll selected bill item into view
  useEffect(() => {
    if (focusZone === 'bill' && selectedCartIndex >= 0 && cartListRef.current) {
      const cards = cartListRef.current.querySelectorAll('.group');
      if (cards && cards[selectedCartIndex]) {
        cards[selectedCartIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusZone, selectedCartIndex]);

  // --- Handlers ---

  const handleItemTap = useCallback((item) => {
    // Sync keyboard cursor to the clicked card
    const idx = displayedGridItems.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      setSelectedGridIndex(idx);
      setFocusZone('grid');
    }
    addProductToBill(item);
  }, [displayedGridItems, addProductToBill]);

  // WeightPicker confirmation: handles both new weight item and editing existing cart item
  const handleWeightPickerConfirm = useCallback((weightKg) => {
    if (weightPickerState.editCartItemId) {
      // Editing existing line item in cart
      updateWeight(weightPickerState.editCartItemId, weightKg);
      addToast(`Updated weight to ${weightKg < 1 ? Math.round(weightKg * 1000) + ' g' : weightKg + ' kg'}`, 'success');
    } else if (weightPickerState.item) {
      // Adding new weight item to bill
      addItem(weightPickerState.item, weightPickerState.taxRate, weightKg);
      addToast(`Added ${weightPickerState.item.name} (${weightKg < 1 ? Math.round(weightKg * 1000) + ' g' : weightKg + ' kg'})`, 'success');
    }
    setWeightPickerState({
      show: false,
      item: null,
      taxRate: null,
      editCartItemId: null,
      initialWeightKg: null,
    });
    // Return focus to product grid on the same card
    setFocusZone('grid');
  }, [weightPickerState, updateWeight, addItem, addToast]);

  const handleWeightPickerCancel = useCallback(() => {
    setWeightPickerState({
      show: false,
      item: null,
      taxRate: null,
      editCartItemId: null,
      initialWeightKg: null,
    });
    setFocusZone('grid');
  }, []);

  const handleFinalize = useCallback(async () => {
    if (isSaving) return; // Block double-submit
    if (cartItems.length === 0) {
      addToast(t('billing.cart_empty') || 'No items in bill', 'info');
      return;
    }
    setIsSaving(true);
    try {
      const result = await finalizeBill(user?.id, user?.name);
      if (result) {
        setLastBillResult(result); // Store for Ctrl+P reprint
        addToast(`Bill ${result.bill.bill_number} — ${formatINR(result.bill.grand_total)}`, 'success');
        // Print bill
        await printBill(result.bill, result.items).catch(() => {
          addToast(t('common.print_failed') || 'Print failed', 'warning');
        });
        // Print kitchen tokens for made-to-order items
        const mtoItems = result.items.filter(i => i.is_made_to_order && i.token_number);
        if (mtoItems.length > 0) {
          printKitchenToken(mtoItems, result.bill.bill_number).catch(() => {});
        }
      }
    } catch (err) {
      addToast(err.message || t('common.error'), 'error');
    } finally {
      // 1-second cooldown before allowing next finalize
      setTimeout(() => setIsSaving(false), 1000);
    }
    // Clear and refocus search box for next bill
    setSearchQuery('');
    setKbItemCode('');
    setKbQuantity('1');
    setKbMatchedItem(null);
    setKbError('');
    setSelectedCartIndex(-1);
    setSelectedGridIndex(-1);
    setFocusZone('search');
    searchInputRef.current?.focus();
  }, [isSaving, cartItems, finalizeBill, user, addToast, t]);

  const handleHold = useCallback(() => {
    if (cartItems.length === 0) return;
    holdBill();
    addToast('Bill held', 'info');
  }, [cartItems, holdBill, addToast]);

  const handleApplyDiscount = useCallback(() => {
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return;

    if (discountPanel.mode === 'line' && discountPanel.lineItemId) {
      applyLineDiscount(discountPanel.lineItemId, discountType, val, null, user?.id);
    } else {
      applyBillDiscount(discountType, val, null);
    }
    setDiscountPanel({ show: false, lineItemId: null, mode: 'bill' });
    setDiscountValue('');
  }, [discountValue, discountType, discountPanel, applyLineDiscount, applyBillDiscount, user]);

  const handlePresetDiscount = useCallback((preset) => {
    if (discountPanel.mode === 'line' && discountPanel.lineItemId) {
      applyLineDiscount(discountPanel.lineItemId, preset.type, preset.value, preset.label, user?.id);
    } else {
      applyBillDiscount(preset.type, preset.value, preset.label);
    }
    setDiscountPanel({ show: false, lineItemId: null, mode: 'bill' });
    setDiscountValue('');
  }, [discountPanel, applyLineDiscount, applyBillDiscount, user]);

  const handleVoidSubmit = useCallback(async (ownerPin) => {
    const owner = await verifyOwnerPin(ownerPin);
    if (!owner) return false;
    // Void previously finalized bills
    // This is the in-cart void (clear with reason)
    if (voidState.billId) {
      await voidBill(voidState.billId, voidState.reason, owner.id);
      addToast('Bill voided', 'info');
    }
    setShowVoidPin(false);
    setVoidState({ show: false, billId: null, reason: '' });
    return true;
  }, [voidState, verifyOwnerPin, voidBill, addToast]);

  // --- Global Keyboard-Only Navigation ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // If WeightPicker is open, it manages its own keys (1-6, G, K, Enter, Esc)
      if (weightPickerState.show) {
        return;
      }

      // If other modal or overlay is open, only intercept Esc to close it
      if (showVoidPin || discountPanel.show) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowVoidPin(false);
          setDiscountPanel({ show: false, lineItemId: null, mode: 'bill' });
          setFocusZone('search');
          searchInputRef.current?.focus();
        }
        return;
      }

      // ---------------------------------------------
      // GLOBAL SHORTCUTS
      // ---------------------------------------------
      // Alt+1: All items filter
      if (e.altKey && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        setSellByFilter('all');
        return;
      }

      // Alt+2: By Weight filter
      if (e.altKey && (e.key === '2' || e.code === 'Digit2')) {
        e.preventDefault();
        setSellByFilter('weight');
        return;
      }

      // Alt+3: By Piece filter
      if (e.altKey && (e.key === '3' || e.code === 'Digit3')) {
        e.preventDefault();
        setSellByFilter('piece');
        return;
      }
      // F2: New bill (clear everything, focus search)
      if (e.key === 'F2') {
        e.preventDefault();
        clearCart();
        setSearchQuery('');
        setKbItemCode('');
        setKbQuantity('1');
        setKbMatchedItem(null);
        setKbError('');
        setSelectedCartIndex(-1);
        setSelectedGridIndex(-1);
        setFocusZone('search');
        searchInputRef.current?.focus();
        return;
      }

      // F4: Hold bill
      if (e.key === 'F4') {
        e.preventDefault();
        handleHold();
        return;
      }

      // F8: Finalize bill
      if (e.key === 'F8') {
        e.preventDefault();
        handleFinalize();
        return;
      }

      // F9: Clear cart
      if (e.key === 'F9') {
        e.preventDefault();
        clearCart();
        setFocusZone('search');
        searchInputRef.current?.focus();
        return;
      }

      // Ctrl+P: Reprint last bill
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (lastBillResult) {
          printBill(lastBillResult.bill, lastBillResult.items)
            .then(() => addToast('Reprinted last bill', 'success'))
            .catch(() => addToast(t('common.print_failed') || 'Reprint failed', 'warning'));
        } else {
          addToast('No previous bill to reprint', 'info');
        }
        return;
      }

      // Tab or F3: Switch focus seamlessly between Search, Product Grid, and Bill List
      if (e.key === 'Tab' || e.key === 'F3') {
        e.preventDefault();
        if (focusZone === 'bill') {
          setFocusZone('search');
          setSelectedCartIndex(-1);
          searchInputRef.current?.focus();
        } else if (focusZone === 'search') {
          if (displayedGridItems.length > 0) {
            setFocusZone('grid');
            setSelectedGridIndex(prev => (prev >= 0 && prev < displayedGridItems.length ? prev : 0));
            searchInputRef.current?.blur();
          } else if (cartItems.length > 0) {
            setFocusZone('bill');
            setSelectedCartIndex(0);
            searchInputRef.current?.blur();
          }
        } else if (focusZone === 'grid') {
          if (cartItems.length > 0) {
            setFocusZone('bill');
            setSelectedCartIndex(prev => (prev >= 0 && prev < cartItems.length ? prev : 0));
          } else {
            setFocusZone('search');
            setSelectedGridIndex(-1);
            searchInputRef.current?.focus();
          }
        }
        return;
      }

      // Escape: Return to search box
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchQuery('');
        setKbItemCode('');
        setKbQuantity('1');
        setKbMatchedItem(null);
        setKbError('');
        setSelectedGridIndex(-1);
        setSelectedCartIndex(-1);
        setShowHeldBills(false);
        setFocusZone('search');
        searchInputRef.current?.focus();
        return;
      }

      // Check if user is typing in another input (like custom inputs or quantity box)
      const activeEl = document.activeElement;
      const isOtherInput = activeEl && activeEl !== searchInputRef.current && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isOtherInput) {
        return;
      }

      // ---------------------------------------------
      // ZONE 1: SEARCH BOX
      // ---------------------------------------------
      if (focusZone === 'search') {
        // ArrowDown or ArrowRight (when empty): Move focus into product grid
        if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && !searchQuery.trim())) {
          if (displayedGridItems.length > 0) {
            e.preventDefault();
            setFocusZone('grid');
            setSelectedGridIndex(prev => (prev >= 0 && prev < displayedGridItems.length ? prev : 0));
            searchInputRef.current?.blur();
          }
          return;
        }

        // Enter: Add first matching item or finalize bill if search is empty
        if (e.key === 'Enter') {
          e.preventDefault();
          if (searchQuery.trim()) {
            if (displayedGridItems.length > 0) {
              addProductToBill(displayedGridItems[0]);
              setSearchQuery('');
              searchInputRef.current?.focus();
            }
          } else {
            if (cartItems.length > 0) {
              handleFinalize();
            }
          }
          return;
        }

        return; // Allow normal typing in search input
      }

      // ---------------------------------------------
      // ZONE 2: PRODUCT GRID NAVIGATION
      // ---------------------------------------------
      if (focusZone === 'grid') {
        // ArrowRight: next card
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setSelectedGridIndex(prev => Math.min(displayedGridItems.length - 1, (prev < 0 ? 0 : prev) + 1));
          return;
        }

        // ArrowLeft: previous card
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setSelectedGridIndex(prev => Math.max(0, prev - 1));
          return;
        }

        // ArrowDown: move one row down
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const cols = getGridCols();
          setSelectedGridIndex(prev => Math.min(displayedGridItems.length - 1, (prev < 0 ? 0 : prev) + cols));
          return;
        }

        // ArrowUp: move one row up, or return to search box if at top row
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const cols = getGridCols();
          if (selectedGridIndex - cols < 0) {
            setFocusZone('search');
            setSelectedGridIndex(-1);
            searchInputRef.current?.focus();
          } else {
            setSelectedGridIndex(prev => prev - cols);
          }
          return;
        }

        // Enter: add highlighted card to bill (highlight stays)
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedGridIndex >= 0 && selectedGridIndex < displayedGridItems.length) {
            addProductToBill(displayedGridItems[selectedGridIndex]);
          }
          return;
        }

        // Typing any printable character: returns focus to search box
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          setFocusZone('search');
          setSelectedGridIndex(-1);
          searchInputRef.current?.focus();
          return;
        }

        return;
      }

      // ---------------------------------------------
      // ZONE 3: BILL LIST NAVIGATION
      // ---------------------------------------------
      if (focusZone === 'bill') {
        // ArrowUp: previous bill item
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCartIndex(prev => Math.max(0, prev - 1));
          return;
        }

        // ArrowDown: next bill item
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCartIndex(prev => Math.min(cartItems.length - 1, prev + 1));
          return;
        }

        // "+" / "=" / ArrowRight: increase quantity or weight
        if (e.key === '+' || e.key === '=' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (selectedCartIndex >= 0 && selectedCartIndex < cartItems.length) {
            const item = cartItems[selectedCartIndex];
            if (item) {
              if (item.weight_kg) {
                // Step weight by +50 g (+0.05 kg) up to 25 kg
                const newWeight = Math.min(25, round2(item.weight_kg + 0.05));
                updateWeight(item.id, newWeight);
              } else {
                // Step piece quantity by +1
                updateQuantity(item.id, item.quantity + 1);
              }
            }
          }
          return;
        }

        // "-" / "_" / ArrowLeft: decrease quantity or weight
        if (e.key === '-' || e.key === '_' || e.key === 'ArrowLeft') {
          e.preventDefault();
          if (selectedCartIndex >= 0 && selectedCartIndex < cartItems.length) {
            const item = cartItems[selectedCartIndex];
            if (item) {
              if (item.weight_kg) {
                // Step weight by -50 g (-0.05 kg)
                if (item.weight_kg > 0.05) {
                  updateWeight(item.id, round2(item.weight_kg - 0.05));
                } else {
                  removeItem(item.id);
                  setSelectedCartIndex(prev => Math.min(prev, cartItems.length - 2));
                  if (cartItems.length <= 1) {
                    setFocusZone('search');
                    searchInputRef.current?.focus();
                  }
                }
              } else {
                // Step piece quantity by -1
                if (item.quantity > 1) {
                  updateQuantity(item.id, item.quantity - 1);
                } else {
                  removeItem(item.id);
                  setSelectedCartIndex(prev => Math.min(prev, cartItems.length - 2));
                  if (cartItems.length <= 1) {
                    setFocusZone('search');
                    searchInputRef.current?.focus();
                  }
                }
              }
            }
          }
          return;
        }

        // Delete: remove selected item
        if (e.key === 'Delete') {
          e.preventDefault();
          if (selectedCartIndex >= 0 && selectedCartIndex < cartItems.length) {
            const item = cartItems[selectedCartIndex];
            if (item) {
              removeItem(item.id);
              setSelectedCartIndex(prev => Math.min(prev, cartItems.length - 2));
              if (cartItems.length <= 1) {
                setFocusZone('search');
                searchInputRef.current?.focus();
              }
            }
          }
          return;
        }

        // Enter: For weight items, reopen WeightPicker to edit weight; for piece items, return to search
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedCartIndex >= 0 && selectedCartIndex < cartItems.length) {
            const item = cartItems[selectedCartIndex];
            if (item && item.weight_kg) {
              setWeightPickerState({
                show: true,
                item: { id: item.item_id, name: item.item_name, price: item.price, unit: 'kg' },
                taxRate: taxRateMap[item.tax_rate_id],
                editCartItemId: item.id,
                initialWeightKg: item.weight_kg,
              });
              setFocusZone('weightPicker');
              return;
            }
          }
          setFocusZone('search');
          setSelectedCartIndex(-1);
          searchInputRef.current?.focus();
          return;
        }

        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    focusZone,
    selectedGridIndex,
    selectedCartIndex,
    displayedGridItems,
    cartItems,
    searchQuery,
    lastBillResult,
    showVoidPin,
    weightPickerState.show,
    discountPanel.show,
    getGridCols,
    addProductToBill,
    clearCart,
    handleHold,
    handleFinalize,
    updateQuantity,
    updateWeight,
    removeItem,
    addToast,
    t,
    taxRateMap,
  ]);

  // --- Render helpers ---

  const getItemDisplayName = (item) => {
    return item.item_name || item.name;
  };

  const getCategoryName = (cat) => {
    return cat.name;
  };

  if (!categories || !allItems || !taxRates) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-brown/40 font-sans animate-pulse-gentle">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* ===== LEFT: Items panel ===== */}
      <div className="flex-1 flex flex-col min-w-0 p-4 pr-2">
        {/* Search bar */}
        <div className="mb-3">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brown/30" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFocusZone('search');
                setSelectedGridIndex(-1);
              }}
              onFocus={() => {
                setFocusZone('search');
                setSelectedGridIndex(-1);
                setSelectedCartIndex(-1);
              }}
              placeholder={t('billing.search_placeholder')}
              className="w-full bg-cream-card rounded-card pl-11 pr-4 py-3 text-sm font-sans text-espresso
                         placeholder:text-brown/30 shadow-soft border-0 outline-none
                         focus:shadow-medium focus:ring-2 focus:ring-teal/20 transition-all"
              id="search-items"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brown/30 hover:text-espresso p-1"
                onClick={() => setSearchQuery('')}
              >✕</button>
            )}
          </div>
        </div>

        {/* Category tabs & Sell-By Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1 border-b border-brown/10">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            <button
              className={`category-tab ${!activeCategory ? 'category-tab-active' : 'category-tab-inactive'}`}
              onClick={() => handleSelectCategory(null)}
            >
              {t('billing.all_items')}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-tab ${activeCategory === cat.id ? 'category-tab-active' : 'category-tab-inactive'}`}
                onClick={() => handleSelectCategory(cat.id)}
              >
                {getCategoryName(cat)}
              </button>
            ))}
          </div>

          {/* Sell-By Filter Pills: [ All | By Weight | By Piece ] */}
          <div className="flex items-center gap-1 bg-cream-card p-1 rounded-xl border border-brown/10 shrink-0">
            <button
              type="button"
              id="filter-all"
              onClick={() => setSellByFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all ${
                sellByFilter === 'all'
                  ? 'bg-teal text-white shadow-soft'
                  : 'text-brown/70 hover:text-espresso hover:bg-black/5'
              }`}
              title="Shortcut: Alt+1"
            >
              All (Alt+1)
            </button>
            <button
              type="button"
              id="filter-weight"
              onClick={() => setSellByFilter('weight')}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold flex items-center gap-1 transition-all ${
                sellByFilter === 'weight'
                  ? 'bg-teal text-white shadow-soft'
                  : 'text-brown/70 hover:text-espresso hover:bg-black/5'
              }`}
              title="Shortcut: Alt+2"
            >
              <Scale size={12} />
              <span>By Weight (Alt+2)</span>
            </button>
            <button
              type="button"
              id="filter-piece"
              onClick={() => setSellByFilter('piece')}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all ${
                sellByFilter === 'piece'
                  ? 'bg-teal text-white shadow-soft'
                  : 'text-brown/70 hover:text-espresso hover:bg-black/5'
              }`}
              title="Shortcut: Alt+3"
            >
              By Piece (Alt+3)
            </button>
          </div>
        </div>

        {/* Active Grid Item Cursor Indicator Banner */}
        {focusZone === 'grid' && selectedGridIndex >= 0 && displayedGridItems[selectedGridIndex] && (
          <div className="mb-2.5 px-3.5 py-2 rounded-xl bg-teal/10 border-2 border-teal/40 flex items-center justify-between text-xs font-sans animate-fade-in shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-teal animate-ping shrink-0" />
              <span className="font-semibold text-espresso truncate">
                Cursor: <span className="text-teal font-extrabold text-sm">{displayedGridItems[selectedGridIndex].name}</span>
              </span>
              <span className="text-brown/60 font-medium">· {formatINR(displayedGridItems[selectedGridIndex].price)}/{isItemWeight(displayedGridItems[selectedGridIndex]) ? 'kg' : (displayedGridItems[selectedGridIndex].unit || 'pc')}</span>
              <span className="text-teal font-mono text-[11px] font-bold bg-teal/15 px-2 py-0.5 rounded-md">
                Card {selectedGridIndex + 1} of {displayedGridItems.length}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-[11px] text-brown/60 font-medium hidden sm:inline">Press</span>
              <kbd className="px-2 py-1 rounded-lg bg-teal text-white font-mono font-bold text-xs shadow-soft">↵ Enter</kbd>
              <span className="text-[11px] text-brown/70 font-semibold hidden sm:inline">
                to {isItemWeight(displayedGridItems[selectedGridIndex]) ? 'select weight' : 'add to bill'}
              </span>
            </div>
          </div>
        )}

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
          {sellByFilter === 'all' ? (
            <div ref={gridRef} className="space-y-5 pb-4">
              {/* Section 1: Sold by Weight */}
              {weightItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Scale size={15} className="text-teal" />
                    <h3 className="font-serif font-bold text-espresso text-sm tracking-tight">
                      Sold by Weight
                    </h3>
                    <span className="text-[10px] font-mono font-semibold bg-teal/10 text-teal px-2 py-0.5 rounded-full">
                      {weightItems.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5">
                    {weightItems.map((item) => {
                      const globalIdx = displayedGridItems.findIndex(di => di.id === item.id);
                      const cat = categories.find(c => c.id === item.category_id);
                      return (
                        <ProductCard
                          key={item.id}
                          item={item}
                          categoryName={cat ? getCategoryName(cat) : ''}
                          isHighlighted={focusZone === 'grid' && globalIdx === selectedGridIndex}
                          onSelect={handleItemTap}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 2: Sold by Piece */}
              {pieceItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <h3 className="font-serif font-bold text-espresso text-sm tracking-tight">
                      Sold by Piece
                    </h3>
                    <span className="text-[10px] font-mono font-semibold bg-brown/10 text-brown px-2 py-0.5 rounded-full">
                      {pieceItems.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5">
                    {pieceItems.map((item) => {
                      const globalIdx = displayedGridItems.findIndex(di => di.id === item.id);
                      const cat = categories.find(c => c.id === item.category_id);
                      return (
                        <ProductCard
                          key={item.id}
                          item={item}
                          categoryName={cat ? getCategoryName(cat) : ''}
                          isHighlighted={focusZone === 'grid' && globalIdx === selectedGridIndex}
                          onSelect={handleItemTap}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5 pb-4">
              {displayedGridItems.map((item, index) => {
                const cat = categories.find(c => c.id === item.category_id);
                return (
                  <ProductCard
                    key={item.id}
                    item={item}
                    categoryName={cat ? getCategoryName(cat) : ''}
                    isHighlighted={focusZone === 'grid' && index === selectedGridIndex}
                    onSelect={handleItemTap}
                  />
                );
              })}
            </div>
          )}

          {displayedGridItems.length === 0 && (
            <div className="flex items-center justify-center h-40 text-brown/30 font-sans text-sm">
              No items found
            </div>
          )}
        </div>

        {/* Keyboard shortcut hints */}
        <div className="mt-2.5 flex items-center justify-between border-t border-brown/10 pt-2 text-xs font-sans text-brown/60">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">↓</kbd>
              <span>Grid</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Tab</kbd>/<kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">F3</kbd>
              <span>Bill List</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Enter</kbd>
              <span>{focusZone === 'search' && !searchQuery.trim() && cartItems.length > 0 ? 'Finalize' : 'Add/Edit'}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">1-6</kbd>
              <span>Preset weight</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">G/K</kbd>
              <span>Unit</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Alt+1/2/3</kbd>
              <span>Filter</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">+/-</kbd>
              <span>Qty/Weight</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Del</kbd>
              <span>Remove</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">F8</kbd>
              <span>Finalize</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">F2</kbd>
              <span>New Bill</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Esc</kbd>
              <span>Search</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-cream-dark border border-brown/15 text-[10px] font-mono font-semibold text-espresso shadow-xs">Ctrl+P</kbd>
              <span>Reprint</span>
            </span>
          </div>
          {/* Active zone indicator badge */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-2">
            <span className="text-[10px] text-brown/40 font-mono uppercase tracking-wider">Cursor:</span>
            <span className={`text-[11px] font-semibold font-mono px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              focusZone === 'grid' ? 'bg-teal text-white shadow-xs' :
              focusZone === 'bill' ? 'bg-espresso text-cream shadow-xs' :
              'bg-cream-dark text-brown border border-brown/20'
            }`}>
              {focusZone === 'grid'
                ? `Grid · ${selectedGridIndex >= 0 && displayedGridItems[selectedGridIndex] ? displayedGridItems[selectedGridIndex].name : 'Card 1'}`
                : focusZone === 'bill'
                ? `Bill · ${cartItems.length} items`
                : 'Search'}
            </span>
          </div>
        </div>
      </div>

      {/* ===== RIGHT: Cart panel ===== */}
      <div className="w-[380px] min-w-[380px] flex flex-col bg-cream-card shadow-soft m-2 ml-0 rounded-card overflow-hidden">
        {/* Cart header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-brown/5">
          <h2 className="font-serif font-semibold text-espresso text-lg">
            {t('billing.cart_title')}
          </h2>
          <div className="flex items-center gap-2">
            {heldBills.length > 0 && (
              <button
                className="text-xs font-sans font-medium text-teal bg-teal/10 px-3 py-1.5 rounded-btn hover:bg-teal/20 transition-colors min-h-tap flex items-center"
                onClick={() => setShowHeldBills(!showHeldBills)}
                id="btn-held-bills"
              >
                {t('billing.held_bills')} ({heldBills.length})
              </button>
            )}
            {cartItems.length > 0 && (
              <button
                className="text-xs font-sans text-brown/40 hover:text-crimson transition-colors px-2 py-1.5 min-h-tap"
                onClick={clearCart}
                id="btn-clear-cart"
              >
                {t('billing.clear')}
              </button>
            )}
          </div>
        </div>

        {/* Held bills dropdown */}
        {showHeldBills && heldBills.length > 0 && (
          <div className="border-b border-brown/5 bg-cream-dark/50 px-4 py-2 space-y-1.5 animate-fade-in">
            {heldBills.map(held => (
              <div key={held.id} className="flex items-center justify-between text-sm">
                <span className="text-brown font-sans">
                  {held.cartItems.length} items · {formatINR(held.totals.grand_total)}
                  <span className="text-brown/30 text-xs ml-1">{formatTime(held.held_at)}</span>
                </span>
                <div className="flex gap-1">
                  <button
                    className="text-xs text-teal font-medium px-2 py-1 rounded hover:bg-teal/10 min-h-tap"
                    onClick={() => { retrieveHeldBill(held.id); setShowHeldBills(false); }}
                  >
                    {t('billing.retrieve')}
                  </button>
                  <button
                    className="text-xs text-crimson/60 px-2 py-1 rounded hover:bg-crimson/10 min-h-tap"
                    onClick={() => removeHeldBill(held.id)}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== Keyboard Input Strip ===== */}
        {/* Enter-key billing flow: Item Code → Quantity → (empty Enter → Payment → finalize) */}
        <div className="border-b border-brown/5 px-4 py-3 space-y-2 bg-cream/50">
          <div className="flex gap-2">
            {/* Item Code / Name input */}
            <div className="flex-1 relative">
              <input
                ref={itemCodeRef}
                type="text"
                value={kbItemCode}
                onChange={(e) => {
                  setKbItemCode(e.target.value);
                  setKbError('');
                  setKbMatchedItem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleItemCodeEnter();
                  }
                }}
                placeholder="Item code / name..."
                className={`w-full bg-cream-card rounded-xl pl-3 pr-3 py-2 text-sm font-sans text-espresso
                           border shadow-soft outline-none transition-all placeholder:text-brown/30
                           focus:shadow-medium focus:ring-2 focus:ring-teal/20
                           ${kbError ? 'border-crimson/40 focus:ring-crimson/20' : 'border-brown/15 focus:border-teal'}`}
                id="kb-item-code"
                autoComplete="off"
              />
            </div>

            {/* Quantity input */}
            <div className="w-20">
              <input
                ref={quantityRef}
                type="text"
                inputMode="decimal"
                value={kbQuantity}
                onChange={(e) => {
                  setKbQuantity(e.target.value);
                  setKbError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuantityEnter();
                  }
                  // Escape from quantity → back to item code
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setKbMatchedItem(null);
                    setKbQuantity('1');
                    itemCodeRef.current?.focus();
                  }
                }}
                placeholder="Qty"
                className="w-full bg-cream-card rounded-xl px-3 py-2 text-sm font-sans text-espresso text-center
                           border border-brown/15 shadow-soft outline-none transition-all placeholder:text-brown/30
                           focus:shadow-medium focus:ring-2 focus:ring-teal/20 focus:border-teal"
                id="kb-quantity"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Matched item feedback or error message */}
          {kbMatchedItem && (
            <div className="flex items-center justify-between px-1 animate-fade-in">
              <span className="text-xs font-sans font-medium text-teal flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {kbMatchedItem.name}
                {kbMatchedItem.item_type === 'weight' && <span className="text-brown/40">(by weight)</span>}
              </span>
              <span className="text-xs font-sans font-semibold text-espresso">
                {formatINR(kbMatchedItem.price)}
                <span className="text-brown/40 font-normal">/{kbMatchedItem.item_type === 'weight' ? 'kg' : 'pc'}</span>
              </span>
            </div>
          )}
          {kbError && (
            <p className="text-xs font-sans text-crimson px-1 animate-fade-in">{kbError}</p>
          )}

          {/* Payment field — visible when cart has items & user pressed Enter on empty item code */}
          {cartItems.length > 0 && (
            <div className="pt-1">
              <div className="relative">
                <input
                  ref={paymentRef}
                  type="text"
                  inputMode="decimal"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handlePaymentEnter();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      itemCodeRef.current?.focus();
                    }
                  }}
                  placeholder={`Press Enter to finalize · Total: ${formatINR(totals.grand_total)}`}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-sans font-semibold text-espresso
                             border shadow-soft outline-none transition-all placeholder:text-brown/30
                             focus:shadow-medium focus:ring-2 focus:ring-teal/20 focus:border-teal
                             ${isSaving ? 'bg-teal/10 border-teal/30' : 'bg-cream-card border-brown/15'}`}
                  id="kb-payment"
                  autoComplete="off"
                  disabled={isSaving}
                />
                {isSaving && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-teal text-xs font-sans animate-pulse">
                    Printing...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cart items */}
        <div ref={cartListRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-2">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-brown/20">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <line x1="8" y1="9" x2="16" y2="9" />
                <line x1="8" y1="13" x2="14" y2="13" />
              </svg>
              <p className="font-sans text-sm">{t('billing.cart_empty')}</p>
              <p className="font-sans text-xs mt-0.5">{t('billing.cart_empty_sub')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {cartItems.map((ci, index) => (
                  <CartLineItem
                    key={ci.id}
                    item={ci}
                    isSelected={focusZone === 'bill' && index === selectedCartIndex}
                    onUpdateQuantity={(id, q) => q >= 1 ? updateQuantity(id, q) : removeItem(id)}
                    onUpdateWeight={(id, w) => w > 0.01 ? updateWeight(id, w) : removeItem(id)}
                    onEditWeight={(cartItem) => {
                      setWeightPickerState({
                        show: true,
                        item: { id: cartItem.item_id, name: cartItem.item_name, price: cartItem.price, unit: 'kg' },
                        taxRate: taxRateMap[cartItem.tax_rate_id],
                        editCartItemId: cartItem.id,
                        initialWeightKg: cartItem.weight_kg,
                      });
                      setFocusZone('weightPicker');
                    }}
                    onRemoveItem={removeItem}
                    onRemoveDiscount={removeLineDiscount}
                    onLineDiscountClick={(id) => {
                      setDiscountPanel({ show: true, lineItemId: id, mode: 'line' });
                      setDiscountValue('');
                    }}
                  />
                ))}
              </AnimatePresence>
              <div ref={cartEndRef} />
            </div>
          )}
        </div>

        {/* Discount panel (inline, not modal) */}
        {discountPanel.show && (
          <div className="border-t border-brown/5 bg-cream-dark/30 px-4 py-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans font-semibold text-espresso text-sm">
                {discountPanel.mode === 'line' ? t('billing.line_discount') : t('billing.bill_discount')}
              </h3>
              <button
                className="text-brown/30 hover:text-espresso text-sm p-1"
                onClick={() => setDiscountPanel({ show: false, lineItemId: null, mode: 'bill' })}
              >✕</button>
            </div>

            {/* Preset buttons */}
            <div className="flex gap-1.5 mb-2">
              {DISCOUNT_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  className="text-xs font-sans font-medium bg-teal/10 text-teal px-3 py-2 rounded-btn hover:bg-teal/20 transition-colors min-h-tap"
                  onClick={() => handlePresetDiscount(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom discount */}
            <div className="flex gap-2">
              <div className="flex bg-cream-card rounded-btn overflow-hidden shadow-inner">
                <button
                  className={`px-3 py-2 text-xs font-medium transition-colors ${discountType === 'percent' ? 'bg-teal text-white' : 'text-brown'}`}
                  onClick={() => setDiscountType('percent')}
                >%</button>
                <button
                  className={`px-3 py-2 text-xs font-medium transition-colors ${discountType === 'flat' ? 'bg-teal text-white' : 'text-brown'}`}
                  onClick={() => setDiscountType('flat')}
                >₹</button>
              </div>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="Value"
                className="flex-1 bg-cream-card rounded-btn px-3 py-2 text-sm font-sans text-espresso shadow-inner outline-none focus:ring-2 focus:ring-teal/20"
                autoFocus
              />
              <button className="btn-primary px-4 py-2 text-sm" onClick={handleApplyDiscount}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        )}

        {/* Bill summary */}
        {cartItems.length > 0 && (
          <div className="border-t border-brown/5 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm font-sans">
              <span className="text-brown">{t('billing.subtotal')}</span>
              <span className="text-espresso font-medium">{formatINR(totals.subtotal)}</span>
            </div>

            {totals.discount_amount > 0 && (
              <div className="flex justify-between text-sm font-sans">
                <span className="text-teal flex items-center gap-1">
                  {t('billing.discount')}
                  {billDiscount && (
                    <button className="text-[10px] text-crimson/40 hover:text-crimson" onClick={removeBillDiscount}>✕</button>
                  )}
                </span>
                <span className="text-teal font-medium">−{formatINR(totals.discount_amount)}</span>
              </div>
            )}

            {totals.cgst_total > 0 && (
              <>
                <div className="flex justify-between text-xs font-sans">
                  <span className="text-brown/50">{t('billing.cgst')}</span>
                  <span className="text-brown/60">{formatINR(totals.cgst_total)}</span>
                </div>
                <div className="flex justify-between text-xs font-sans">
                  <span className="text-brown/50">{t('billing.sgst')}</span>
                  <span className="text-brown/60">{formatINR(totals.sgst_total)}</span>
                </div>
              </>
            )}

            {/* Grand total */}
            <div className="flex justify-between items-end pt-2 border-t border-brown/10">
              <span className="font-serif font-semibold text-espresso text-base">{t('billing.total')}</span>
              <span className="font-sans text-total text-crimson">{formatINR(totals.grand_total)}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-1 space-y-2">
          {cartItems.length > 0 && (
            <>
              <button
                className="btn-crimson w-full text-base py-4"
                onClick={handleFinalize}
                id="btn-finalize"
              >
                {t('billing.finalize')} · {formatINR(totals.grand_total)}
              </button>
              <div className="flex gap-2">
                <button
                  className="btn-ghost flex-1 text-sm"
                  onClick={handleHold}
                  id="btn-hold"
                >
                  {t('billing.hold')}
                </button>
                <button
                  className="btn-ghost flex-1 text-sm"
                  onClick={() => {
                    setDiscountPanel({ show: true, lineItemId: null, mode: 'bill' });
                    setDiscountValue('');
                  }}
                  id="btn-bill-discount"
                >
                  {t('billing.apply_discount')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== WeightPicker modal ===== */}
      {weightPickerState.show && (
        <WeightPicker
          item={weightPickerState.item}
          initialWeightKg={weightPickerState.initialWeightKg}
          onConfirm={handleWeightPickerConfirm}
          onCancel={handleWeightPickerCancel}
        />
      )}

      {/* Void PIN overlay */}
      {showVoidPin && (
        <div className="fixed inset-0 bg-espresso/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowVoidPin(false); }}
        >
          <OwnerPinPrompt
            title={t('billing.void_confirm')}
            onVerified={handleVoidSubmit}
            onCancel={() => setShowVoidPin(false)}
          />
        </div>
      )}
    </div>
  );
}
