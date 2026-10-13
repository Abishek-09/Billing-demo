/**
 * Tax calculation utilities.
 * GST is split equally into CGST and SGST for intra-state sales.
 * All amounts are rounded to 2 decimal places.
 */

/**
 * Calculate tax breakdown for a line item.
 * @param {number} lineTotal - Pre-tax amount for the line
 * @param {number} taxRatePct - GST rate percentage (e.g., 5, 12, 18)
 * @returns {{ cgst: number, sgst: number, taxAmount: number }}
 */
export function calculateLineTax(lineTotal, taxRatePct) {
  if (!taxRatePct || taxRatePct <= 0) {
    return { cgst: 0, sgst: 0, taxAmount: 0 };
  }
  const halfRate = taxRatePct / 2;
  const cgst = round2(lineTotal * halfRate / 100);
  const sgst = round2(lineTotal * halfRate / 100);
  return {
    cgst,
    sgst,
    taxAmount: round2(cgst + sgst),
  };
}

/**
 * Calculate the price for a weight-based item.
 * @param {number} pricePerKg - Price per kilogram
 * @param {number} weightKg - Weight in kilograms (up to 3 decimal places)
 * @returns {number} Line total rounded to 2 decimals
 */
export function calculateWeightPrice(pricePerKg, weightKg) {
  return round2(pricePerKg * weightKg);
}

/**
 * Apply a discount to an amount.
 * @param {number} amount - Original amount
 * @param {'percent'|'flat'} type - Discount type
 * @param {number} value - Discount value (percentage or flat amount)
 * @returns {number} Discount amount (not the discounted price)
 */
export function calculateDiscount(amount, type, value) {
  if (!value || value <= 0) return 0;
  if (type === 'percent') {
    return round2(amount * Math.min(value, 100) / 100);
  }
  return round2(Math.min(value, amount));
}

/**
 * Round a number to 2 decimal places.
 */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Format amount in INR.
 */
export function formatINR(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  // Indian numbering format
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Recalculate entire bill totals from bill items.
 * @param {Array} items - Array of bill item objects
 * @param {{ type: string, value: number }} billDiscount - Bill-level discount
 * @returns {Object} Bill totals
 */
export function calculateBillTotals(items, billDiscount = null) {
  let subtotal = 0;
  let lineDiscountsTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;

  for (const item of items) {
    // Line total after line discount
    const lineGross = item.line_total || 0;
    const lineDisc = item.discount_amount || 0;
    const lineNet = round2(lineGross - lineDisc);
    lineDiscountsTotal += lineDisc;
    subtotal += lineGross;

    // Tax on net line amount (after line discount)
    const { cgst, sgst } = calculateLineTax(lineNet, item.tax_rate_pct);
    cgstTotal += cgst;
    sgstTotal += sgst;
  }

  subtotal = round2(subtotal);
  lineDiscountsTotal = round2(lineDiscountsTotal);

  // Bill-level discount applied on (subtotal - lineDiscounts)
  let billDiscountAmount = 0;
  if (billDiscount && billDiscount.value > 0) {
    const discountBase = round2(subtotal - lineDiscountsTotal);
    billDiscountAmount = calculateDiscount(discountBase, billDiscount.type, billDiscount.value);
  }

  // If bill discount exists, recalculate tax on reduced amounts
  // Proportionally distribute bill discount across items
  if (billDiscountAmount > 0) {
    cgstTotal = 0;
    sgstTotal = 0;
    const discountBase = round2(subtotal - lineDiscountsTotal);
    const discountRatio = discountBase > 0 ? billDiscountAmount / discountBase : 0;

    for (const item of items) {
      const lineGross = item.line_total || 0;
      const lineDisc = item.discount_amount || 0;
      const lineNet = round2(lineGross - lineDisc);
      const itemBillDiscount = round2(lineNet * discountRatio);
      const taxableAmount = round2(lineNet - itemBillDiscount);
      const { cgst, sgst } = calculateLineTax(taxableAmount, item.tax_rate_pct);
      cgstTotal += cgst;
      sgstTotal += sgst;
    }
  }

  cgstTotal = round2(cgstTotal);
  sgstTotal = round2(sgstTotal);
  const taxTotal = round2(cgstTotal + sgstTotal);
  const totalDiscount = round2(lineDiscountsTotal + billDiscountAmount);
  const grandTotal = round2(subtotal - totalDiscount + taxTotal);

  return {
    subtotal,
    discount_amount: totalDiscount,
    bill_discount_amount: billDiscountAmount,
    line_discounts_total: lineDiscountsTotal,
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    tax_total: taxTotal,
    grand_total: Math.max(0, grandTotal),
  };
}
