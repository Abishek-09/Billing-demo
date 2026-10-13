import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Scale } from 'lucide-react';
import { formatINR } from '../utils/tax.js';
import SafeImage from './SafeImage.jsx';

/**
 * Premium Artisan Bakery Product Card
 * Features Framer Motion hover zoom, translucent badges, gradient overlay, and tactile action button
 */
export default function ProductCard({ item, categoryName = '', onSelect, isHighlighted = false }) {
  const isWeight = item.sellBy === 'weight' || item.item_type === 'weight' || item.unit === 'kg';
  const badgeLabel = item.badge || (isWeight ? 'By Weight' : `1 ${item.unit || 'pc'}`);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      onClick={() => onSelect(item)}
      id={`item-${item.id}`}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-card bg-cream-card transition-all duration-200 cursor-pointer select-none text-left ${
        isHighlighted
          ? 'border-2 border-teal ring-4 ring-teal ring-offset-2 ring-offset-cream shadow-lifted scale-[1.03] z-10 bg-teal/5'
          : 'border border-brown/10 hover:border-teal/30 shadow-soft hover:shadow-medium'
      }`}
    >
      {/* Top Image Container with aspect-[4/3] */}
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-t-card bg-cream-muted">
        {/* Prominent High-Contrast Cursor Badge when card is active via keyboard */}
        {isHighlighted && (
          <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between px-2.5 py-1 rounded-pill bg-teal text-white shadow-lifted animate-pulse font-sans text-xs font-bold border border-white/40">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span className="tracking-wide">SELECTED</span>
            </div>
            <span className="font-mono text-[11px] bg-white/20 px-2 py-0.5 rounded font-semibold">
              ↵ {isWeight ? 'Select Weight' : 'Press Enter'}
            </span>
          </div>
        )}

        {/* Animated Zooming Image */}
        <motion.div
          className="w-full h-full"
          whileHover={{ scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <SafeImage
            src={item.image_url}
            alt={item.name}
            categoryName={categoryName}
            className="w-full h-full"
            fallbackSize={32}
          />
        </motion.div>

        {/* Gradient Scrim Overlay for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

        {/* Top-Left Badge (Translucent backdrop blur) - hidden when SELECTED banner is showing */}
        {!isHighlighted && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-pill bg-black/45 backdrop-blur-md border border-white/20 text-white font-sans text-[11px] font-semibold tracking-wide shadow-sm">
            {isWeight && <Scale size={11} className="text-white/80" />}
            <span>{badgeLabel}</span>
          </div>
        )}

        {/* Top-Right Category Tag - hidden when SELECTED banner is showing */}
        {!isHighlighted && categoryName && (
          <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur-sm text-espresso font-mono text-[10px] uppercase tracking-wider font-semibold shadow-xs">
            {categoryName}
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          {/* Title with truncation */}
          <h3 className={`font-serif font-bold text-base leading-snug truncate transition-colors ${
            isHighlighted ? 'text-teal font-extrabold' : 'text-espresso group-hover:text-teal'
          }`}>
            {item.name}
          </h3>

          {/* Subtext description */}
          <p className="text-brown/70 font-sans text-xs line-clamp-2 mt-1 leading-relaxed">
            {item.description || (item.is_made_to_order ? 'Freshly prepared to order' : 'Freshly baked daily')}
          </p>
        </div>

        {/* Price & Action Button */}
        <div className="mt-3.5 pt-2.5 border-t border-brown/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-brown/50 block">Price</span>
            <div className="font-sans font-bold text-espresso text-base leading-tight">
              {formatINR(item.price)}
              <span className="text-xs font-normal text-brown/60 ml-1">
                / {isWeight ? 'kg' : (item.unit || 'pc')}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`flex items-center gap-1 px-3 py-1.5 rounded-btn text-xs font-semibold transition-all duration-200 shadow-sm ${
              isHighlighted
                ? 'bg-teal text-white shadow-soft font-bold scale-105'
                : 'border border-teal text-teal group-hover:bg-teal group-hover:text-white'
            }`}
          >
            {isWeight ? <Scale size={13} /> : <Plus size={13} />}
            <span>{isWeight ? 'Select Weight' : 'Add'}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
