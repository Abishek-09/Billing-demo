import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/dexie.js';
import useToastStore from '../store/toastStore.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function AddItemModal({ isOpen, onClose, categories = [], taxRates = [] }) {
  const { t } = useI18n();
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [itemType, setItemType] = useState('unit'); // 'unit' | 'weight'
  const [unit, setUnit] = useState('pc');
  const [price, setPrice] = useState('');
  const [taxRateId, setTaxRateId] = useState('');
  const [badge, setBadge] = useState('1 pc');
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [isMadeToOrder, setIsMadeToOrder] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setCategoryId(categories.length > 0 ? categories[0].id : '');
      setIsNewCategory(false);
      setNewCategoryName('');
      setItemType('unit');
      setUnit('pc');
      setPrice('');
      setTaxRateId(taxRates.length > 0 ? taxRates[1]?.id || taxRates[0].id : ''); // Default GST 5% or first
      setBadge('1 pc');
      setDescription('');
      setBarcode('');
      setImageUrl('');
      setTrackStock(true);
      setIsMadeToOrder(false);
    }
  }, [isOpen, categories, taxRates]);

  // Adjust unit and badge when itemType switches
  const handleTypeChange = (type) => {
    setItemType(type);
    if (type === 'weight') {
      setUnit('kg');
      setBadge('By Weight');
      setIsMadeToOrder(false);
    } else {
      setUnit('pc');
      setBadge('1 pc');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('Please enter a product name', 'warning');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      addToast('Please enter a valid price', 'warning');
      return;
    }

    setSaving(true);
    try {
      let finalCategoryId = categoryId;
      const now = new Date().toISOString();

      // 1. Create category if new
      if (isNewCategory && newCategoryName.trim()) {
        finalCategoryId = uuidv4();
        await db.categories.add({
          id: finalCategoryId,
          name: newCategoryName.trim(),
          sort_order: categories.length + 1,
          active: 1,
          created_at: now,
        });
      }

      if (!finalCategoryId) {
        addToast('Please select or create a category', 'warning');
        setSaving(false);
        return;
      }

      // Lookup tax rate percentage
      const selectedTax = taxRates.find((tr) => tr.id === taxRateId);
      const taxRatePct = selectedTax ? selectedTax.rate_pct : 0;

      const newItemId = uuidv4();
      const newItem = {
        id: newItemId,
        category_id: finalCategoryId,
        tax_rate_id: taxRateId || (taxRates[0]?.id || ''),
        tax_rate_pct: taxRatePct,
        name: name.trim(),
        description: description.trim(),
        barcode: barcode.trim(),
        item_type: itemType,
        sellBy: itemType === 'weight' ? 'weight' : 'piece',
        unit: unit.trim() || (itemType === 'weight' ? 'kg' : 'pc'),
        price: numPrice,
        badge: badge.trim() || (itemType === 'weight' ? 'By Weight' : `1 ${unit}`),
        image_url: imageUrl.trim() || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
        track_stock: trackStock ? 1 : 0,
        is_made_to_order: isMadeToOrder ? 1 : 0,
        active: 1,
        created_at: now,
        updated_at: now,
      };

      // 2. Add to Dexie items
      await db.items.add(newItem);

      // 3. Add opening stock ledger if tracked
      if (trackStock) {
        const openingQty = itemType === 'weight' ? 10 : 50;
        await db.stock_ledger.add({
          id: uuidv4(),
          item_id: newItemId,
          day_session_id: null,
          ref_type: 'opening_stock',
          ref_id: null,
          qty_change: openingQty,
          balance_after: openingQty,
          notes: 'Initial stock on creation',
          created_at: now,
        });
      }

      addToast(`Added "${newItem.name}" to menu!`, 'success');
      onClose();
    } catch (err) {
      console.error('[AddItemModal] Error saving product:', err);
      addToast('Failed to save product', 'warning');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-espresso/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-cream rounded-2xl shadow-lifted w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-brown/10"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-cream-card border-b border-brown/10 flex items-center justify-between">
            <div>
              <h2 className="font-serif font-bold text-espresso text-xl">Add Menu Product</h2>
              <p className="text-xs font-sans text-brown/60">Create a new item or category in Bake & Brew POS</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-brown/40 hover:text-espresso p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
            {/* Product Name */}
            <div>
              <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pistachio Croissant, Kulhad Chai"
                className="w-full bg-cream-card rounded-xl px-4 py-2.5 text-sm font-sans text-espresso border border-brown/20 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition-all placeholder:text-brown/30"
              />
            </div>

            {/* Category Selector & Add New Category */}
            <div className="bg-cream-card/60 p-3.5 rounded-xl border border-brown/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-sans font-semibold text-espresso uppercase tracking-wider">
                  Category *
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewCategory(!isNewCategory)}
                  className="text-xs font-sans font-semibold text-teal hover:underline flex items-center gap-1"
                >
                  {isNewCategory ? '← Choose Existing' : '+ New Category'}
                </button>
              </div>

              {isNewCategory ? (
                <div>
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter new category name (e.g. Cold Beverages, Croissants)"
                    className="w-full bg-white rounded-lg px-3.5 py-2 text-sm font-sans text-espresso border border-teal/40 focus:ring-2 focus:ring-teal/20 outline-none"
                  />
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-white rounded-lg px-3.5 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Item Type & Pricing Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Selling Type
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-cream-card p-1 rounded-xl border border-brown/15">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('unit')}
                    className={`py-1.5 text-xs font-sans font-medium rounded-lg transition-all ${
                      itemType === 'unit' ? 'bg-teal text-white shadow-sm' : 'text-brown/70 hover:text-espresso'
                    }`}
                  >
                    Per Unit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('weight')}
                    className={`py-1.5 text-xs font-sans font-medium rounded-lg transition-all ${
                      itemType === 'weight' ? 'bg-teal text-white shadow-sm' : 'text-brown/70 hover:text-espresso'
                    }`}
                  >
                    By Weight
                  </button>
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Price (₹) * {itemType === 'weight' && <span className="text-[10px] text-brown/50">per kg</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brown/40 font-semibold text-sm">₹</span>
                  <input
                    type="number"
                    step={itemType === 'weight' ? '1' : '0.5'}
                    required
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={itemType === 'weight' ? '600' : '45'}
                    className="w-full bg-cream-card rounded-xl pl-8 pr-4 py-2 text-sm font-sans text-espresso font-semibold border border-brown/20 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Unit, Badge & Tax Rate */}
            <div className="grid grid-cols-3 gap-3">
              {/* Unit */}
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Unit Label
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pc, cup, pkt, kg"
                  className="w-full bg-cream-card rounded-xl px-3 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                />
              </div>

              {/* Badge */}
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Card Badge
                </label>
                <input
                  type="text"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="1 pc, By Weight"
                  className="w-full bg-cream-card rounded-xl px-3 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                />
              </div>

              {/* Tax Rate */}
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Tax Rate
                </label>
                <select
                  value={taxRateId}
                  onChange={(e) => setTaxRateId(e.target.value)}
                  className="w-full bg-cream-card rounded-xl px-2.5 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                >
                  {taxRates.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description & Barcode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g., 8901234560020"
                  className="w-full bg-cream-card rounded-xl px-3 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none placeholder:text-brown/30"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-cream-card rounded-xl px-3 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none placeholder:text-brown/30"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short appetizing description for cashier & bill"
                className="w-full bg-cream-card rounded-xl px-4 py-2 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none placeholder:text-brown/30"
              />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-cream-card/80 border border-brown/10 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={trackStock}
                  onChange={(e) => setTrackStock(e.target.checked)}
                  className="mt-0.5 rounded border-brown/30 text-teal focus:ring-teal"
                />
                <div>
                  <span className="block text-xs font-sans font-semibold text-espresso">Track Inventory</span>
                  <span className="block text-[11px] font-sans text-brown/50">Auto-decrements on sale</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-cream-card/80 border border-brown/10 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isMadeToOrder}
                  disabled={itemType === 'weight'}
                  onChange={(e) => setIsMadeToOrder(e.target.checked)}
                  className="mt-0.5 rounded border-brown/30 text-teal focus:ring-teal"
                />
                <div>
                  <span className="block text-xs font-sans font-semibold text-espresso">Made to Order</span>
                  <span className="block text-[11px] font-sans text-brown/50">Generates kitchen token</span>
                </div>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-btn border border-brown/20 font-sans font-semibold text-brown/70 hover:bg-black/5 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-btn bg-teal hover:bg-teal-dark text-white font-sans font-bold shadow-soft transition-all text-sm flex items-center justify-center gap-2"
              >
                {saving ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Save Product</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
