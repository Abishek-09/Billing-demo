import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/dexie.js';
import useToastStore from '../store/toastStore.js';

export default function CategoriesPage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSortOrder, setNewCatSortOrder] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editName, setEditName] = useState('');

  // Live data
  const categories = useLiveQuery(() => db.categories.where('active').equals(1).sortBy('sort_order'), []);
  const allItems = useLiveQuery(() => db.items.where('active').equals(1).toArray(), []);

  // Category items grouping
  const categoryItemMap = useMemo(() => {
    if (!allItems) return {};
    return allItems.reduce((acc, item) => {
      if (!acc[item.category_id]) acc[item.category_id] = [];
      acc[item.category_id].push(item);
      return acc;
    }, {});
  }, [allItems]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  // Handle Add Category
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      addToast('Please enter a category name', 'warning');
      return;
    }

    try {
      const sortOrder = parseInt(newCatSortOrder, 10) || (categories ? categories.length + 1 : 1);
      const newId = uuidv4();
      await db.categories.add({
        id: newId,
        name: newCatName.trim(),
        sort_order: sortOrder,
        active: 1,
        created_at: new Date().toISOString(),
      });

      addToast(`Category "${newCatName}" added!`, 'success');
      setNewCatName('');
      setNewCatSortOrder('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      addToast('Failed to add category', 'warning');
    }
  };

  // Handle Edit Category
  const handleSaveEdit = async (catId) => {
    if (!editName.trim()) return;
    try {
      await db.categories.update(catId, { name: editName.trim() });
      addToast('Category updated', 'success');
      setEditingCategory(null);
      setEditName('');
    } catch (err) {
      console.error(err);
      addToast('Failed to update category', 'warning');
    }
  };

  // Handle Delete Category
  const handleDeleteCategory = async (category) => {
    const itemsInCat = categoryItemMap[category.id] || [];
    if (itemsInCat.length > 0) {
      addToast(`Cannot delete category with ${itemsInCat.length} existing items`, 'warning');
      return;
    }

    if (window.confirm(`Delete category "${category.name}"?`)) {
      try {
        await db.categories.delete(category.id);
        addToast(`Category "${category.name}" removed`, 'info');
      } catch (err) {
        console.error(err);
        addToast('Failed to delete category', 'warning');
      }
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-cream">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif font-bold text-espresso text-2xl tracking-tight">Menu Categories</h1>
          <p className="text-brown/60 font-sans text-xs mt-0.5">
            Organize bakery sections, beverage counters and product hierarchies
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewCatSortOrder(categories ? (categories.length + 1).toString() : '1');
            setShowAddModal(true);
          }}
          className="btn-primary self-start sm:self-auto flex items-center gap-2 text-sm px-4 py-2.5 shadow-soft hover:shadow-medium"
          id="btn-add-category"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Category</span>
        </button>
      </div>

      {/* Search Bar & Summary Stats */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
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
            placeholder="Search categories..."
            className="w-full bg-cream-card rounded-xl pl-10 pr-4 py-2.5 text-sm font-sans text-espresso border border-brown/15 shadow-soft focus:ring-2 focus:ring-teal/20 focus:border-teal outline-none transition-all placeholder:text-brown/30"
          />
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 bg-cream-card rounded-xl border border-brown/10 text-xs font-sans text-brown">
          <span className="font-semibold text-espresso">{categories?.length || 0}</span> Active Categories
          <span className="text-brown/30">|</span>
          <span className="font-semibold text-espresso">{allItems?.length || 0}</span> Total Products
        </div>
      </div>

      {/* Categories Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
        {filteredCategories.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-cream-card rounded-2xl border border-dashed border-brown/20">
            <p className="font-serif font-bold text-espresso text-base">No categories found</p>
            <p className="font-sans text-xs text-brown/50 mt-1">Try another search keyword or create a category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredCategories.map((category) => {
              const items = categoryItemMap[category.id] || [];
              const isEditing = editingCategory === category.id;

              return (
                <div
                  key={category.id}
                  className="bg-cream-card rounded-2xl p-5 shadow-soft hover:shadow-medium border border-brown/10 flex flex-col justify-between transition-all"
                >
                  <div>
                    {/* Top Order badge & Items count */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-sans font-bold bg-teal/10 text-teal px-2.5 py-1 rounded-lg">
                        Order #{category.sort_order}
                      </span>
                      <span className="text-xs font-sans font-semibold text-brown/70 bg-cream px-2 py-0.5 rounded-md border border-brown/10">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    {/* Category Title (Editable) */}
                    {isEditing ? (
                      <div className="flex items-center gap-2 my-1">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 bg-white rounded-lg px-2.5 py-1.5 text-sm font-serif font-bold text-espresso border border-teal focus:ring-1 focus:ring-teal outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(category.id)}
                          className="bg-teal text-white p-1.5 rounded-lg text-xs"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(null)}
                          className="text-brown/50 hover:text-espresso p-1.5 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between group">
                        <h2 className="font-serif font-bold text-espresso text-lg leading-tight">
                          {category.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(category.id);
                            setEditName(category.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-brown/40 hover:text-teal p-1 transition-opacity"
                          title="Rename category"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Product preview tags */}
                    <div className="mt-3">
                      <p className="text-[11px] font-sans font-medium text-brown/50 uppercase tracking-wider mb-1.5">
                        Sample Items
                      </p>
                      {items.length === 0 ? (
                        <p className="text-xs font-sans text-brown/40 italic">No products assigned yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {items.slice(0, 4).map((it) => (
                            <span
                              key={it.id}
                              className="text-[11px] font-sans bg-cream text-espresso px-2 py-0.5 rounded-md border border-brown/10 truncate max-w-[130px]"
                            >
                              {it.name}
                            </span>
                          ))}
                          {items.length > 4 && (
                            <span className="text-[10px] font-sans text-brown/50 px-1 py-0.5">
                              +{items.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-brown/10">
                    <button
                      type="button"
                      onClick={() => navigate(`/products?category=${category.id}`)}
                      className="text-xs font-sans font-semibold text-teal hover:underline flex items-center gap-1"
                    >
                      <span>View Products</span>
                      <span>→</span>
                    </button>

                    {items.length === 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category)}
                        className="text-crimson/70 hover:text-crimson text-xs font-sans font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-espresso/60 backdrop-blur-sm">
          <div className="bg-cream rounded-2xl shadow-lifted w-full max-w-md p-6 border border-brown/10 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-bold text-espresso text-xl">Add New Category</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-brown/40 hover:text-espresso p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g., Croissants & Danish, Smoothies"
                  className="w-full bg-cream-card rounded-xl px-4 py-2.5 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-semibold text-espresso uppercase tracking-wider mb-1.5">
                  Sort Order Number
                </label>
                <input
                  type="number"
                  min="1"
                  value={newCatSortOrder}
                  onChange={(e) => setNewCatSortOrder(e.target.value)}
                  placeholder="e.g., 10"
                  className="w-full bg-cream-card rounded-xl px-4 py-2.5 text-sm font-sans text-espresso border border-brown/20 focus:border-teal outline-none"
                />
                <p className="text-[11px] font-sans text-brown/50 mt-1">
                  Determines position in the category list and billing tabs
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-btn border border-brown/20 font-sans font-semibold text-brown/70 hover:bg-black/5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-btn bg-teal hover:bg-teal-dark text-white font-sans font-bold shadow-soft text-sm"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
