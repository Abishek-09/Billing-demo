import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/dexie.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import useAuthStore from '../store/authStore.js';
import useToastStore from '../store/toastStore.js';
import { seedDatabase } from '../db/seed.js';

export default function Sidebar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [seeding, setSeeding] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);

  // Live queries for project items & categories
  const categories = useLiveQuery(
    () => db.categories.where('active').equals(1).sortBy('sort_order'),
    []
  );
  const allItems = useLiveQuery(
    () => db.items.where('active').equals(1).toArray(),
    []
  );

  // Category items count map
  const categoryCountMap = useMemo(() => {
    if (!allItems) return {};
    return allItems.reduce((acc, item) => {
      acc[item.category_id] = (acc[item.category_id] || 0) + 1;
      return acc;
    }, {});
  }, [allItems]);

  const selectedCategoryParam = searchParams.get('category');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCategoryClick = (catId) => {
    const isCurrentlySelected = selectedCategoryParam === catId;
    const targetCatId = isCurrentlySelected ? null : catId;

    if (location.pathname === '/products' || location.pathname === '/categories') {
      navigate(targetCatId ? `/products?category=${targetCatId}` : '/products');
    } else {
      // Default to billing page category filter
      navigate(targetCatId ? `/billing?category=${targetCatId}` : '/billing');
    }
  };

  return (
    <aside className="w-[230px] min-w-[230px] bg-teal flex flex-col h-full border-r border-teal-dark/30 select-none">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-serif font-bold text-white text-xl leading-tight">
          Bake &<br />Brew
        </h1>
        <p className="text-white/50 text-xs font-sans mt-1">{t('app.tagline')}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin">
        {/* 1. Billing */}
        <button
          type="button"
          id="nav-billing"
          className={`sidebar-item w-full ${
            location.pathname === '/billing' && !selectedCategoryParam
              ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
          }`}
          onClick={() => navigate('/billing')}
        >
          <BillingIcon active={location.pathname === '/billing' && !selectedCategoryParam} />
          <span className="text-sm font-medium">{t('sidebar.billing')}</span>
        </button>

        {/* 2. Products Menu */}
        <button
          type="button"
          id="nav-products"
          className={`sidebar-item w-full flex items-center justify-between ${
            location.pathname === '/products'
              ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
          }`}
          onClick={() => navigate('/products')}
        >
          <div className="flex items-center gap-3">
            <ProductsIcon active={location.pathname === '/products'} />
            <span className="text-sm font-medium">{t('sidebar.products')}</span>
          </div>
          {allItems && allItems.length > 0 && (
            <span className="text-[10px] font-mono bg-white/15 px-2 py-0.5 rounded-full text-white/80 font-semibold">
              {allItems.length}
            </span>
          )}
        </button>

        {/* 3. Categories Menu (with expandable project categories sub-items) */}
        <div className="space-y-0.5">
          <div
            className={`sidebar-item w-full flex items-center justify-between group ${
              location.pathname === '/categories'
                ? 'sidebar-item-active'
                : 'sidebar-item-inactive'
            }`}
          >
            <button
              type="button"
              id="nav-categories"
              className="flex items-center gap-3 flex-1 text-left"
              onClick={() => navigate('/categories')}
            >
              <CategoriesIcon active={location.pathname === '/categories'} />
              <span className="text-sm font-medium">{t('sidebar.categories')}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCategoriesExpanded(!categoriesExpanded);
              }}
              className="p-1 text-white/50 hover:text-white transition-colors"
              title={categoriesExpanded ? 'Collapse categories' : 'Expand categories'}
            >
              <ChevronIcon expanded={categoriesExpanded} />
            </button>
          </div>

          {/* Expanded Project Categories Sub-List */}
          {categoriesExpanded && categories && categories.length > 0 && (
            <div className="pl-4 pr-1 py-1 space-y-0.5 animate-fade-in border-l border-white/10 ml-5 my-1">
              {categories.map((cat) => {
                const isCatActive = selectedCategoryParam === cat.id;
                const count = categoryCountMap[cat.id] || 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    id={`nav-cat-${cat.id}`}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-sans transition-all text-left ${
                      isCatActive
                        ? 'bg-white/20 text-white font-semibold shadow-xs'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-1">{cat.name}</span>
                    <span className="text-[10px] font-mono bg-black/15 px-1.5 py-0.2 rounded text-white/60 shrink-0">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Stock Count */}
        <button
          type="button"
          id="nav-stock"
          className={`sidebar-item w-full ${
            location.pathname === '/stock'
              ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
          }`}
          onClick={() => navigate('/stock')}
        >
          <StockIcon active={location.pathname === '/stock'} />
          <span className="text-sm font-medium">{t('sidebar.stock')}</span>
        </button>

        {/* 5. Day Close */}
        <button
          type="button"
          id="nav-day-close"
          className={`sidebar-item w-full ${
            location.pathname === '/day-close' || location.pathname === '/day_close'
              ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
          }`}
          onClick={() => navigate('/day-close')}
        >
          <DayCloseIcon active={location.pathname === '/day-close' || location.pathname === '/day_close'} />
          <span className="text-sm font-medium">{t('sidebar.day_close')}</span>
        </button>

      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3 mt-auto">
        {/* Status indicator */}
        <div className="flex items-center gap-2 px-4 py-1">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-amber-400 animate-pulse-gentle'}`} />
          <span className="text-white/50 text-xs font-sans">
            {isOnline ? t('common.online') : t('common.offline')}
          </span>
        </div>

        {/* Current user */}
        {user && (
          <div className="px-4 py-1.5 bg-black/10 rounded-xl">
            <p className="text-white/90 text-xs font-sans font-semibold truncate">
              {user.name}
            </p>
            <p className="text-white/40 text-[10px] font-sans uppercase font-mono tracking-wider">{user.role}</p>
          </div>
        )}

        {/* Refresh Demo Records */}
        <button
          type="button"
          disabled={seeding}
          className="sidebar-item sidebar-item-inactive w-full text-white/50 hover:text-white/90 text-xs py-2"
          onClick={async () => {
            setSeeding(true);
            try {
              await seedDatabase(true);
              addToast('Demo records populated for all menus!', 'success');
            } catch (err) {
              console.error(err);
              addToast('Failed to seed demo data', 'warning');
            } finally {
              setSeeding(false);
            }
          }}
          id="btn-seed-demo-data"
          title="Populate demo items, bills and stock records"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={seeding ? 'animate-spin' : ''}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          <span className="text-xs">{seeding ? 'Seeding...' : 'Reset Demo Data'}</span>
        </button>
      </div>
    </aside>
  );
}

// --- Inline SVG Icon Components ---

function BillingIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="14" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
}

function ProductsIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

function CategoriesIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function StockIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function DayCloseIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}



function ChevronIcon({ expanded }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
