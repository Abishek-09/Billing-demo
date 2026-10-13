import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/dexie.js';
import useAuthStore from '../store/authStore.js';
import useToastStore from '../store/toastStore.js';
import OwnerPinPrompt from '../components/OwnerPinPrompt.jsx';
import SalesBarChart from '../components/SalesBarChart.jsx';
import BillDetailModal from '../components/BillDetailModal.jsx';
import {
  getPeriodBounds,
  shiftPeriod,
  getReport,
  formatDateIST,
  formatShortDateIST,
  toDateStr,
  exportReportToCSV,
  printReportWindow,
} from '../utils/reports.js';
import { formatINR, round2 } from '../utils/tax.js';
import { formatDateTime, getTodayStr } from '../utils/billNumber.js';

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShoppingBag,
  Scale,
  CreditCard,
  User,
  Layers,
  ArrowRight,
  FileSpreadsheet,
  Archive,
  BarChart2,
  List,
  History,
  XCircle,
} from 'lucide-react';

/**
 * Period-Based Sales Reports & Day Close / Z-Report Portal
 *
 * Implements:
 * 1. Period Selector (Today, Yesterday, Week, Month, Year, Custom Range) + Prev/Next shifting
 * 2. Monday-start week and Financial Year (Apr-Mar GST) vs Calendar Year (Jan-Dec)
 * 3. URL synchronization (?tab=reports&period=week&date=YYYY-MM-DD)
 * 4. Summary KPI Cards with previous period % comparison & Reconciliation formula
 * 5. Interactive SVG Sales Bar Chart (hourly, daily, monthly) with zero gaps and tooltips
 * 6. Breakdown Tables: Categories (% share), Top 10 items (kg vs pcs), Weight vs Piece, Payment modes, Cashier performance
 * 7. Drill-Down: Day click -> Today view, Bills ledger with inspect and reprint
 * 8. Day Close: "Close Day" button shown ONLY when viewing current open day; Z-report history for closed days
 * 9. Export CSV & Print (80mm thermal for single day Z-report, A4 for period)
 * 10. Keyboard shortcuts (D, W, M, Y, [, ], Ctrl+E, Ctrl+P)
 * 11. Role guard: Owner / Manager only
 * 12. Single unified pass calculation engine (getReport)
 */
export default function DayClosePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, verifyOwnerPin } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  // Active sub-tab inside Reports for deep tables
  const [activeReportSubTab, setActiveReportSubTab] = useState('breakdowns'); // 'breakdowns' | 'period' | 'bills' | 'z_history'

  // Modal states
  const [selectedBill, setSelectedBill] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showReopenPin, setShowReopenPin] = useState(false);

  // Read URL query parameters
  const currentTab = searchParams.get('tab') || 'reports';
  const periodParam = (searchParams.get('period') || 'today').toLowerCase();
  const dateParam = searchParams.get('date') || toDateStr(new Date());
  const yearTypeParam = (searchParams.get('yearType') || 'calendar').toLowerCase();
  const customFromParam = searchParams.get('from') || toDateStr(new Date());
  const customToParam = searchParams.get('to') || toDateStr(new Date());

  // Safe validated period
  const activePeriod = ['today', 'yesterday', 'week', 'month', 'year', 'custom'].includes(periodParam)
    ? periodParam
    : 'today';
  const activeYearType = yearTypeParam === 'financial' ? 'financial' : 'calendar';

  // Calculate boundary ISO timestamps and labels
  const periodBounds = useMemo(() => {
    return getPeriodBounds(activePeriod, dateParam, activeYearType, customFromParam, customToParam);
  }, [activePeriod, dateParam, activeYearType, customFromParam, customToParam]);

  // Update URL search parameters helper
  const updateUrlParams = useCallback((newParams) => {
    const updated = new URLSearchParams(searchParams);
    // Keep tab parameter
    if (!updated.get('tab')) updated.set('tab', currentTab);

    Object.entries(newParams).forEach(([k, v]) => {
      if (v === null || v === undefined) {
        updated.delete(k);
      } else {
        updated.set(k, String(v));
      }
    });
    setSearchParams(updated, { replace: false });
  }, [searchParams, setSearchParams, currentTab]);

  // Period change handler
  const handleSelectPeriod = (newPeriod) => {
    updateUrlParams({
      period: newPeriod,
      date: dateParam,
      // If switching to year, preserve or set yearType
      yearType: newPeriod === 'year' ? activeYearType : undefined,
    });
  };

  // Shift period backward (-1) or forward (+1)
  const handleShiftPeriod = (direction) => {
    if (activePeriod === 'custom') {
      // Shift custom window by same duration
      const fromD = new Date(customFromParam);
      const toD = new Date(customToParam);
      const diffDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      fromD.setDate(fromD.getDate() + (direction * diffDays));
      toD.setDate(toD.getDate() + (direction * diffDays));
      updateUrlParams({
        from: toDateStr(fromD),
        to: toDateStr(toD),
      });
      return;
    }

    const shiftedDate = shiftPeriod(activePeriod, dateParam, direction, activeYearType);
    updateUrlParams({ date: shiftedDate });
  };

  // Toggle Financial Year vs Calendar Year
  const handleToggleYearType = (type) => {
    updateUrlParams({ yearType: type });
  };

  // Drilldown to specific day or month
  const handleDrillDown = useCallback((chartItem) => {
    if (chartItem.drillType === 'day' && chartItem.drillParam) {
      updateUrlParams({
        period: 'today',
        date: chartItem.drillParam,
      });
      addToast(`Drilled down into ${formatDateIST(chartItem.drillParam)}`, 'info');
    } else if (chartItem.drillType === 'month' && chartItem.drillParam) {
      updateUrlParams({
        period: 'month',
        date: chartItem.drillParam,
      });
      addToast(`Drilled down into month`, 'info');
    }
  }, [updateUrlParams, addToast]);

  // Outlet Config for printing
  const outletConfig = useLiveQuery(async () => {
    const list = await db.outlet_config.toArray();
    return list.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }, []);

  // Live Query: Current Day Session for today
  const todayDateStr = getTodayStr();
  const currentOpenSession = useLiveQuery(() =>
    db.day_sessions.where('date').equals(todayDateStr).first(), [todayDateStr]
  );

  // Live Query: Active report calculation via single pass getReport()
  const report = useLiveQuery(async () => {
    try {
      return await getReport(periodBounds.fromDate, periodBounds.toDate, {
        prevFromDate: periodBounds.prevFromDate,
        prevToDate: periodBounds.prevToDate,
        period: activePeriod,
        yearType: activeYearType,
        label: periodBounds.label,
        prevLabel: periodBounds.prevLabel,
      });
    } catch (err) {
      console.error('Failed to compute report:', err);
      return null;
    }
  }, [periodBounds, activePeriod, activeYearType]);

  // Check if viewing the current open business day session
  const isViewingCurrentOpenDay = useMemo(() => {
    if (activePeriod !== 'today') return false;
    if (dateParam !== todayDateStr) return false;
    return currentOpenSession?.status === 'open';
  }, [activePeriod, dateParam, todayDateStr, currentOpenSession]);

  const isCurrentDayClosed = useMemo(() => {
    if (activePeriod !== 'today') return false;
    if (dateParam !== todayDateStr) return false;
    return currentOpenSession?.status === 'closed';
  }, [activePeriod, dateParam, todayDateStr, currentOpenSession]);

  // Handle Day Close
  const handleCloseDay = async () => {
    if (!currentOpenSession || !report) return;

    const now = new Date().toISOString();
    try {
      await db.transaction('rw', [db.day_sessions, db.audit_log], async () => {
        await db.day_sessions.update(currentOpenSession.id, {
          status: 'closed',
          closed_by: user?.id || 'owner',
          closed_at: now,
          z_report_json: JSON.stringify({
            summary: report.summary,
            categoryBreakdown: report.categoryBreakdown,
            closedAt: now,
          }),
        });

        await db.audit_log.add({
          id: uuidv4(),
          user_id: user?.id || 'owner',
          action: 'day_closed',
          entity_type: 'day_session',
          entity_id: currentOpenSession.id,
          before_json: JSON.stringify({ status: 'open' }),
          after_json: JSON.stringify({ status: 'closed' }),
          created_at: now,
        });
      });

      setShowCloseConfirm(false);
      addToast('Business Day Closed successfully. Z-Report generated.', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to close day', 'warning');
    }
  };

  // Handle Reopen Day
  const handleReopen = async (ownerPin) => {
    const owner = await verifyOwnerPin(ownerPin);
    if (!owner) return false;

    if (!currentOpenSession) return false;
    const now = new Date().toISOString();
    try {
      await db.transaction('rw', [db.day_sessions, db.audit_log], async () => {
        await db.day_sessions.update(currentOpenSession.id, {
          status: 'open',
          closed_by: null,
          closed_at: null,
        });

        await db.audit_log.add({
          id: uuidv4(),
          user_id: owner.id,
          action: 'day_reopened',
          entity_type: 'day_session',
          entity_id: currentOpenSession.id,
          before_json: JSON.stringify({ status: 'closed' }),
          after_json: JSON.stringify({ status: 'open' }),
          created_at: now,
        });
      });

      setShowReopenPin(false);
      addToast('Business Day reopened. Cashiers can continue billing.', 'info');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is inside an input, textarea, or select
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }

      // Check modal open
      if (selectedBill || showCloseConfirm || showReopenPin) return;

      const key = e.key;

      // Ctrl+E: Export CSV
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'e') {
        e.preventDefault();
        if (report) {
          exportReportToCSV(report);
          addToast('Exported CSV sales report', 'success');
        }
        return;
      }

      // Ctrl+P: Print Report
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'p') {
        e.preventDefault();
        if (report) {
          printReportWindow(report, outletConfig || {});
        }
        return;
      }

      // Period switches
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'd' || key === 'D') {
          e.preventDefault();
          handleSelectPeriod('today');
        } else if (key === 'w' || key === 'W') {
          e.preventDefault();
          handleSelectPeriod('week');
        } else if (key === 'm' || key === 'M') {
          e.preventDefault();
          handleSelectPeriod('month');
        } else if (key === 'y' || key === 'Y') {
          e.preventDefault();
          handleSelectPeriod('year');
        } else if (key === '[') {
          e.preventDefault();
          handleShiftPeriod(-1);
        } else if (key === ']') {
          e.preventDefault();
          handleShiftPeriod(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [report, outletConfig, selectedBill, showCloseConfirm, showReopenPin, handleSelectPeriod, handleShiftPeriod, addToast]);

  // Role Guard: Owner and Manager only
  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  if (!isOwnerOrManager) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="card max-w-md p-8 shadow-medium">
          <div className="w-14 h-14 bg-crimson/10 text-crimson rounded-2xl mx-auto flex items-center justify-center mb-4">
            <Lock size={28} />
          </div>
          <h2 className="font-serif font-bold text-espresso text-xl mb-1">Access Restricted</h2>
          <p className="text-brown/60 text-xs font-sans mb-4">
            Sales Reports & Day Close are restricted to <strong>Owner</strong> and <strong>Manager</strong> roles only. Cashier accounts cannot view business analytics.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 font-sans">
            Please log in with the Owner PIN (0000) from the admin entry screen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cream overflow-hidden">
      {/* 1. TOP HEADER & CONTROLS BAR */}
      <div className="bg-cream-card border-b border-brown/15 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif font-bold text-espresso text-xl tracking-tight">
              Period Sales Reports & Z-Report
            </h1>
            {isViewingCurrentOpenDay ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                DAY IS OPEN
              </span>
            ) : isCurrentDayClosed ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-[11px] font-semibold bg-crimson/10 text-crimson border border-crimson/20">
                <span className="w-2 h-2 rounded-full bg-crimson" />
                DAY IS CLOSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-[11px] font-semibold bg-brown/10 text-brown/80 border border-brown/20 font-mono">
                <Archive size={11} />
                READ-ONLY HISTORICAL PERIOD
              </span>
            )}
          </div>
          <p className="text-xs text-brown/60 font-sans mt-0.5">
            Indian Standard Time (IST) · Comprehensive unified sales metrics & multi-period ledger
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Close Day Button (Shown ONLY when viewing current open day) */}
          {isViewingCurrentOpenDay && (
            <button
              type="button"
              onClick={() => setShowCloseConfirm(true)}
              id="btn-close-day"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-crimson hover:bg-rose-700 text-white font-sans text-xs font-bold shadow-soft transition-colors"
            >
              <CheckCircle2 size={15} />
              <span>Close Day & Generate Z-Report</span>
            </button>
          )}

          {/* Reopen Day Button (Shown when viewing today and day is closed) */}
          {isCurrentDayClosed && (
            <button
              type="button"
              onClick={() => setShowReopenPin(true)}
              id="btn-reopen-day"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-brown/20 text-brown hover:bg-black/5 text-xs font-medium transition-colors"
            >
              <RefreshCw size={14} />
              <span>Reopen Day</span>
            </button>
          )}

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => {
              if (report) {
                exportReportToCSV(report);
                addToast('Exported CSV sales report', 'success');
              }
            }}
            disabled={!report}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-brown/20 bg-cream/70 hover:bg-cream text-espresso text-xs font-medium transition-colors shadow-xs"
            title="Export CSV (Ctrl+E)"
          >
            <Download size={14} className="text-teal" />
            <span>Export CSV</span>
            <kbd className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded text-brown/50 font-mono">^E</kbd>
          </button>

          {/* Print / PDF */}
          <button
            type="button"
            onClick={() => {
              if (report) {
                printReportWindow(report, outletConfig || {});
              }
            }}
            disabled={!report}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal hover:bg-teal-dark text-white text-xs font-bold shadow-soft transition-colors"
            title={activePeriod === 'today' || activePeriod === 'yesterday' ? 'Print 80mm Z-Report (Ctrl+P)' : 'Print A4 Report (Ctrl+P)'}
          >
            <Printer size={14} />
            <span>
              {activePeriod === 'today' || activePeriod === 'yesterday' ? 'Print 80mm Z-Report' : 'Print A4 Report'}
            </span>
            <kbd className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">^P</kbd>
          </button>
        </div>
      </div>

      {/* 2. PERIOD SELECTOR BAR */}
      <div className="bg-cream-card/90 border-b border-brown/15 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        {/* Period Buttons */}
        <div className="flex items-center gap-1 bg-cream/80 p-1 rounded-xl border border-brown/15">
          {[
            { id: 'today', label: 'Today', keyHint: 'D' },
            { id: 'yesterday', label: 'Yesterday', keyHint: '' },
            { id: 'week', label: 'This Week', keyHint: 'W' },
            { id: 'month', label: 'This Month', keyHint: 'M' },
            { id: 'year', label: 'This Year', keyHint: 'Y' },
            { id: 'custom', label: 'Custom Range', keyHint: '' },
          ].map((btn) => {
            const isSelected = activePeriod === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => handleSelectPeriod(btn.id)}
                id={`btn-period-${btn.id}`}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-sans transition-all ${
                  isSelected
                    ? 'bg-espresso text-white font-semibold shadow-xs'
                    : 'text-brown/70 hover:text-espresso hover:bg-brown/10 font-medium'
                }`}
              >
                <span>{btn.label}</span>
                {btn.keyHint && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-black/5 text-brown/40'}`}>
                    {btn.keyHint}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Previous / Next Arrow Controls & Label Display */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-cream p-0.5 rounded-xl border border-brown/15 shadow-xs">
            <button
              type="button"
              onClick={() => handleShiftPeriod(-1)}
              className="p-1.5 rounded-lg text-brown/70 hover:text-espresso hover:bg-black/5 transition-colors"
              title="Previous period ([ key)"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="px-3 py-1 flex items-center gap-2">
              <Calendar size={14} className="text-teal" />
              <span className="font-serif font-bold text-espresso text-sm whitespace-nowrap">
                {periodBounds.label}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleShiftPeriod(1)}
              className="p-1.5 rounded-lg text-brown/70 hover:text-espresso hover:bg-black/5 transition-colors"
              title="Next period (] key)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Year View Mode Switch: Calendar vs Financial Year (Apr-Mar GST) */}
          {activePeriod === 'year' && (
            <div className="flex items-center gap-1 bg-cream p-1 rounded-xl border border-brown/15 text-xs font-sans">
              <span className="text-[10px] text-brown/50 font-mono px-1">Mode:</span>
              <button
                type="button"
                onClick={() => handleToggleYearType('calendar')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  activeYearType === 'calendar'
                    ? 'bg-teal text-white font-bold'
                    : 'text-brown/70 hover:text-espresso'
                }`}
              >
                Calendar Year
              </button>
              <button
                type="button"
                onClick={() => handleToggleYearType('financial')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  activeYearType === 'financial'
                    ? 'bg-teal text-white font-bold'
                    : 'text-brown/70 hover:text-espresso'
                }`}
                title="Indian Financial Year (1 Apr to 31 Mar for GST reconciliation)"
              >
                FY (Apr–Mar)
              </button>
            </div>
          )}

          {/* Custom Date Pickers */}
          {activePeriod === 'custom' && (
            <div className="flex items-center gap-2 bg-cream p-1 rounded-xl border border-brown/15 text-xs font-sans">
              <span className="text-brown/60 text-[11px] pl-1 font-medium">From:</span>
              <input
                type="date"
                value={customFromParam}
                onChange={(e) => updateUrlParams({ from: e.target.value })}
                className="bg-white px-2 py-1 rounded border border-brown/20 text-xs font-mono text-espresso"
              />
              <span className="text-brown/60 text-[11px] font-medium">To:</span>
              <input
                type="date"
                value={customToParam}
                onChange={(e) => updateUrlParams({ to: e.target.value })}
                className="bg-white px-2 py-1 rounded border border-brown/20 text-xs font-mono text-espresso"
              />
            </div>
          )}

          {/* Reset to Today Quick Link */}
          {(dateParam !== todayDateStr || activePeriod !== 'today') && (
            <button
              type="button"
              onClick={() => {
                updateUrlParams({ period: 'today', date: todayDateStr });
              }}
              className="text-[11px] font-sans text-teal hover:underline font-medium"
            >
              Reset to Today →
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Day Close */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-cream-card rounded-2xl shadow-lifted border border-brown/15 p-6 max-w-md w-full animate-fade-in text-left">
            <div className="flex items-center gap-3 mb-3 text-crimson">
              <div className="w-10 h-10 rounded-xl bg-crimson/10 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-serif font-bold text-espresso text-lg">Close Business Day?</h3>
                <p className="text-xs text-brown/60 font-sans">Date: {formatDateIST(todayDateStr)}</p>
              </div>
            </div>

            <p className="text-xs text-brown/70 font-sans leading-relaxed mb-4">
              Closing the day marks the current session as closed and produces the official daily <strong>Z-Report</strong>.
              Subsequent sales must be part of a new day session.
            </p>

            {report && (
              <div className="bg-cream p-3.5 rounded-xl border border-brown/10 mb-4 space-y-1.5 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-brown/60">Bills to close:</span>
                  <span className="font-bold text-espresso">{report.summary.totalBills} bills</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brown/60">Net Total Sales:</span>
                  <span className="font-bold text-teal text-sm">{formatINR(report.summary.totalSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brown/60">Tax (CGST+SGST):</span>
                  <span className="font-medium text-espresso">{formatINR(report.summary.taxTotal)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleCloseDay}
                className="flex-1 py-2.5 rounded-xl bg-crimson hover:bg-rose-700 text-white font-bold text-xs shadow-soft transition-colors"
              >
                Confirm & Close Day
              </button>
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-brown/20 text-brown hover:bg-black/5 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Day Modal Prompt */}
      {showReopenPin && (
        <div className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-cream-card rounded-2xl shadow-lifted border border-brown/15 p-6 max-w-sm w-full animate-fade-in">
            <OwnerPinPrompt
              title="Authorize Reopen Day"
              onVerified={handleReopen}
              onCancel={() => setShowReopenPin(false)}
            />
          </div>
        </div>
      )}

      {/* 3. MAIN REPORT BODY */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Loading State */}
        {!report ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-brown/10 rounded-xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-24 bg-brown/10 rounded-2xl" />
              ))}
            </div>
            <div className="h-64 bg-brown/10 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Reconciliation Formula Line */}
            <div className="bg-gradient-to-r from-teal/10 via-cream-card to-amber-500/10 border border-teal/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal text-white flex items-center justify-center shrink-0">
                  <Layers size={16} />
                </div>
                <div>
                  <div className="text-[10px] font-sans uppercase font-bold text-teal tracking-wider">
                    Single-Pass Audit Reconciliation
                  </div>
                  <div className="font-mono font-bold text-espresso text-xs md:text-sm">
                    {report.summary.formulaLine}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-brown/60 font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Reconciled · Voided bills strictly excluded</span>
              </div>
            </div>

            {/* Empty State Banner if no completed sales in period */}
            {!report.hasSales && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-3 text-amber-900">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                  <div>
                    <h4 className="font-serif font-bold text-sm">No sales in this period</h4>
                    <p className="text-xs font-sans text-amber-800/80 mt-0.5">
                      No completed transactions were recorded for <strong>{report.period.label}</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleShiftPeriod(-1)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
                >
                  View Prior Period →
                </button>
              </div>
            )}

            {/* SUMMARY CARDS (7 KPI Metrics) */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {/* 1. Total Sales */}
              <MetricCard
                label="Total Sales (Net)"
                value={formatINR(report.summary.totalSales)}
                diffPct={report.comparison.salesDiffPct}
                prevLabel={report.comparison.prevLabel}
                highlight
              />

              {/* 2. Total Bills */}
              <MetricCard
                label="Total Bills"
                value={report.summary.totalBills}
                diffPct={report.comparison.billsDiffPct}
                prevLabel={report.comparison.prevLabel}
              />

              {/* 3. Items Sold */}
              <MetricCard
                label="Items Sold"
                value={report.summary.itemsSold}
                diffPct={report.comparison.itemsDiffPct}
                prevLabel={report.comparison.prevLabel}
              />

              {/* 4. Average Bill Value */}
              <MetricCard
                label="Avg Bill Value"
                value={formatINR(report.summary.avgBillValue)}
                diffPct={report.comparison.avgBillDiffPct}
                prevLabel={report.comparison.prevLabel}
              />

              {/* 5. Discounts Given */}
              <MetricCard
                label="Discounts Given"
                value={formatINR(report.summary.discountsGiven)}
                diffPct={report.comparison.discountsDiffPct}
                prevLabel={report.comparison.prevLabel}
                colorClass="text-amber-700"
              />

              {/* 6. Voided Bills */}
              <MetricCard
                label="Voided Bills"
                value={`${report.summary.voidedBillsCount} (${formatINR(report.summary.voidedBillsAmount)})`}
                diffPct={report.comparison.voidsDiffPct}
                prevLabel={report.comparison.prevLabel}
                alert={report.summary.voidedBillsCount > 0}
                colorClass="text-crimson"
              />

              {/* 7. Tax Collected */}
              <div className="bg-cream-card rounded-2xl border border-brown/15 p-3.5 shadow-soft flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-sans uppercase font-semibold text-brown/50 tracking-wider block mb-1">
                    Tax (CGST + SGST)
                  </span>
                  <div className="font-serif font-bold text-espresso text-lg leading-tight">
                    {formatINR(report.summary.taxTotal)}
                  </div>
                  <div className="text-[10px] text-brown/60 font-mono mt-0.5">
                    CGST: {formatINR(report.summary.cgstTotal)} · SGST: {formatINR(report.summary.sgstTotal)}
                  </div>
                </div>
                <div className="mt-2 pt-1 border-t border-brown/10">
                  <DiffBadge diffPct={report.comparison.taxDiffPct} prevLabel={report.comparison.prevLabel} />
                </div>
              </div>
            </div>

            {/* SALES BAR CHART */}
            <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-brown/10">
                <div>
                  <h3 className="font-serif font-bold text-espresso text-base flex items-center gap-2">
                    <BarChart2 size={18} className="text-teal" />
                    <span>
                      {activePeriod === 'today' || activePeriod === 'yesterday'
                        ? 'Hourly Sales Breakdown'
                        : activePeriod === 'week'
                        ? '7-Day Sales Trend (Mon – Sun)'
                        : activePeriod === 'month'
                        ? 'Daily Sales Distribution'
                        : '12-Month Sales Trend'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-brown/50 font-sans mt-0.5">
                    {activePeriod === 'week' || activePeriod === 'month' || activePeriod === 'year'
                      ? 'Click on any bar to drill down into that specific period'
                      : 'Interactive hourly breakdown with sales and customer count'}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-teal inline-block" />
                    <span className="text-brown/70">Sales Revenue</span>
                  </div>
                  <div className="text-brown/40 font-mono text-[11px]">
                    Period: {report.period.label}
                  </div>
                </div>
              </div>

              {/* Chart SVG */}
              <SalesBarChart
                data={report.chartData}
                onDrillDown={handleDrillDown}
                periodType={activePeriod}
              />
            </div>

            {/* SUB-TABS NAVIGATION FOR TABLES */}
            <div className="flex items-center gap-1 border-b border-brown/15 pt-2">
              {[
                { id: 'breakdowns', label: '📊 Performance Breakdowns', count: null },
                {
                  id: 'period',
                  label: activePeriod === 'year' ? '📅 Monthly Ledger' : '📅 Day-wise Ledger',
                  count: report.periodBreakdown?.length || 0,
                  hidden: activePeriod === 'today' || activePeriod === 'yesterday',
                },
                { id: 'bills', label: '🧾 Transaction Bills Ledger', count: report.billsList?.length || 0 },
                { id: 'z_history', label: '🌙 Z-Report History', count: report.closedSessions?.length || 0 },
              ].filter(t => !t.hidden).map((tab) => {
                const isActive = activeReportSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveReportSubTab(tab.id)}
                    className={`px-4 py-2.5 rounded-t-xl text-xs font-sans font-medium transition-all border-b-2 flex items-center gap-2 ${
                      isActive
                        ? 'border-teal text-teal font-bold bg-cream-card shadow-xs'
                        : 'border-transparent text-brown/60 hover:text-espresso hover:bg-brown/5'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-teal/15 text-teal font-bold' : 'bg-black/5 text-brown/60'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT 1: BREAKDOWNS (Category, Top 10 items, Weight vs Piece, Payment Modes, Cashiers) */}
            {activeReportSubTab === 'breakdowns' && (
              <div className="space-y-6">
                {/* Row 1: Category Breakdown & Top 10 Items */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Category Breakdown Table */}
                  <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
                    <h4 className="font-serif font-bold text-espresso text-base mb-1">
                      Category Performance Breakdown
                    </h4>
                    <p className="text-[11px] text-brown/50 font-sans mb-4">
                      Items sold, gross sales, and proportional share of revenue
                    </p>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans border-collapse">
                        <thead>
                          <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                            <th className="py-2">Category</th>
                            <th className="py-2 text-right">Items Sold</th>
                            <th className="py-2 text-right">Gross Sales</th>
                            <th className="py-2 text-right">% Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brown/5">
                          {report.categoryBreakdown.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-brown/40 text-xs">
                                No category data for this period
                              </td>
                            </tr>
                          ) : (
                            report.categoryBreakdown.map((cat) => (
                              <tr key={cat.id} className="hover:bg-cream/40">
                                <td className="py-2.5 font-medium text-espresso">
                                  {cat.name}
                                </td>
                                <td className="py-2.5 text-right font-mono text-brown/80">
                                  {cat.itemsCount}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-espresso">
                                  {formatINR(cat.grossSales)}
                                </td>
                                <td className="py-2.5 text-right font-mono text-teal font-bold">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-12 h-1.5 bg-black/5 rounded-full overflow-hidden hidden sm:block">
                                      <div
                                        className="h-full bg-teal rounded-full"
                                        style={{ width: `${Math.min(100, cat.sharePct)}%` }}
                                      />
                                    </div>
                                    <span>{cat.sharePct}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top 10 Selling Items Table */}
                  <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
                    <h4 className="font-serif font-bold text-espresso text-base mb-1">
                      Top 10 Bestselling Products
                    </h4>
                    <p className="text-[11px] text-brown/50 font-sans mb-4">
                      Quantity (kg for weight items / pcs for piece items) and generated revenue
                    </p>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans border-collapse">
                        <thead>
                          <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                            <th className="py-2"># Product</th>
                            <th className="py-2 text-right">Qty / Weight</th>
                            <th className="py-2 text-right">Revenue</th>
                            <th className="py-2 text-right">% Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brown/5">
                          {report.topItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-brown/40 text-xs">
                                No items sold in this period
                              </td>
                            </tr>
                          ) : (
                            report.topItems.map((it, idx) => (
                              <tr key={it.id || idx} className="hover:bg-cream/40">
                                <td className="py-2.5 font-medium text-espresso">
                                  <span className="text-brown/40 font-mono text-[10px] mr-1.5">{idx + 1}.</span>
                                  {it.name}
                                </td>
                                <td className="py-2.5 text-right font-mono text-brown/80">
                                  {it.isWeight ? `${it.weightKg} kg` : `${it.quantity} pcs`}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-espresso">
                                  {formatINR(it.revenue)}
                                </td>
                                <td className="py-2.5 text-right font-mono text-teal font-bold">
                                  {it.sharePct}%
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Row 2: Weight vs Piece, Payment Modes, Staff Performance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Weight vs Piece Breakdown */}
                  <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Scale size={16} className="text-teal" />
                        <h4 className="font-serif font-bold text-espresso text-base">Weight vs Piece Selling</h4>
                      </div>
                      <p className="text-[11px] text-brown/50 font-sans mb-4">
                        Separation between weighed goods (cakes, sweets) & piece items
                      </p>

                      <div className="space-y-3">
                        <div className="p-3 bg-cream rounded-xl border border-brown/10">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-espresso text-xs">Sold by Weight (Cakes, Biscuits)</span>
                            <span className="font-mono text-teal text-xs font-bold">{report.weightVsPiece.weight.sharePct}%</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-brown/70 font-sans">
                            <span>Total Weight: <strong>{report.weightVsPiece.weight.totalKg} kg</strong></span>
                            <span className="font-semibold text-espresso">{formatINR(report.weightVsPiece.weight.revenue)}</span>
                          </div>
                        </div>

                        <div className="p-3 bg-cream rounded-xl border border-brown/10">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-espresso text-xs">Sold by Piece (Chai, Breads, Puffs)</span>
                            <span className="font-mono text-teal text-xs font-bold">{report.weightVsPiece.piece.sharePct}%</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-brown/70 font-sans">
                            <span>Total Count: <strong>{report.weightVsPiece.piece.totalPcs} pcs</strong></span>
                            <span className="font-semibold text-espresso">{formatINR(report.weightVsPiece.piece.revenue)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Mode Split */}
                  <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard size={16} className="text-teal" />
                        <h4 className="font-serif font-bold text-espresso text-base">Payment Mode Split</h4>
                      </div>
                      <p className="text-[11px] text-brown/50 font-sans mb-4">
                        Revenue collection distribution across channels
                      </p>

                      <div className="space-y-2.5">
                        {report.paymentModes.map((pm) => (
                          <div key={pm.id} className="p-2.5 bg-cream rounded-xl border border-brown/10 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-espresso text-xs block">{pm.mode}</span>
                              <span className="text-[10px] text-brown/50 font-sans">{pm.count} transactions</span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-espresso text-xs block">{formatINR(pm.amount)}</span>
                              <span className="text-[10px] text-teal font-mono font-bold">{pm.sharePct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Staff Performance */}
                  <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <User size={16} className="text-teal" />
                        <h4 className="font-serif font-bold text-espresso text-base">Cashier Performance</h4>
                      </div>
                      <p className="text-[11px] text-brown/50 font-sans mb-4">
                        Sales totals and bills handled by counter staff
                      </p>

                      <div className="space-y-2.5">
                        {report.staffSales.length === 0 ? (
                          <div className="text-center py-6 text-brown/40 text-xs">No cashier sales recorded</div>
                        ) : (
                          report.staffSales.map((st) => (
                            <div key={st.cashierId} className="p-2.5 bg-cream rounded-xl border border-brown/10 flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-espresso text-xs block">{st.name}</span>
                                <span className="text-[10px] text-brown/50 font-sans">
                                  {st.billsCount} bills · Avg {formatINR(st.avgBill)}
                                </span>
                              </div>
                              <span className="font-bold text-teal text-xs">
                                {formatINR(st.salesAmount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: PERIOD / DAY-WISE DRILLABLE TABLE */}
            {activeReportSubTab === 'period' && (
              <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-serif font-bold text-espresso text-base">
                      {activePeriod === 'year' ? 'Month-wise Breakdown Ledger' : 'Day-wise Sales Ledger'}
                    </h4>
                    <p className="text-[11px] text-brown/50 font-sans">
                      Click any row to drill down into that specific day or month
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5">Period / Date</th>
                        <th className="py-2.5 text-right">Bills Count</th>
                        <th className="py-2.5 text-right">Total Net Sales</th>
                        <th className="py-2.5 text-right">Tax Collected</th>
                        <th className="py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brown/5">
                      {report.periodBreakdown.map((row) => (
                        <tr
                          key={row.key}
                          onClick={() => handleDrillDown(row)}
                          className="hover:bg-cream/70 cursor-pointer transition-colors group"
                        >
                          <td className="py-3">
                            <span className="font-semibold text-espresso text-sm block">{row.label}</span>
                            <span className="text-[10px] text-brown/50 font-mono">{row.sublabel}</span>
                          </td>
                          <td className="py-3 text-right font-mono text-brown/80">
                            {row.billsCount} bills
                          </td>
                          <td className="py-3 text-right font-bold text-espresso text-sm">
                            {formatINR(row.salesAmount)}
                          </td>
                          <td className="py-3 text-right font-mono text-brown/60">
                            {formatINR(row.taxAmount)}
                          </td>
                          <td className="py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-teal text-xs font-bold group-hover:underline">
                              <span>Drill In</span>
                              <ArrowRight size={13} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: BILLS TRANSACTION LEDGER */}
            {activeReportSubTab === 'bills' && (
              <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-serif font-bold text-espresso text-base">
                      Bills Transaction Ledger ({report.billsList.length})
                    </h4>
                    <p className="text-[11px] text-brown/50 font-sans">
                      Click any bill to inspect line items, discounts, tax, void details, and reprint receipts
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5">Bill No</th>
                        <th className="py-2.5">Time (IST)</th>
                        <th className="py-2.5">Cashier</th>
                        <th className="py-2.5">Items Summary</th>
                        <th className="py-2.5 text-right">Discount</th>
                        <th className="py-2.5 text-right">Total</th>
                        <th className="py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brown/5">
                      {report.billsList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-brown/40 text-xs">
                            No bills issued in this period
                          </td>
                        </tr>
                      ) : (
                        report.billsList.map((b) => {
                          const isVoided = b.status === 'voided';
                          return (
                            <tr
                              key={b.id}
                              onClick={() => setSelectedBill(b)}
                              className="hover:bg-cream/70 cursor-pointer transition-colors"
                            >
                              <td className="py-3 font-mono font-bold text-espresso">
                                {b.bill_number}
                              </td>
                              <td className="py-3 text-brown/60 text-[11px] whitespace-nowrap">
                                {formatDateTime(b.created_at)}
                              </td>
                              <td className="py-3 font-medium text-espresso">
                                {b.cashierName}
                              </td>
                              <td className="py-3 text-brown/70 max-w-xs truncate" title={b.itemsSummary}>
                                {b.itemsSummary || '—'}
                              </td>
                              <td className="py-3 text-right font-mono text-amber-700">
                                {b.discount_amount > 0 ? `−${formatINR(b.discount_amount)}` : '—'}
                              </td>
                              <td className="py-3 text-right font-bold text-espresso text-sm whitespace-nowrap">
                                {formatINR(b.grand_total)}
                              </td>
                              <td className="py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  isVoided ? 'bg-crimson/10 text-crimson' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {isVoided ? 'Voided' : 'Paid'}
                                </span>
                                {isVoided && b.void_reason && (
                                  <span className="block text-[9px] text-crimson/80 truncate max-w-[120px] mx-auto mt-0.5" title={b.void_reason}>
                                    {b.void_reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 4: Z-REPORT HISTORY */}
            {activeReportSubTab === 'z_history' && (
              <div className="bg-cream-card rounded-2xl border border-brown/15 p-5 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-serif font-bold text-espresso text-base flex items-center gap-2">
                      <History size={18} className="text-teal" />
                      <span>Closed Days & Z-Report History</span>
                    </h4>
                    <p className="text-[11px] text-brown/50 font-sans">
                      All archived business days with verified closed sessions. Click to inspect full report in read-only mode.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5">Date</th>
                        <th className="py-2.5">Opened At</th>
                        <th className="py-2.5">Closed At</th>
                        <th className="py-2.5 text-center">Status</th>
                        <th className="py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brown/5">
                      {report.closedSessions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-brown/40 text-xs">
                            No closed day sessions recorded yet
                          </td>
                        </tr>
                      ) : (
                        report.closedSessions.map((session) => (
                          <tr key={session.id} className="hover:bg-cream/40">
                            <td className="py-3 font-serif font-bold text-espresso text-sm">
                              {formatDateIST(session.date)}
                            </td>
                            <td className="py-3 text-brown/60 text-[11px] font-mono">
                              {session.opened_at ? formatDateTime(session.opened_at) : '—'}
                            </td>
                            <td className="py-3 text-brown/60 text-[11px] font-mono">
                              {session.closed_at ? formatDateTime(session.closed_at) : '—'}
                            </td>
                            <td className="py-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-crimson/10 text-crimson">
                                CLOSED
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  updateUrlParams({
                                    period: 'today',
                                    date: session.date,
                                  });
                                  addToast(`Opened Z-Report for ${formatDateIST(session.date)}`, 'info');
                                }}
                                className="px-3 py-1 rounded-lg bg-teal/10 hover:bg-teal hover:text-white text-teal font-sans text-xs font-bold transition-colors"
                              >
                                View Z-Report →
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bill Inspection & Reprint Modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  );
}

/**
 * Metric Card Component
 */
function MetricCard({ label, value, diffPct, prevLabel, highlight, alert, colorClass }) {
  return (
    <div
      className={`bg-cream-card rounded-2xl border p-3.5 shadow-soft flex flex-col justify-between transition-all ${
        highlight
          ? 'border-teal/40 bg-gradient-to-b from-teal/5 to-cream-card ring-1 ring-teal/20'
          : alert
          ? 'border-crimson/30 bg-crimson/5'
          : 'border-brown/15'
      }`}
    >
      <div>
        <span className="text-[10px] font-sans uppercase font-semibold text-brown/50 tracking-wider block mb-1">
          {label}
        </span>
        <div
          className={`font-serif font-bold text-lg leading-tight ${
            colorClass || (highlight ? 'text-teal' : alert ? 'text-crimson' : 'text-espresso')
          }`}
        >
          {value}
        </div>
      </div>
      <div className="mt-2 pt-1 border-t border-brown/10">
        <DiffBadge diffPct={diffPct} prevLabel={prevLabel} />
      </div>
    </div>
  );
}

/**
 * Visual Pill for Difference vs Previous Period
 */
function DiffBadge({ diffPct, prevLabel }) {
  if (diffPct === undefined || diffPct === null) {
    return <span className="text-[10px] text-brown/40 font-sans">—</span>;
  }

  const isPos = diffPct > 0;
  const isNeg = diffPct < 0;

  return (
    <div className="flex items-center gap-1 text-[10px] font-sans whitespace-nowrap">
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold font-mono ${
          isPos
            ? 'bg-emerald-100 text-emerald-800'
            : isNeg
            ? 'bg-rose-100 text-rose-800'
            : 'bg-black/5 text-brown/60'
        }`}
      >
        {isPos ? <TrendingUp size={10} /> : isNeg ? <TrendingDown size={10} /> : <Minus size={10} />}
        <span>{isPos ? `+${diffPct}%` : `${diffPct}%`}</span>
      </span>
      <span className="text-brown/40 truncate text-[9px]">vs {prevLabel}</span>
    </div>
  );
}
