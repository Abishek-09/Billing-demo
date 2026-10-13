import React, { useEffect } from 'react';
import { X, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatINR } from '../utils/tax.js';
import { formatDateTime } from '../utils/billNumber.js';
import { printBill } from '../services/printer.js';
import useToastStore from '../store/toastStore.js';

export default function BillDetailModal({ bill, onClose }) {
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!bill) return null;

  const isVoided = bill.status === 'voided';
  const items = bill.items || [];

  const handleReprint = async () => {
    try {
      await printBill(bill, items);
      addToast(`Reprinting bill ${bill.bill_number}...`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to print receipt', 'warning');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-cream-card rounded-2xl shadow-lifted border border-brown/15 p-6 w-full max-w-lg max-h-[90vh] flex flex-col text-left"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-brown/10 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-espresso text-lg">{bill.bill_number}</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                isVoided ? 'bg-crimson/10 text-crimson' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {bill.status}
              </span>
            </div>
            <p className="text-xs text-brown/60 font-sans mt-0.5">
              {formatDateTime(bill.created_at)} · Cashier: <span className="font-semibold text-espresso">{bill.cashierName || 'Cashier'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-brown/40 hover:text-espresso p-1 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Void alert banner if voided */}
        {isVoided && (
          <div className="mt-3 p-3 bg-crimson/10 border border-crimson/20 rounded-xl flex items-start gap-2.5 text-xs text-crimson shrink-0">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">This bill was VOIDED</p>
              <p className="mt-0.5 text-crimson/90">Reason: {bill.void_reason || 'No reason provided'}</p>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2 scrollbar-thin mt-2">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="border-b border-brown/10 text-brown/50 uppercase text-[10px] tracking-wider">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty / Weight</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right font-bold">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brown/5">
              {items.map((item, idx) => {
                const isWeight = Boolean(item.weight_kg || item.item_type === 'weight');
                const qtyStr = isWeight
                  ? item.weight_kg < 1 ? `${Math.round(item.weight_kg * 1000)} g` : `${item.weight_kg} kg`
                  : `${item.quantity} ${item.unit || 'pc'}`;
                return (
                  <tr key={item.id || idx} className="hover:bg-cream/40">
                    <td className="py-2 pr-2 font-medium text-espresso">
                      {item.name || item.item_name}
                      {item.tax_rate_pct > 0 && (
                        <span className="text-[10px] text-brown/40 ml-1.5 font-normal">GST {item.tax_rate_pct}%</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-brown/70">{qtyStr}</td>
                    <td className="py-2 text-right text-brown/70">{formatINR(item.price)}</td>
                    <td className="py-2 text-right font-semibold text-espresso">{formatINR(item.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="border-t border-brown/10 pt-3 space-y-1.5 text-xs font-sans shrink-0">
          <div className="flex justify-between text-brown/70">
            <span>Subtotal (Gross):</span>
            <span>{formatINR(bill.subtotal)}</span>
          </div>
          {bill.discount_amount > 0 && (
            <div className="flex justify-between text-amber-700 font-medium">
              <span>Discounts Applied:</span>
              <span>−{formatINR(bill.discount_amount)}</span>
            </div>
          )}
          {bill.cgst_total > 0 && (
            <div className="flex justify-between text-brown/60 text-[11px]">
              <span>CGST / SGST:</span>
              <span>{formatINR(bill.cgst_total)} + {formatINR(bill.sgst_total)} = {formatINR(bill.cgst_total + bill.sgst_total)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-espresso pt-2 border-t border-brown/10">
            <span>Grand Total:</span>
            <span className="text-teal font-extrabold">{formatINR(bill.grand_total)}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-brown/10 mt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-brown/20 text-brown hover:bg-black/5 text-xs font-medium transition-colors"
          >
            Close (Esc)
          </button>
          <button
            type="button"
            onClick={handleReprint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal hover:bg-teal-dark text-white text-xs font-bold shadow-soft transition-colors"
          >
            <Printer size={14} />
            <span>Reprint Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
