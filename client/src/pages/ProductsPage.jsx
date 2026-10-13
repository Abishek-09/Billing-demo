import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import db from '../db/dexie.js';
import useToastStore from '../store/toastStore.js';
import { formatINR } from '../utils/tax.js';
import SafeImage from '../components/SafeImage.jsx';
import AddItemModal from '../components/AddItemModal.jsx';

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const addToast = useToastStore((s) => s.addToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Live queries from Dexie
  const categories = useLiveQuery(() => db.categories.where('active').equals(1).sortBy('sort_order'), []);
  const allItems = useLiveQuery(() => db.items.where('active').equals(1).toArray(), []);
  const taxRates = useLiveQuery(() => db.tax_rates.toArray(), []);

  const selectedCategoryId = searchParams.get('category') || null;

  // Filter items
  const filteredItems = useMemo(() => {
    if (!allItems) return [];
    let list = allItems;
    if (selectedCategoryId) {
      list = list.filter((item) => item.category_id === selectedCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.barcode && item.barcode.includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allItems, selectedCategoryId, searchQuery]);

  // Tax lookup
  const taxMap = useMemo(() => {
    if (!taxRates) return {};
    return taxRates.reduce((acc, tr) => {
      acc[tr.id] = tr;
      return acc;
    }, {});
  }, [taxRates]);

  // Category lookup
  const catMap = useMemo(() => {
    if (!categories) return {};
    return categories.reduce((acc, c) => {
      acc[c.id] = c;
      return acc;
    }, {});
  }, [categories]);

  // Category item counts
  const categoryCounts = useMemo(() => {
    if (!allItems) return {};
    return allItems.reduce((acc, item) => {
      acc[item.category_id] = (acc[item.category_id] || 0) + 1;
      return acc;
    }, {});
  }, [allItems]);

  // Delete product
  const handleDeleteItem = async (item) => {
    if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      try {
        await db.items.delete(item.id);
        addToast(`Deleted "${item.name}"`, 'info');
      } catch (err) {
        console.error(err);
        addToast('Failed to delete item', 'warning');
      }
    }
  };

  // Toggle active state
  const handleToggleActive = async (item) => {
    try {
      const newStatus = item.active === 1 ? 0 : 1;
      await db.items.update(item.id, { active: newStatus, updated_at: new Date().toISOString() });
      addToast(`${item.name} is now ${newStatus ? 'active' : 'inactive'}`, 'success');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-cream">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif font-bold text-espresso text-2xl tracking-tight">Products Menu</h1>
          <p className="text-brown/60 font-sans text-xs mt-0.5">
            Manage bakery products, teas, packaged goods, prices and inventory
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn-primary self-start sm:self-auto flex items-center gap-2 text-sm px-4 py-2.5 shadow-soft hover:shadow-medium"
          id="btn-add-product"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brown/40"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, description, or barcode..."
            className="w-full bg-cream-card rounded-xl pl-10 pr-4 py-2.5 text-sm font-sans text-espresso border border-brown/15 shadow-soft focus:ring-2 focus:ring-teal/20 focus:border-teal outline-none transition-all placeholder:text-brown/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brown/40 hover:text-espresso p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Total counts badge */}
        <div className="flex items-center gap-2 px-3.5 py-2 bg-cream-card rounded-xl border border-brown/10 text-xs font-sans text-brown">
          <span className="font-semibold text-espresso">{filteredItems.length}</span> items showing
          <span className="text-brown/30">|</span>
          <span className="font-semibold text-espresso">{allItems?.length || 0}</span> total
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2 mb-4">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className={`px-3.5 py-2 rounded-xl text-xs font-sans font-semibold whitespace-nowrap transition-all shadow-soft ${
            !selectedCategoryId
              ? 'bg-teal text-white shadow-medium'
              : 'bg-cream-card text-brown/80 hover:bg-cream-card/90 border border-brown/10'
          }`}
        >
          All Items ({allItems?.length || 0})
        </button>
        {categories?.map((cat) => {
          const count = categoryCounts[cat.id] || 0;
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSearchParams({ category: cat.id })}
              className={`px-3.5 py-2 rounded-xl text-xs font-sans font-semibold whitespace-nowrap transition-all shadow-soft flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-teal text-white shadow-medium'
                  : 'bg-cream-card text-brown/80 hover:bg-cream-card/90 border border-brown/10'
              }`}
            >
              <span>{cat.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-brown/10 text-brown'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
        {filteredItems.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-cream-card rounded-2xl border border-dashed border-brown/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brown/30 mb-2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <p className="font-serif font-bold text-espresso text-base">No products match your search</p>
            <p className="font-sans text-xs text-brown/50 mt-1">Try another keyword or select a different category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
            {filteredItems.map((item) => {
              const cat = catMap[item.category_id];
              const tax = taxMap[item.tax_rate_id];
              return (
                <div
                  key={item.id}
                  className="bg-cream-card rounded-2xl p-3.5 shadow-soft hover:shadow-medium border border-brown/10 flex flex-col justify-between transition-all group"
                >
                  <div>
                    {/* Top image & badges */}
                    <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden mb-3 bg-cream/60">
                      <SafeImage
                        src={item.image_url}
                        alt={item.name}
                        categoryName={cat?.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {/* Portion/Badge tag */}
                      <span className="absolute top-2 left-2 bg-espresso/80 backdrop-blur-md text-white text-[10px] font-sans font-semibold px-2 py-0.5 rounded-md shadow-sm">
                        {item.badge || (item.item_type === 'weight' ? 'By Weight' : `1 ${item.unit}`)}
                      </span>

                      {/* Selling type icon */}
                      <span className="absolute top-2 right-2 bg-white/90 backdrop-blur-md text-teal text-[10px] font-sans font-bold px-2 py-0.5 rounded-md shadow-sm">
                        {item.item_type === 'weight' ? 'KG' : 'UNIT'}
                      </span>
                    </div>

                    {/* Product Name & Category */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-teal">
                          {cat?.name || 'Uncategorized'}
                        </span>
                        <h3 className="font-serif font-bold text-espresso text-base leading-snug line-clamp-1">
                          {item.name}
                        </h3>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-serif font-bold text-espresso text-base">
                          {formatINR(item.price)}
                        </span>
                        {item.item_type === 'weight' && (
                          <span className="text-[10px] font-sans text-brown/50 block">/ kg</span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="font-sans text-xs text-brown/60 line-clamp-2 mt-1">
                        {item.description}
                      </p>
                    )}

                    {/* Meta features */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {tax && (
                        <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-brown/5 text-brown/70 font-medium">
                          {tax.label}
                        </span>
                      )}
                      {item.track_stock === 1 && (
                        <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/50">
                          Stock Tracked
                        </span>
                      )}
                      {item.is_made_to_order === 1 && (
                        <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200/50">
                          Kitchen Token
                        </span>
                      )}
                      {item.barcode && (
                        <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-200/50 font-mono">
                          {item.barcode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-brown/10 text-xs font-sans">
                    <span className="text-brown/40 text-[11px]">
                      Unit: {item.unit || (item.item_type === 'weight' ? 'kg' : 'pc')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item)}
                      className="text-crimson/70 hover:text-crimson font-medium text-xs flex items-center gap-1 p-1 rounded hover:bg-crimson/5 transition-colors"
                      title="Delete Product"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <AddItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        categories={categories || []}
        taxRates={taxRates || []}
      />
    </div>
  );
}
