import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Scale, Check, X } from 'lucide-react';
import { formatINR, round2 } from '../utils/tax.js';

// Quick preset weights in kilograms
const PRESETS = [
  { key: '1', label: '250 g', weightKg: 0.25 },
  { key: '2', label: '500 g', weightKg: 0.50 },
  { key: '3', label: '750 g', weightKg: 0.75 },
  { key: '4', label: '1 kg',   weightKg: 1.00 },
  { key: '5', label: '1.5 kg', weightKg: 1.50 },
  { key: '6', label: '2 kg',   weightKg: 2.00 },
];

/**
 * WeightPicker modal for weight-based bakery items
 * Supports keyboard keys 1-6 (presets), G / K (unit toggle), Enter (confirm), Esc (cancel)
 */
export default function WeightPicker({
  item,
  initialWeightKg = null,
  onConfirm,
  onCancel,
}) {
  // Determine initial unit and custom display value
  const [unit, setUnit] = useState(() => (initialWeightKg && initialWeightKg >= 1 ? 'kg' : 'g'));
  const [customValue, setCustomValue] = useState(() => {
    if (!initialWeightKg) return '';
    return initialWeightKg >= 1
      ? initialWeightKg.toString()
      : Math.round(initialWeightKg * 1000).toString();
  });
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  // Compute normalized weight in kilograms (0.5 = 500 g)
  const weightKg = useMemo(() => {
    const val = parseFloat(customValue);
    if (isNaN(val) || val <= 0) return 0;
    return unit === 'g' ? round2(val / 1000) : round2(val);
  }, [customValue, unit]);

  // Live line total calculation: weightKg * pricePerKg
  const lineTotal = useMemo(() => {
    return round2(weightKg * (item?.price || 0));
  }, [weightKg, item?.price]);

  // Validation & submission
  const handleValidateAndSubmit = (wKg) => {
    if (!wKg || isNaN(wKg) || wKg <= 0) {
      setError('Please enter a valid weight greater than 0');
      inputRef.current?.focus();
      return;
    }
    if (wKg > 25) {
      setError('Maximum allowed weight is 25 kg');
      inputRef.current?.focus();
      return;
    }
    onConfirm(round2(wKg));
  };

  // Auto-focus dialog container on mount so 1-6 presets trigger immediately
  // and pressing Tab moves focus directly into custom weight input
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Keyboard shortcut listener: 1-6 presets, G/K toggle, Enter confirm, Esc cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1 to 6 presets
      const preset = PRESETS.find(p => p.key === e.key);
      if (preset) {
        // When not typing inside custom input, or with Alt key
        if (document.activeElement !== inputRef.current || e.altKey) {
          e.preventDefault();
          handleValidateAndSubmit(preset.weightKg);
          return;
        }
      }

      // Unit switch: G / K (case-insensitive)
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setUnit('g');
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setUnit('kg');
        return;
      }

      // Enter confirms
      if (e.key === 'Enter') {
        e.preventDefault();
        handleValidateAndSubmit(weightKg);
        return;
      }

      // Escape cancels without adding
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [weightKg, customValue, onCancel]);

  return (
    <div
      className="fixed inset-0 bg-espresso/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-cream-card rounded-2xl shadow-lifted border border-brown/15 p-6 w-full max-w-sm animate-fade-in text-left outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weight-picker-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-brown/10">
          <div>
            <div className="flex items-center gap-1.5 text-teal font-sans text-xs font-semibold uppercase tracking-wider">
              <Scale size={14} />
              <span>Weight-Based Selling</span>
            </div>
            <h3 id="weight-picker-title" className="font-serif font-bold text-espresso text-lg mt-0.5">
              {item?.name}
            </h3>
            <p className="font-sans text-xs text-brown/60">
              Rate: <span className="font-semibold text-espresso">{formatINR(item?.price)}</span> / kg
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={onCancel}
            className="text-brown/40 hover:text-espresso p-1 transition-colors"
            title="Cancel (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Presets (1-6) */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brown/50">
              Quick Presets
            </span>
            <span className="font-mono text-[10px] text-teal font-semibold">Keys 1–6</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const isSelected = Math.abs(weightKg - p.weightKg) < 0.001;
              return (
                <button
                  key={p.key}
                  type="button"
                  tabIndex={-1}
                  id={`preset-${p.key}`}
                  onClick={() => handleValidateAndSubmit(p.weightKg)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-xs font-sans font-semibold transition-all ${
                    isSelected
                      ? 'bg-teal text-white border-teal shadow-soft'
                      : 'bg-cream border-brown/15 hover:border-teal hover:bg-teal/5 text-espresso'
                  }`}
                >
                  <span>{p.label}</span>
                  <kbd className={`text-[10px] font-mono px-1 py-0.2 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-black/10 text-brown/70'}`}>
                    {p.key}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Weight Input & G / K Unit Toggle */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="custom-weight-input" className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brown/50">
              Custom Weight
            </label>
            <div className="flex items-center gap-1 bg-cream rounded-lg p-0.5 border border-brown/15 text-xs">
              <button
                type="button"
                onClick={() => setUnit('g')}
                className={`px-2 py-0.5 rounded font-sans font-semibold transition-colors ${
                  unit === 'g' ? 'bg-teal text-white' : 'text-brown/60 hover:text-espresso'
                }`}
                title="Switch to Grams (Press G)"
              >
                g (G)
              </button>
              <button
                type="button"
                onClick={() => setUnit('kg')}
                className={`px-2 py-0.5 rounded font-sans font-semibold transition-colors ${
                  unit === 'kg' ? 'bg-teal text-white' : 'text-brown/60 hover:text-espresso'
                }`}
                title="Switch to Kilograms (Press K)"
              >
                kg (K)
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              id="custom-weight-input"
              ref={inputRef}
              type="number"
              step={unit === 'g' ? '1' : '0.01'}
              min="0"
              max={unit === 'g' ? '25000' : '25'}
              value={customValue}
              onChange={(e) => {
                setCustomValue(e.target.value);
                setError('');
              }}
              placeholder={unit === 'g' ? 'e.g., 500' : 'e.g., 0.5 or 1.25'}
              className="w-full bg-cream rounded-xl pl-3.5 pr-12 py-2.5 text-base font-sans font-bold text-espresso border border-brown/20 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-sans font-semibold text-xs text-brown/50 pointer-events-none">
              {unit}
            </span>
          </div>

          {error && <p className="text-crimson text-xs font-sans mt-1.5 font-medium">{error}</p>}
        </div>

        {/* Live Calculation Preview */}
        <div className="mt-4 p-3 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-between">
          <span className="text-xs font-sans text-brown font-medium">Line Total Preview</span>
          <div className="text-right">
            <div className="font-sans font-bold text-teal text-base leading-tight">
              {formatINR(lineTotal)}
            </div>
            <div className="text-[10px] font-sans text-brown/60">
              {unit === 'g' ? `${Math.round(weightKg * 1000)} g` : `${weightKg} kg`} × {formatINR(item?.price)}/kg
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-brown/20 text-brown font-sans font-semibold text-xs hover:bg-black/5 transition-colors"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={() => handleValidateAndSubmit(weightKg)}
            className="flex-1 py-2.5 rounded-xl bg-teal hover:bg-teal-dark text-white font-sans font-bold text-xs shadow-soft flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check size={14} />
            <span>Add (Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
