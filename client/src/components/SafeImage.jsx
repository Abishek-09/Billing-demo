import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Coffee, 
  Cake, 
  Cookie, 
  Croissant, 
  UtensilsCrossed, 
  Sandwich,
  Candy,
  Sparkles
} from 'lucide-react';

/**
 * Returns category visual styling (gradient background & icon) for offline/fallback states
 */
function getCategoryVisual(categoryName = '') {
  const cat = (categoryName || '').toLowerCase();
  
  if (cat.includes('tea') || cat.includes('chai')) {
    return {
      gradient: 'from-[#5D4037] via-[#8D6E63] to-[#A1887F]',
      accent: 'text-amber-200',
      tag: 'Fresh Chai',
      Icon: Coffee,
    };
  }
  if (cat.includes('coffee') || cat.includes('brew')) {
    return {
      gradient: 'from-[#2B1810] via-[#3E2723] to-[#4E342E]',
      accent: 'text-amber-300',
      tag: 'Espresso Brew',
      Icon: Coffee,
    };
  }
  if (cat.includes('cold') || cat.includes('drink') || cat.includes('beverage')) {
    return {
      gradient: 'from-[#004D40] via-[#00695C] to-[#00796B]',
      accent: 'text-teal-200',
      tag: 'Chilled',
      Icon: Coffee,
    };
  }
  if (cat.includes('bread') || cat.includes('bun') || cat.includes('pav') || cat.includes('loaf')) {
    return {
      gradient: 'from-[#6D4C41] via-[#8D6E63] to-[#D7CCC8]',
      accent: 'text-amber-100',
      tag: 'Daily Bake',
      Icon: Croissant,
    };
  }
  if (cat.includes('cake') || cat.includes('pastr')) {
    return {
      gradient: 'from-[#4A154B] via-[#6A1B9A] to-[#8E24AA]',
      accent: 'text-pink-200',
      tag: 'Patisserie',
      Icon: Cake,
    };
  }
  if (cat.includes('muffin') || cat.includes('brownie')) {
    return {
      gradient: 'from-[#3E2723] via-[#4E342E] to-[#5D4037]',
      accent: 'text-amber-200',
      tag: 'Fresh Baked',
      Icon: Cake,
    };
  }
  if (cat.includes('cookie') || cat.includes('biscuit')) {
    return {
      gradient: 'from-[#795548] via-[#A1887F] to-[#D7CCC8]',
      accent: 'text-amber-200',
      tag: 'Crisp Butter',
      Icon: Cookie,
    };
  }
  if (cat.includes('snack') || cat.includes('samosa') || cat.includes('savouri') || cat.includes('puff')) {
    return {
      gradient: 'from-[#E65100] via-[#F57C00] to-[#FB8C00]',
      accent: 'text-amber-100',
      tag: 'Crisp & Savory',
      Icon: Sandwich,
    };
  }
  if (cat.includes('sweet') || cat.includes('jamun') || cat.includes('jalebi') || cat.includes('barfi')) {
    return {
      gradient: 'from-[#880E4F] via-[#AD1457] to-[#C2185B]',
      accent: 'text-rose-200',
      tag: 'Mithai',
      Icon: Candy,
    };
  }

  // General bakery fallback
  return {
    gradient: 'from-[#116D6E] via-[#0E5B5C] to-[#0A4344]',
    accent: 'text-teal-200',
    tag: 'Bake & Brew',
    Icon: UtensilsCrossed,
  };
}

/**
 * Robust image component with:
 * 1. State synchronization when `src` updates
 * 2. `referrerPolicy="no-referrer"` to prevent CDN hotlinking blocks
 * 3. Smooth fade-in on load
 * 4. Beautiful artisan bakery illustration fallback with rich gradients when offline or image fails
 */
export default function SafeImage({
  src,
  alt = 'Artisan Bakery Product',
  categoryName = '',
  className = '',
  motionProps = {},
  fallbackSize = 28,
}) {
  const [hasError, setHasError] = useState(!src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [retryAttempted, setRetryAttempted] = useState(false);

  // Sync state whenever src prop changes (e.g., from Dexie live queries)
  useEffect(() => {
    setHasError(!src);
    setIsLoaded(false);
    setRetryAttempted(false);
  }, [src]);

  const visual = getCategoryVisual(categoryName);
  const FallbackIcon = visual.Icon;

  const handleImageError = () => {
    if (!retryAttempted && src && src.includes('images.unsplash.com')) {
      // First retry: try stripped Unsplash URL without extra query params
      setRetryAttempted(true);
      const cleanUrl = src.split('?')[0] + '?auto=format&fit=crop&w=400&q=75';
      if (cleanUrl !== src) {
        return; // Let browser attempt with cleanUrl
      }
    }
    setHasError(true);
  };

  // If image errored or no src provided, display the rich artisan category fallback
  if (hasError || !src) {
    return (
      <div
        className={`relative overflow-hidden flex flex-col items-center justify-center p-3 select-none bg-gradient-to-br ${visual.gradient} ${className}`}
        role="img"
        aria-label={alt}
      >
        {/* Subtle decorative background circles */}
        <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/10 blur-sm pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-full bg-black/10 blur-sm pointer-events-none" />

        {/* Center Food Category Icon */}
        <div className="relative z-10 w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-soft mb-1.5">
          <FallbackIcon size={fallbackSize} className={visual.accent} strokeWidth={2} />
        </div>

        {/* Product / Category Monogram Badge */}
        <span className="relative z-10 text-[10px] font-mono uppercase tracking-wider text-white/90 font-bold bg-black/25 px-2 py-0.5 rounded-pill backdrop-blur-sm">
          {alt || visual.tag}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-cream-muted ${className}`}>
      {/* Subtle shimmer skeleton while image is downloading */}
      {!isLoaded && (
        <div className={`absolute inset-0 bg-gradient-to-br ${visual.gradient} opacity-40 animate-pulse flex items-center justify-center`}>
          <FallbackIcon size={fallbackSize * 0.8} className="text-white/40" />
        </div>
      )}

      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        draggable={false}
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onLoad={() => setIsLoaded(true)}
        onError={handleImageError}
        className="w-full h-full object-cover object-center"
        {...motionProps}
      />
    </div>
  );
}
