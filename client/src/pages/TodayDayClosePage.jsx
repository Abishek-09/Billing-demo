import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/dexie.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import useAuthStore from '../store/authStore.js';
import useToastStore from '../store/toastStore.js';
import OwnerPinPrompt from '../components/OwnerPinPrompt.jsx';
import { getTodayStr, formatDateTime } from '../utils/billNumber.js';
import { formatINR, round2 } from '../utils/tax.js';
import { printReportWindow, getReport } from '../utils/reports.js';
import { Printer } from 'lucide-react';

/**
 * Today Day Close & Z-Report Component for User Dashboard Sidebar (/day-close)
 * Shows strictly ONLY today's open/close business day report.
 */
export default function TodayDayClosePage() {
  const { t } = useI18n();
  const { user, verifyOwnerPin } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const today = getTodayStr();

  const [showConfirm, setShowConfirm] = useState(false);
  const [showReopenPin, setShowReopenPin] = useState(false);

  // Active day session for today
  const session = useLiveQuery(() =>
    db.day_sessions.where('date').equals(today).first(), [today]);

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const outletConfig = useLiveQuery(async () => {
    const list = await db.outlet_config.toArray();
    return list.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }, []);

  // Today's Z-report metrics
  const zReport = useLiveQuery(async () => {
    if (!session) return null;

    const bills = await db.bills.where('day_session_id').equals(session.id).toArray();
    const closedBills = bills.filter(b => b.status === 'closed' || b.status === 'completed');
    const voidedBills = bills.filter(b => b.status === 'voided');

    const allBillItems = [];
    for (const bill of closedBills) {
      const bi = await db.bill_items.where('bill_id').equals(bill.id).toArray();
      allBillItems.push(...bi);
    }

    // Totals
    const totalSales = closedBills.reduce((s, b) => s + (Number(b.grand_total) || 0), 0);
    const totalDiscounts = closedBills.reduce((s, b) => s + (Number(b.discount_amount) || 0), 0);
    const totalCgst = closedBills.reduce((s, b) => s + (Number(b.cgst_total) || 0), 0);
    const totalSgst = closedBills.reduce((s, b) => s + (Number(b.sgst_total) || 0), 0);

    const totalItems = allBillItems.reduce((s, bi) => {
      return s + (bi.weight_kg ? 1 : (Number(bi.quantity) || 1));
    }, 0);

    // Category breakdown
    const catBreakdown = {};
    for (const bi of allBillItems) {
      const catId = bi.category_id || 'uncategorized';
      if (!catBreakdown[catId]) catBreakdown[catId] = { count: 0, total: 0 };
      catBreakdown[catId].count += bi.weight_kg ? 1 : (Number(bi.quantity) || 1);
      catBreakdown[catId].total += Number(bi.line_total) || 0;
    }

    return {
      totalSales: round2(totalSales),
      totalBills: closedBills.length,
      totalItems: round2(totalItems),
      totalDiscounts: round2(totalDiscounts),
      totalVoids: voidedBills.length,
      totalCgst: round2(totalCgst),
      totalSgst: round2(totalSgst),
      catBreakdown,
    };
  }, [session]);

  const getCategoryName = (catId) => {
    const cat = categories?.find(c => c.id === catId);
    if (!cat) return catId === 'uncategorized' ? 'Uncategorized' : catId;
    return cat.name;
  };

  const handleCloseDay = async () => {
    if (!session) return;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.day_sessions, db.audit_log], async () => {
      await db.day_sessions.update(session.id, {
        status: 'closed',
        closed_by: user.id,
        closed_at: now,
        z_report_json: JSON.stringify(zReport),
      });

      await db.audit_log.add({
        id: uuidv4(),
        user_id: user.id,
        action: 'day_closed',
        entity_type: 'day_session',
        entity_id: session.id,
        before_json: JSON.stringify({ status: 'open' }),
        after_json: JSON.stringify({ status: 'closed' }),
        created_at: now,
      });
    });

    setShowConfirm(false);
    addToast('Day closed successfully', 'success');
  };

  const handleReopen = async (ownerPin) => {
    const owner = await verifyOwnerPin(ownerPin);
    if (!owner) return false;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.day_sessions, db.audit_log], async () => {
      await db.day_sessions.update(session.id, {
        status: 'open',
        closed_by: null,
        closed_at: null,
      });

      await db.audit_log.add({
        id: uuidv4(),
        user_id: owner.id,
        action: 'day_reopened',
        entity_type: 'day_session',
        entity_id: session.id,
        before_json: JSON.stringify({ status: 'closed' }),
        after_json: JSON.stringify({ status: 'open' }),
        created_at: now,
      });
    });

    setShowReopenPin(false);
    addToast('Day reopened', 'info');
    return true;
  };

  const handlePrintZReport = async () => {
    try {
      const todayStart = new Date(`${today}T00:00:00.000`).toISOString();
      const todayEnd = new Date(`${today}T23:59:59.999`).toISOString();
      const report = await getReport(todayStart, todayEnd, { period: 'today', label: today });
      if (report) {
        printReportWindow(report, outletConfig || {});
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to print Z-Report', 'warning');
    }
  };

  const isOpen = session?.status === 'open';
  const isClosed = session?.status === 'closed';

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-espresso text-2xl">Day Close</h1>
          <p className="text-brown/50 font-sans text-sm mt-1">Close the current business day</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status badge */}
          {session && (
            <span className={`px-4 py-2 rounded-btn text-sm font-sans font-semibold ${
              isOpen ? 'bg-teal/10 text-teal' : 'bg-crimson/10 text-crimson'
            }`}>
              {isOpen ? 'Day is OPEN' : 'Day is CLOSED'}
            </span>
          )}

          {/* Print button */}
          <button
            type="button"
            onClick={handlePrintZReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-btn border border-brown/20 text-espresso hover:bg-black/5 text-xs font-medium transition-colors"
            title="Print 80mm Z-Report"
          >
            <Printer size={14} className="text-teal" />
            <span>Print Z-Report</span>
          </button>

          {/* Action button */}
          {isOpen && !showConfirm && (
            <button className="btn-crimson px-6" onClick={() => setShowConfirm(true)} id="btn-close-day">
              Close Day
            </button>
          )}
          {isClosed && !showReopenPin && (
            <button className="btn-ghost px-6" onClick={() => setShowReopenPin(true)} id="btn-reopen-day">
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Confirm close dialog */}
      {showConfirm && (
        <div className="mb-6 card p-5 shadow-medium max-w-md animate-fade-in">
          <p className="font-sans text-sm text-espresso mb-4">
            Are you sure you want to close the current business day? A final Z-report will be generated.
          </p>
          <div className="flex gap-2">
            <button className="btn-crimson flex-1" onClick={handleCloseDay}>Confirm</button>
            <button className="btn-ghost flex-1" onClick={() => setShowConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Reopen PIN dialog */}
      {showReopenPin && (
        <div className="mb-6 max-w-xs animate-fade-in">
          <OwnerPinPrompt
            title="Enter Owner PIN to Reopen Day"
            onVerified={handleReopen}
            onCancel={() => setShowReopenPin(false)}
          />
        </div>
      )}

      {/* Z-Report content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!session ? (
          <div className="card p-12 text-center text-brown/30 font-sans text-sm">
            No session today yet. Start billing to create a day session.
          </div>
        ) : !zReport ? (
          <div className="text-brown/40 font-sans animate-pulse-gentle text-center py-12">Loading...</div>
        ) : (
          <div className="space-y-4">
            {/* Session info */}
            <div className="card p-4 shadow-soft">
              <h3 className="font-sans font-semibold text-espresso text-sm mb-2">Session Info</h3>
              <div className="grid grid-cols-2 gap-2 text-sm font-sans">
                <div>
                  <span className="text-brown/50">Opened At:</span>
                  <span className="ml-2 text-espresso">{formatDateTime(session.opened_at)}</span>
                </div>
                {session.closed_at && (
                  <div>
                    <span className="text-brown/50">Closed At:</span>
                    <span className="ml-2 text-espresso">{formatDateTime(session.closed_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary cards (5 cards) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="card p-4 shadow-soft">
                <p className="text-brown/50 text-xs font-sans mb-1">Total Sales</p>
                <p className="font-sans font-bold text-xl text-crimson">
                  {formatINR(zReport.totalSales)}
                </p>
              </div>

              <div className="card p-4 shadow-soft">
                <p className="text-brown/50 text-xs font-sans mb-1">Total Bills</p>
                <p className="font-sans font-bold text-xl text-espresso">
                  {zReport.totalBills}
                </p>
              </div>

              <div className="card p-4 shadow-soft">
                <p className="text-brown/50 text-xs font-sans mb-1">Items Sold</p>
                <p className="font-sans font-bold text-xl text-espresso">
                  {zReport.totalItems}
                </p>
              </div>

              <div className="card p-4 shadow-soft">
                <p className="text-brown/50 text-xs font-sans mb-1">Discounts Given</p>
                <p className="font-sans font-bold text-xl text-espresso">
                  {formatINR(zReport.totalDiscounts)}
                </p>
              </div>

              <div className="card p-4 shadow-soft">
                <p className="text-brown/50 text-xs font-sans mb-1">Voided Bills</p>
                <p className={`font-sans font-bold text-xl ${zReport.totalVoids > 0 ? 'text-crimson' : 'text-espresso'}`}>
                  {zReport.totalVoids}
                </p>
              </div>
            </div>

            {/* Tax breakdown */}
            <div className="card p-4 shadow-soft">
              <h3 className="font-sans font-semibold text-espresso text-sm mb-2">Tax Collected</h3>
              <div className="flex flex-wrap gap-6 text-sm font-sans">
                <div>
                  <span className="text-brown/50">CGST:</span>
                  <span className="ml-2 font-semibold text-espresso">{formatINR(zReport.totalCgst)}</span>
                </div>
                <div>
                  <span className="text-brown/50">SGST:</span>
                  <span className="ml-2 font-semibold text-espresso">{formatINR(zReport.totalSgst)}</span>
                </div>
                <div>
                  <span className="text-brown/50">Total Tax:</span>
                  <span className="ml-2 font-semibold text-espresso">
                    {formatINR(round2(zReport.totalCgst + zReport.totalSgst))}
                  </span>
                </div>
              </div>
            </div>

            {/* Category breakdown */}
            {Object.keys(zReport.catBreakdown).length > 0 && (
              <div className="card p-4 shadow-soft">
                <h3 className="font-sans font-semibold text-espresso text-sm mb-3">Category Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(zReport.catBreakdown).map(([catId, data]) => (
                    <div key={catId} className="flex items-center justify-between text-sm font-sans py-1 border-b border-brown/5 last:border-0">
                      <span className="text-espresso font-medium">{getCategoryName(catId)}</span>
                      <div className="flex items-center gap-6">
                        <span className="text-brown/50 text-xs">{data.count} items</span>
                        <span className="font-semibold text-espresso">{formatINR(round2(data.total))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
