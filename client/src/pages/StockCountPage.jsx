import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/dexie.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import useToastStore from '../store/toastStore.js';
import { getTodayStr } from '../utils/billNumber.js';
import { round2 } from '../utils/tax.js';

export default function StockCountPage() {
  const { t } = useI18n();
  const addToast = useToastStore((s) => s.addToast);
  const today = getTodayStr();

  const items = useLiveQuery(() =>
    db.items.where('active').equals(1).and(i => i.track_stock === 1).toArray(), []);

  // Get current stock balances from ledger
  const stockBalances = useLiveQuery(async () => {
    if (!items) return {};
    const balances = {};
    for (const item of items) {
      const ledger = await db.stock_ledger
        .where('item_id').equals(item.id)
        .reverse()
        .sortBy('created_at');
      balances[item.id] = ledger.length > 0 ? ledger[0].balance_after : 0;
    }
    return balances;
  }, [items]);

  const [actuals, setActuals] = useState({});
  const [showVarianceOnly, setShowVarianceOnly] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateActual = (itemId, value) => {
    setActuals(prev => ({ ...prev, [itemId]: value }));
    setSaved(false);
  };

  const displayItems = useMemo(() => {
    if (!items || !stockBalances) return [];
    let list = items.map(item => ({
      ...item,
      expected: round2(stockBalances[item.id] || 0),
      actual: actuals[item.id] !== undefined ? parseFloat(actuals[item.id]) || 0 : null,
    }));

    if (showVarianceOnly) {
      list = list.filter(item => {
        if (item.actual === null) return false;
        return Math.abs(item.expected - item.actual) > 0.01;
      });
    }

    return list;
  }, [items, stockBalances, actuals, showVarianceOnly]);

  const handleSave = async () => {
    const session = await db.day_sessions.where('date').equals(today).first();
    if (!session) return;

    const entries = Object.entries(actuals).filter(([_, val]) => val !== '' && val !== undefined);
    if (entries.length === 0) return;

    await db.transaction('rw', [db.stock_counts], async () => {
      for (const [itemId, actualStr] of entries) {
        const actual = parseFloat(actualStr) || 0;
        await db.stock_counts.put({
          id: `${session.id}-${itemId}`,
          item_id: itemId,
          day_session_id: session.id,
          expected: stockBalances?.[itemId] || 0,
          actual,
          variance: round2(actual - (stockBalances?.[itemId] || 0)),
          created_at: new Date().toISOString(),
        });
      }
    });

    setSaved(true);
    addToast(t('stock.saved'), 'success');
  };

  const getItemName = (item) => item.name;

  if (!items || !stockBalances) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-brown/40 font-sans animate-pulse-gentle">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif font-bold text-espresso text-2xl">{t('stock.title')}</h1>
          <p className="text-brown/50 font-sans text-sm mt-1">{t('stock.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-sans text-brown cursor-pointer">
            <input
              type="checkbox"
              checked={showVarianceOnly}
              onChange={(e) => setShowVarianceOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-teal"
            />
            {t('stock.filter_variance')}
          </label>
          <button
            className="btn-primary px-6"
            onClick={handleSave}
            disabled={saved || Object.keys(actuals).length === 0}
            id="btn-save-stock"
          >
            {saved ? '✓ ' : ''}{t('stock.save')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="card shadow-medium overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brown/5">
                <th className="text-left px-5 py-3 font-sans font-semibold text-espresso text-sm">Item</th>
                <th className="text-center px-4 py-3 font-sans font-semibold text-espresso text-sm">Unit</th>
                <th className="text-center px-4 py-3 font-sans font-semibold text-espresso text-sm">{t('stock.expected')}</th>
                <th className="text-center px-4 py-3 font-sans font-semibold text-espresso text-sm">{t('stock.actual')}</th>
                <th className="text-center px-4 py-3 font-sans font-semibold text-espresso text-sm">{t('stock.variance')}</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item) => {
                const variance = item.actual !== null
                  ? round2(item.actual - item.expected)
                  : null;
                const hasVariance = variance !== null && Math.abs(variance) > 0.01;
                return (
                  <tr key={item.id} className="border-b border-brown/5 last:border-0 hover:bg-cream-dark/30 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-sans font-medium text-espresso text-sm">{getItemName(item)}</span>
                    </td>
                    <td className="text-center px-4 py-3 text-brown/50 text-sm font-sans">{item.unit}</td>
                    <td className="text-center px-4 py-3 font-sans font-semibold text-espresso text-sm">{item.expected}</td>
                    <td className="text-center px-4 py-3">
                      <input
                        type="number"
                        value={actuals[item.id] ?? ''}
                        onChange={(e) => updateActual(item.id, e.target.value)}
                        placeholder="—"
                        step="0.001"
                        className="w-24 text-center bg-cream rounded-btn px-3 py-2 text-sm font-sans font-semibold text-espresso
                                   placeholder:text-brown/20 outline-none focus:ring-2 focus:ring-teal/20"
                      />
                    </td>
                    <td className="text-center px-4 py-3">
                      {variance !== null ? (
                        <span className={`font-sans font-bold text-sm ${
                          hasVariance
                            ? variance < 0 ? 'text-crimson' : 'text-teal'
                            : 'text-brown/40'
                        }`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      ) : (
                        <span className="text-brown/20 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
