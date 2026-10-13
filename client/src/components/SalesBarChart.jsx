import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatINR } from '../utils/tax.js';

/**
 * Interactive SVG Sales Bar Chart
 * Supports:
 * - Hourly breakdown (Today/Yesterday)
 * - 7-Day breakdown (Week)
 * - 28-31 Day breakdown (Month)
 * - 12-Month breakdown (Year)
 * Features tooltips, zero-gap rendering, hover guides, and click-to-drilldown.
 */
export default function SalesBarChart({ data = [], onDrillDown = null, periodType = 'week' }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-brown/40 font-sans text-xs">
        No sales data available for this chart
      </div>
    );
  }

  // Find max sales to scale Y-axis
  const maxSales = Math.max(...data.map(d => d.sales || 0), 100);
  // Round maxSales up nicely to nearest 500 or 1000 for clean Y gridlines
  const yMax = Math.ceil(maxSales / 500) * 500 || 500;
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  // Dimensions
  const height = 220;
  const chartHeight = 160;
  const paddingTop = 20;
  const paddingBottom = 40;
  const paddingLeft = 55;
  const paddingRight = 15;
  const totalWidth = 720;
  const plotWidth = totalWidth - paddingLeft - paddingRight;

  const barCount = data.length;
  const slotWidth = plotWidth / barCount;
  // Dynamic bar width depending on number of slots
  const barWidth = Math.max(3, Math.min(slotWidth * 0.65, 36));

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        className="w-full h-auto max-h-64 overflow-visible"
      >
        {/* Y-Axis Horizontal Gridlines & Labels */}
        {yTicks.map((tickVal) => {
          const yPos = paddingTop + chartHeight - (tickVal / yMax) * chartHeight;
          return (
            <g key={`y-tick-${tickVal}`}>
              <line
                x1={paddingLeft}
                y1={yPos}
                x2={totalWidth - paddingRight}
                y2={yPos}
                stroke="currentColor"
                className="text-brown/10"
                strokeDasharray={tickVal === 0 ? 'none' : '3 3'}
                strokeWidth={tickVal === 0 ? 1.5 : 1}
              />
              <text
                x={paddingLeft - 8}
                y={yPos + 3.5}
                textAnchor="end"
                className="fill-brown/50 font-mono text-[9px]"
              >
                {tickVal === 0 ? '₹0' : formatINR(tickVal).replace('.00', '')}
              </text>
            </g>
          );
        })}

        {/* Bars and X Labels */}
        {data.map((item, idx) => {
          const xCenter = paddingLeft + idx * slotWidth + slotWidth / 2;
          const xPos = xCenter - barWidth / 2;
          const val = item.sales || 0;
          const barH = Math.max(val > 0 ? 3 : 1, (val / yMax) * chartHeight);
          const yPos = paddingTop + chartHeight - barH;
          const isHovered = hoveredIndex === idx;
          const isDrillable = Boolean(item.drillType && onDrillDown);

          // Subsample X labels for month view so they don't overlap (show odd days or every 3rd day)
          const showLabel =
            barCount <= 14 ||
            (barCount > 14 && (idx % 2 === 0 || idx === barCount - 1));

          return (
            <g
              key={item.key || idx}
              className={`transition-opacity ${isDrillable ? 'cursor-pointer' : 'cursor-default'}`}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => {
                if (isDrillable) onDrillDown(item);
              }}
            >
              {/* Invisible wide hit area for easy hover / touch */}
              <rect
                x={paddingLeft + idx * slotWidth}
                y={paddingTop}
                width={slotWidth}
                height={chartHeight + 25}
                fill="transparent"
              />

              {/* Hover Column Spotlight Guide */}
              {isHovered && (
                <rect
                  x={paddingLeft + idx * slotWidth + 1}
                  y={paddingTop}
                  width={slotWidth - 2}
                  height={chartHeight}
                  fill="currentColor"
                  className="text-teal/10 rounded"
                />
              )}

              {/* The Bar */}
              <rect
                x={xPos}
                y={yPos}
                width={barWidth}
                height={barH}
                rx={Math.min(barWidth / 2, 4)}
                className={`transition-all duration-200 ${
                  val > 0
                    ? isHovered
                      ? 'fill-teal shadow-soft brightness-110'
                      : 'fill-teal/80 hover:fill-teal'
                    : 'fill-brown/15'
                }`}
              />

              {/* X-Axis Label */}
              {showLabel && (
                <text
                  x={xCenter}
                  y={paddingTop + chartHeight + 16}
                  textAnchor="middle"
                  className={`font-sans text-[10px] transition-colors ${
                    isHovered
                      ? 'fill-teal font-bold'
                      : 'fill-brown/60 font-medium'
                  }`}
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      <AnimatePresence>
        {hoveredIndex !== null && data[hoveredIndex] && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-2 right-4 bg-espresso text-cream-card rounded-xl px-3.5 py-2 shadow-lifted border border-white/10 pointer-events-none z-30"
          >
            <div className="text-[11px] font-sans font-semibold text-white/80 border-b border-white/10 pb-1 mb-1 flex items-center justify-between gap-4">
              <span>{data[hoveredIndex].label}</span>
              {data[hoveredIndex].drillType && (
                <span className="text-[9px] text-teal font-mono uppercase bg-teal/20 px-1.5 py-0.2 rounded">
                  Click to Drill
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-xs text-brown/50 font-sans">Sales:</span>
              <span className="font-sans font-bold text-teal text-sm">
                {formatINR(data[hoveredIndex].sales)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-xs">
              <span className="text-brown/50 font-sans">Bills:</span>
              <span className="font-mono text-white/90 font-semibold">
                {data[hoveredIndex].billsCount} {data[hoveredIndex].billsCount === 1 ? 'bill' : 'bills'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
