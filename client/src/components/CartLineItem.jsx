import React from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatINR } from '../utils/tax.js';
import SafeImage from './SafeImage.jsx';

/**
 * Cart Line Item with thumbnail preview, smooth quantity steppers, and animated removal
 */
export default function CartLineItem({
  item,
  isSelected = false,
  onUpdateQuantity,
  onUpdateWeight,
  onEditWeight,
  onRemoveItem,
  onRemoveDiscount,
  onLineDiscountClick,
}) {
  const isWeight = item.sellBy === 'weight' || item.item_type === 'weight' || Boolean(item.weight_kg);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0, padding: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`group flex items-center gap-3 p-2.5 rounded-card bg-cream-card transition-all duration-200 border ${
        isSelected
          ? 'border-2 border-teal ring-4 ring-teal ring-offset-2 ring-offset-cream bg-teal/10 shadow-medium scale-[1.01] z-10'
          : 'border border-brown/10 hover:border-teal/30 hover:shadow-soft'
      }`}
    >
      {/* 56x56px Rounded Thumbnail */}
      <div className="relative w-14 h-14 min-w-[56px] min-h-[56px] rounded-btn overflow-hidden bg-cream-muted border border-brown/10 shadow-sm shrink-0">
        <SafeImage
          src={item.image_url}
          alt={item.name || item.item_name}
          categoryName={item.category_name || item.name || item.item_name}
          className="w-full h-full object-cover"
          fallbackSize={20}
        />
        {/* Token or Weight mini-badge */}
        {item.is_made_to_order === 1 && item.token_number && (
          <span className="absolute bottom-1 right-1 bg-teal text-white text-[9px] font-mono font-bold px-1 rounded shadow-sm">
            T{item.token_number}
          </span>
        )}
      </div>

      {/* Item Information & Controls */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Item Name & Line Total */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isSelected && (
              <span className="w-2 h-2 rounded-full bg-teal animate-ping shrink-0" title="Active Line Item" />
            )}
            <h4 className={`font-sans text-sm leading-snug truncate ${
              isSelected ? 'font-bold text-teal' : 'font-semibold text-espresso'
            }`}>
              {item.item_name}
            </h4>
          </div>
          <span className="font-sans font-bold text-espresso text-sm whitespace-nowrap">
            {formatINR(item.line_total)}
          </span>
        </div>

        {/* Row 2: Price calculation subtext & GST */}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-brown/60 font-sans">
          {isWeight ? (
            <span>
              {item.weight_kg < 1
                ? `${Math.round(item.weight_kg * 1000)} g`
                : `${item.weight_kg} kg`} × {formatINR(item.price)}/kg
            </span>
          ) : (
            <span>{item.quantity} × {formatINR(item.price)}</span>
          )}
          {item.tax_rate_pct > 0 && (
            <span className="text-[10px] text-brown/40">· GST {item.tax_rate_pct}%</span>
          )}
        </div>

        {/* Row 3: Discounts (if applicable) */}
        {item.discount_amount > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] font-medium text-teal font-sans">
              −{formatINR(item.discount_amount)} disc
              {item.discount_preset && ` (${item.discount_preset})`}
            </span>
            {onRemoveDiscount && (
              <button
                type="button"
                className="text-[10px] text-crimson hover:underline"
                onClick={() => onRemoveDiscount(item.id)}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Row 4: Quantity / Weight Stepper & Delete Button */}
        <div className="flex items-center justify-between mt-2 pt-1 border-t border-brown/5">
          {!isWeight ? (
            <div className="flex items-center bg-cream-muted rounded-btn border border-brown/10">
              <button
                type="button"
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                className="w-7 h-7 flex items-center justify-center text-brown hover:text-espresso hover:bg-brown/10 rounded-l-btn transition-colors"
                aria-label="Decrease quantity"
              >
                {item.quantity === 1 ? <Trash2 size={12} className="text-crimson/70" /> : <Minus size={12} />}
              </button>

              <span className="w-7 text-center font-sans font-semibold text-xs text-espresso">
                {item.quantity}
              </span>

              <button
                type="button"
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                className="w-7 h-7 flex items-center justify-center text-teal hover:text-teal-dark hover:bg-teal/10 rounded-r-btn transition-colors"
                aria-label="Increase quantity"
              >
                <Plus size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center bg-cream-muted rounded-btn border border-brown/10">
              <button
                type="button"
                onClick={() => onUpdateWeight && onUpdateWeight(item.id, Math.max(0, Math.round((item.weight_kg - 0.05) * 100) / 100))}
                className="w-7 h-7 flex items-center justify-center text-brown hover:text-espresso hover:bg-brown/10 rounded-l-btn transition-colors"
                title="Decrease by 50 g"
                aria-label="Decrease weight"
              >
                {item.weight_kg <= 0.05 ? <Trash2 size={12} className="text-crimson/70" /> : <Minus size={12} />}
              </button>

              <button
                type="button"
                onClick={() => onEditWeight && onEditWeight(item)}
                className="px-2 text-center font-sans font-semibold text-xs text-espresso hover:text-teal transition-colors"
                title="Click or press Enter to edit weight"
              >
                {item.weight_kg < 1 ? `${Math.round(item.weight_kg * 1000)} g` : `${item.weight_kg} kg`}
              </button>

              <button
                type="button"
                onClick={() => onUpdateWeight && onUpdateWeight(item.id, Math.min(25, Math.round((item.weight_kg + 0.05) * 100) / 100))}
                className="w-7 h-7 flex items-center justify-center text-teal hover:text-teal-dark hover:bg-teal/10 rounded-r-btn transition-colors"
                title="Increase by 50 g"
                aria-label="Increase weight"
              >
                <Plus size={12} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {onLineDiscountClick && (
              <button
                type="button"
                onClick={() => onLineDiscountClick(item.id)}
                className="text-[11px] text-teal/80 hover:text-teal font-medium hover:underline"
              >
                Discount
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemoveItem(item.id)}
              className="p-1 text-brown/40 hover:text-crimson transition-colors rounded hover:bg-crimson/5"
              aria-label="Remove item"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
