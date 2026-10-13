import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/dexie.js';
import useAuthStore from '../store/authStore.js';
import useToastStore from '../store/toastStore.js';
import { formatINR } from '../utils/tax.js';
import NumPad from '../components/NumPad.jsx';

import ProductsPage from './ProductsPage.jsx';
import CategoriesPage from './CategoriesPage.jsx';
import StockCountPage from './StockCountPage.jsx';
import DayClosePage from './DayClosePage.jsx';
import ToastContainer from '../components/ToastContainer.jsx';

/**
 * Admin Portal Page
 * Accessible via /billing/admin or /admin
 * Requires Owner PIN (0000) to unlock if current user is not an owner.
 */
export default function AdminPortalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loginAsOwner, switchToCashier } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);

  // Active tab in admin portal
  const activeTab = searchParams.get('tab') || 'overview';

  const isOwner = user?.role === 'owner';

  // Handle PIN submission
  const handlePinSubmit = async (pin) => {
    setAuthenticating(true);
    setPinError('');
    try {
      const success = await loginAsOwner(pin);
      if (success) {
        addToast('Admin Portal Unlocked! Welcome Owner.', 'success');
        setEnteredPin('');
      } else {
        setPinError('Invalid Owner PIN. Default PIN is 0000.');
        setEnteredPin('');
      }
    } catch (err) {
      console.error(err);
      setPinError('Error verifying PIN');
    } finally {
      setAuthenticating(false);
    }
  };

  // Exit Admin / Switch back to Cashier
  const handleExitAdmin = async () => {
    try {
      await switchToCashier();
      addToast('Switched to Cashier billing mode', 'info');
      navigate('/billing');
    } catch (err) {
      console.error(err);
      navigate('/billing');
    }
  };

  // Live query for Overview analytics
  const allBills = useLiveQuery(() => db.bills.toArray(), []);
  const daySessions = useLiveQuery(() => db.day_sessions.toArray(), []);
  const allUsers = useLiveQuery(() => db.users.toArray(), []);

  // Compute today's summary metrics
  const metrics = useMemo(() => {
    if (!allBills) {
      return { totalSales: 0, billsCount: 0, itemsCount: 0, discounts: 0, voidsCount: 0, voidAmount: 0 };
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayBills = allBills.filter(b => (b.created_at || '').startsWith(todayStr));

    const completed = todayBills.filter(b => b.status === 'completed');
    const voided = todayBills.filter(b => b.status === 'voided');

    const totalSales = completed.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0);
    const itemsCount = completed.reduce((sum, b) => sum + (Number(b.total_items_count) || (b.items?.length || 0)), 0);
    const discounts = completed.reduce((sum, b) => sum + (Number(b.discount_amount) || 0), 0);
    const voidAmount = voided.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0);

    return {
      totalSales,
      billsCount: completed.length,
      itemsCount,
      discounts,
      voidsCount: voided.length,
      voidAmount,
      recentBills: todayBills.slice(-8).reverse(),
    };
  }, [allBills]);

  // Current session status
  const currentSession = useMemo(() => {
    if (!daySessions || daySessions.length === 0) return null;
    return daySessions[daySessions.length - 1];
  }, [daySessions]);

  // --- 1. PIN CHALLENGE SCREEN (If not Owner) ---
  if (!isOwner) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-cream p-4">
        <div className="w-full max-w-sm bg-cream-card rounded-card border border-brown/15 shadow-medium p-6 animate-fade-in text-center">
          {/* Admin Shield Icon */}
          <div className="w-16 h-16 bg-espresso/90 text-amber-300 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-soft">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
          </div>

          <h2 className="font-serif font-bold text-espresso text-2xl mb-1">
            Admin Portal
          </h2>
          <p className="text-brown/60 font-sans text-xs mb-4">
            Enter Owner PIN (4 digits) to switch to the admin management portal
          </p>

          {/* Error notice */}
          {pinError && (
            <div className="bg-crimson/10 text-crimson text-xs font-medium px-3 py-2 rounded-btn mb-3 animate-fade-in">
              {pinError}
            </div>
          )}

          {/* NumPad for PIN */}
          <NumPad
            value={enteredPin}
            onChange={(val) => {
              setEnteredPin(val);
              if (pinError) setPinError('');
            }}
            onSubmit={handlePinSubmit}
            maxLength={4}
            masked
            submitLabel={authenticating ? 'Verifying...' : 'Unlock Admin'}
            autoSubmitLength={4}
          />

          {/* Quick Demo Assist */}
          <div className="mt-4 pt-3 border-t border-brown/10 flex items-center justify-between text-xs font-sans">
            <span className="text-brown/50">Demo Owner PIN: <strong className="font-mono text-teal">0000</strong></span>
            <button
              type="button"
              onClick={() => {
                setEnteredPin('0000');
                handlePinSubmit('0000');
              }}
              className="text-teal hover:underline font-medium"
            >
              Use 0000 →
            </button>
          </div>

          {/* Back to Billing */}
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="w-full mt-3 py-2 text-xs font-sans text-brown/70 hover:text-espresso border border-brown/15 rounded-btn hover:bg-brown/5 transition-colors"
          >
            ← Back to Cashier Billing
          </button>
        </div>
      </div>
    );
  }

  // --- 2. ADMIN PORTAL (Authenticated Owner) ---
  return (
    <div className="h-full w-full flex flex-col bg-cream overflow-hidden">
      {/* Top Admin Header */}
      <header className="bg-espresso text-cream px-6 py-3.5 flex items-center justify-between border-b border-brown/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal/20 border border-teal/40 flex items-center justify-center text-amber-300">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-white text-lg tracking-tight">
                Bake & Brew · Admin Portal
              </h1>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono px-2 py-0.5 rounded-pill font-semibold uppercase tracking-wider">
                👑 Owner Role
              </span>
            </div>
            <p className="text-white/50 text-[11px] font-sans">
              Master administration, products, categories, daily sales & stock controls
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Cashier billing navigation */}
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-btn bg-teal hover:bg-teal-dark text-white text-xs font-medium transition-colors shadow-soft"
            id="btn-admin-to-billing"
            title="Open Cashier Billing"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2"/>
              <line x1="8" y1="9" x2="16" y2="9"/>
              <line x1="8" y1="13" x2="14" y2="13"/>
            </svg>
            <span>Cashier Billing (/billing)</span>
          </button>

          {/* Switch/Lock back to Cashier */}
          <button
            type="button"
            onClick={handleExitAdmin}
            className="flex items-center gap-1.5 px-3 py-2 rounded-btn bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-medium transition-colors border border-white/10"
            id="btn-exit-admin"
            title="Lock Admin and switch to Cashier"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Lock / Exit Admin</span>
          </button>
        </div>
      </header>

      {/* Admin Navigation Tabs */}
      <div className="bg-cream-card border-b border-brown/15 px-6 pt-2 flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: '📊 Overview & Analytics' },
          { id: 'products', label: '📦 Products (CRUD)' },
          { id: 'categories', label: '🏷️ Categories (CRUD)' },
          { id: 'stock', label: '📋 Stock Count' },
          { id: 'reports', label: '📊 Sales Reports & Day Close' },
          { id: 'staff', label: '👥 Staff & PINs' },
        ].map((tab) => {
          const isActive = activeTab === tab.id || (tab.id === 'reports' && activeTab === 'day_close');
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSearchParams({ tab: tab.id })}
              id={`tab-admin-${tab.id}`}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-sans font-medium transition-all border-b-2 flex items-center gap-2 ${
                isActive
                  ? 'border-teal text-teal font-semibold bg-cream/70 shadow-xs'
                  : 'border-transparent text-brown/60 hover:text-espresso hover:bg-brown/5'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content Body */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'overview' && (
          <div className="h-full overflow-y-auto p-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Today's Sales</span>
                <span className="font-serif font-bold text-espresso text-2xl leading-none">{formatINR(metrics.totalSales)}</span>
                <span className="text-[10px] text-teal font-sans mt-1.5 block">Net completed revenue</span>
              </div>

              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Bills Issued</span>
                <span className="font-serif font-bold text-espresso text-2xl leading-none">{metrics.billsCount}</span>
                <span className="text-[10px] text-brown/50 font-sans mt-1.5 block">Customers served</span>
              </div>

              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Items Sold</span>
                <span className="font-serif font-bold text-espresso text-2xl leading-none">{metrics.itemsCount}</span>
                <span className="text-[10px] text-brown/50 font-sans mt-1.5 block">Units & portions</span>
              </div>

              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Discounts</span>
                <span className="font-serif font-bold text-amber-700 text-2xl leading-none">{formatINR(metrics.discounts)}</span>
                <span className="text-[10px] text-amber-700/70 font-sans mt-1.5 block">Total concessions</span>
              </div>

              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Voided Bills</span>
                <span className="font-serif font-bold text-crimson text-2xl leading-none">{metrics.voidsCount}</span>
                <span className="text-[10px] text-crimson/70 font-sans mt-1.5 block">Val: {formatINR(metrics.voidAmount)}</span>
              </div>

              <div className="bg-cream-card rounded-card border border-brown/15 p-4 shadow-soft">
                <span className="text-[11px] font-sans text-brown/60 uppercase tracking-wider block mb-1">Session Status</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold ${
                  currentSession?.status === 'closed'
                    ? 'bg-crimson/15 text-crimson'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${currentSession?.status === 'closed' ? 'bg-crimson' : 'bg-emerald-500 animate-pulse'}`} />
                  {currentSession?.status === 'closed' ? 'DAY CLOSED' : 'DAY OPEN'}
                </span>
                <span className="text-[10px] text-brown/50 font-sans mt-1 block">
                  {currentSession?.opened_at ? new Date(currentSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ready'}
                </span>
              </div>
            </div>

            {/* Quick Navigation Panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => setSearchParams({ tab: 'products' })}
                className="bg-cream-card rounded-card border border-brown/15 p-5 shadow-soft hover:shadow-medium hover:border-teal/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif font-bold text-espresso text-base group-hover:text-teal transition-colors">
                    Manage Products & Prices
                  </h3>
                  <span className="text-teal font-mono text-xs">→</span>
                </div>
                <p className="text-xs font-sans text-brown/70 leading-relaxed">
                  Add new bakery items, set tax rates, update prices, configure weight items, or toggle stock tracking.
                </p>
              </div>

              <div
                onClick={() => setSearchParams({ tab: 'categories' })}
                className="bg-cream-card rounded-card border border-brown/15 p-5 shadow-soft hover:shadow-medium hover:border-teal/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif font-bold text-espresso text-base group-hover:text-teal transition-colors">
                    Categories & Menus
                  </h3>
                  <span className="text-teal font-mono text-xs">→</span>
                </div>
                <p className="text-xs font-sans text-brown/70 leading-relaxed">
                  Organize store display sections (Tea & Coffee, Bakery, Puffs, Cold Beverages), set order priorities.
                </p>
              </div>

              <div
                onClick={() => setSearchParams({ tab: 'day_close' })}
                className="bg-cream-card rounded-card border border-brown/15 p-5 shadow-soft hover:shadow-medium hover:border-teal/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif font-bold text-espresso text-base group-hover:text-teal transition-colors">
                    Day Close & Z-Report
                  </h3>
                  <span className="text-teal font-mono text-xs">→</span>
                </div>
                <p className="text-xs font-sans text-brown/70 leading-relaxed">
                  Review shift sales breakdown, perform evening reconciliation, print Z-Report, or reopen session.
                </p>
              </div>
            </div>

            {/* Recent Billing Ledger */}
            <div className="bg-cream-card rounded-card border border-brown/15 p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif font-bold text-espresso text-base">
                  Today's Billing Transactions
                </h3>
                <span className="text-xs font-sans text-brown/50">
                  Real-time transaction feed from cashier desks
                </span>
              </div>

              {metrics.recentBills && metrics.recentBills.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-brown/10 text-brown/60 uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Bill Number</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Items</th>
                        <th className="py-2.5 px-3 text-right">Discount</th>
                        <th className="py-2.5 px-3 text-right font-bold">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brown/5">
                      {metrics.recentBills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-cream/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-semibold text-espresso">{bill.bill_number}</td>
                          <td className="py-2.5 px-3 text-brown/70">
                            {bill.created_at ? new Date(bill.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              bill.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : bill.status === 'voided'
                                ? 'bg-crimson/10 text-crimson font-bold'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {bill.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-brown/70">{bill.total_items_count || bill.items?.length || 1}</td>
                          <td className="py-2.5 px-3 text-right text-amber-700">{formatINR(bill.discount_amount || 0)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-espresso">{formatINR(bill.grand_total || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-brown/40 text-xs">
                  No bills generated yet today.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Products Management (CRUD) */}
        {activeTab === 'products' && (
          <div className="h-full">
            <ProductsPage />
          </div>
        )}

        {/* Tab 3: Categories Management (CRUD) */}
        {activeTab === 'categories' && (
          <div className="h-full">
            <CategoriesPage />
          </div>
        )}

        {/* Tab 4: Stock Count */}
        {activeTab === 'stock' && (
          <div className="h-full">
            <StockCountPage />
          </div>
        )}

        {/* Tab 5: Sales Reports & Day Close */}
        {(activeTab === 'day_close' || activeTab === 'reports') && (
          <div className="h-full">
            <DayClosePage />
          </div>
        )}

        {/* Tab 6: Staff & Access */}
        {activeTab === 'staff' && (
          <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
            <div className="bg-cream-card rounded-card border border-brown/15 p-6 shadow-soft">
              <h3 className="font-serif font-bold text-espresso text-xl mb-1">
                Staff & Role Credentials
              </h3>
              <p className="text-xs font-sans text-brown/60 mb-5">
                Role-based access separation between front-desk cashier billing and owner administrative control.
              </p>

              <div className="space-y-3">
                {allUsers?.map((u) => {
                  const isOwnerUser = u.role === 'owner';
                  return (
                    <div
                      key={u.id}
                      className={`p-4 rounded-xl border flex items-center justify-between ${
                        isOwnerUser
                          ? 'bg-amber-500/5 border-amber-500/20'
                          : 'bg-cream/40 border-brown/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          isOwnerUser ? 'bg-amber-100 text-amber-800' : 'bg-teal/10 text-teal'
                        }`}>
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-espresso text-sm flex items-center gap-2">
                            {u.name}
                            {isOwnerUser && (
                              <span className="text-[10px] font-mono bg-amber-400/20 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                                OWNER / ADMIN
                              </span>
                            )}
                          </h4>
                          <span className="text-xs text-brown/60 font-sans capitalize">
                            Role: {u.role} · Status: {u.active ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-sans text-brown/50 block">Login PIN</span>
                        <span className="font-mono font-bold text-teal text-sm tracking-wider">
                          {isOwnerUser ? '0000 (Owner PIN)' : u.name === 'Raju' ? '1234' : '5678'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-brown/10 text-xs font-sans text-brown/70 leading-relaxed space-y-1">
                <p>• <strong>Cashier billing screen:</strong> Cashiers log in with their PIN and operate keyboard-driven billing without administrative distraction.</p>
                <p>• <strong>Admin Portal access:</strong> Accessed anytime via URL <code>/billing/admin</code> or <code>/admin</code> protected by the Owner PIN.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  );
}
