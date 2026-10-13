import db from '../db/dexie.js';
import { formatINR, round2 } from './tax.js';
import { formatDateTime } from './billNumber.js';

// Month names in English
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Format date in Indian format (DD MMM YYYY, e.g. "13 Oct 2026")
 */
export function formatDateIST(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format short date (DD MMM, e.g. "13 Oct")
 */
export function formatShortDateIST(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  return `${day} ${month}`;
}

/**
 * Helper to get YYYY-MM-DD in local time
 */
export function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate the exact start and end ISO timestamps and label for a period.
 * Week starts on Monday.
 * Year can be Calendar (Jan-Dec) or Financial (Apr-Mar).
 */
export function getPeriodBounds(period, refDateStr, yearType = 'calendar', customFrom = null, customTo = null) {
  const ref = refDateStr ? new Date(`${refDateStr}T12:00:00`) : new Date();

  let fromDate, toDate, label, prevFromDate, prevToDate, prevLabel;

  if (period === 'today') {
    const todayStr = toDateStr(ref);
    fromDate = new Date(`${todayStr}T00:00:00.000`).toISOString();
    toDate = new Date(`${todayStr}T23:59:59.999`).toISOString();
    label = formatDateIST(ref);

    // Prev = Yesterday
    const prevD = new Date(ref);
    prevD.setDate(prevD.getDate() - 1);
    const prevStr = toDateStr(prevD);
    prevFromDate = new Date(`${prevStr}T00:00:00.000`).toISOString();
    prevToDate = new Date(`${prevStr}T23:59:59.999`).toISOString();
    prevLabel = 'Yesterday';
  } else if (period === 'yesterday') {
    const yestD = new Date(ref);
    yestD.setDate(yestD.getDate() - 1);
    const yestStr = toDateStr(yestD);
    fromDate = new Date(`${yestStr}T00:00:00.000`).toISOString();
    toDate = new Date(`${yestStr}T23:59:59.999`).toISOString();
    label = formatDateIST(yestD);

    // Prev = Day before yesterday
    const prevD = new Date(yestD);
    prevD.setDate(prevD.getDate() - 1);
    const prevStr = toDateStr(prevD);
    prevFromDate = new Date(`${prevStr}T00:00:00.000`).toISOString();
    prevToDate = new Date(`${prevStr}T23:59:59.999`).toISOString();
    prevLabel = formatDateIST(prevD);
  } else if (period === 'week') {
    // Week starts on Monday (ISO-8601 standard)
    const dayOfWeek = (ref.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const mon = new Date(ref);
    mon.setDate(ref.getDate() - dayOfWeek);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);

    const monStr = toDateStr(mon);
    const sunStr = toDateStr(sun);
    fromDate = new Date(`${monStr}T00:00:00.000`).toISOString();
    toDate = new Date(`${sunStr}T23:59:59.999`).toISOString();
    label = `${formatDateIST(mon)} – ${formatDateIST(sun)}`;

    // Prev = Previous week (7 days earlier)
    const prevMon = new Date(mon);
    prevMon.setDate(prevMon.getDate() - 7);
    const prevSun = new Date(sun);
    prevSun.setDate(prevSun.getDate() - 7);
    prevFromDate = new Date(`${toDateStr(prevMon)}T00:00:00.000`).toISOString();
    prevToDate = new Date(`${toDateStr(prevSun)}T23:59:59.999`).toISOString();
    prevLabel = 'last week';
  } else if (period === 'month') {
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    fromDate = new Date(`${toDateStr(firstDay)}T00:00:00.000`).toISOString();
    toDate = new Date(`${toDateStr(lastDay)}T23:59:59.999`).toISOString();
    label = `${FULL_MONTH_NAMES[month]} ${year}`;

    // Prev = Previous calendar month
    const prevFirst = new Date(year, month - 1, 1);
    const prevLast = new Date(year, month, 0);
    prevFromDate = new Date(`${toDateStr(prevFirst)}T00:00:00.000`).toISOString();
    prevToDate = new Date(`${toDateStr(prevLast)}T23:59:59.999`).toISOString();
    prevLabel = 'last month';
  } else if (period === 'year') {
    const year = ref.getFullYear();
    if (yearType === 'financial') {
      // Indian Financial Year: 1 Apr to 31 Mar
      const month = ref.getMonth();
      const fyStartYear = month >= 3 ? year : year - 1;
      const fyEndYear = fyStartYear + 1;
      const startD = new Date(fyStartYear, 3, 1); // 1 Apr
      const endD = new Date(fyEndYear, 2, 31);   // 31 Mar

      fromDate = new Date(`${toDateStr(startD)}T00:00:00.000`).toISOString();
      toDate = new Date(`${toDateStr(endD)}T23:59:59.999`).toISOString();
      label = `FY ${fyStartYear}–${String(fyEndYear).slice(-2)}`;

      // Prev = Previous Financial Year
      const prevStartD = new Date(fyStartYear - 1, 3, 1);
      const prevEndD = new Date(fyStartYear, 2, 31);
      prevFromDate = new Date(`${toDateStr(prevStartD)}T00:00:00.000`).toISOString();
      prevToDate = new Date(`${toDateStr(prevEndD)}T23:59:59.999`).toISOString();
      prevLabel = `FY ${fyStartYear - 1}–${String(fyStartYear).slice(-2)}`;
    } else {
      // Calendar Year: 1 Jan to 31 Dec
      const startD = new Date(year, 0, 1);
      const endD = new Date(year, 11, 31);
      fromDate = new Date(`${toDateStr(startD)}T00:00:00.000`).toISOString();
      toDate = new Date(`${toDateStr(endD)}T23:59:59.999`).toISOString();
      label = `Calendar Year ${year}`;

      // Prev = Previous Calendar Year
      const prevStartD = new Date(year - 1, 0, 1);
      const prevEndD = new Date(year - 1, 11, 31);
      prevFromDate = new Date(`${toDateStr(prevStartD)}T00:00:00.000`).toISOString();
      prevToDate = new Date(`${toDateStr(prevEndD)}T23:59:59.999`).toISOString();
      prevLabel = `${year - 1}`;
    }
  } else if (period === 'custom') {
    const startStr = customFrom || toDateStr(ref);
    const endStr = customTo || toDateStr(ref);
    fromDate = new Date(`${startStr}T00:00:00.000`).toISOString();
    toDate = new Date(`${endStr}T23:59:59.999`).toISOString();
    label = `${formatDateIST(startStr)} – ${formatDateIST(endStr)}`;

    // Prev = Same duration immediately before startStr
    const startD = new Date(startStr);
    const endD = new Date(endStr);
    const dayDiff = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const prevEnd = new Date(startD);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - dayDiff + 1);

    prevFromDate = new Date(`${toDateStr(prevStart)}T00:00:00.000`).toISOString();
    prevToDate = new Date(`${toDateStr(prevEnd)}T23:59:59.999`).toISOString();
    prevLabel = 'prior period';
  }

  return { fromDate, toDate, label, prevFromDate, prevToDate, prevLabel };
}

/**
 * Shift the reference date backward (-1) or forward (+1) by one period
 */
export function shiftPeriod(period, refDateStr, direction, yearType = 'calendar') {
  const d = refDateStr ? new Date(`${refDateStr}T12:00:00`) : new Date();

  if (period === 'today' || period === 'yesterday') {
    d.setDate(d.getDate() + direction);
  } else if (period === 'week') {
    d.setDate(d.getDate() + (direction * 7));
  } else if (period === 'month') {
    d.setMonth(d.getMonth() + direction);
  } else if (period === 'year') {
    d.setFullYear(d.getFullYear() + direction);
  }

  return toDateStr(d);
}

/**
 * ONE single unified calculation pass for report metrics.
 * Reads bills from Dexie or uses provided bills collection.
 * Guarantees all widgets receive matching numbers.
 */
export async function getReport(fromDate, toDate, options = {}) {
  const {
    prevFromDate,
    prevToDate,
    period = 'today',
    yearType = 'calendar',
    label = '',
    prevLabel = 'prior period',
  } = options;

  // 1. Fetch data from Dexie
  const [allBills, allBillItems, categories, users, daySessions] = await Promise.all([
    db.bills.toArray(),
    db.bill_items.toArray(),
    db.categories.toArray(),
    db.users.toArray(),
    db.day_sessions.toArray(),
  ]);

  const catMap = categories.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
  const userMap = users.reduce((acc, u) => { acc[u.id] = u; return acc; }, {});

  // 2. Filter bills for current period
  const fromTime = new Date(fromDate).getTime();
  const toTime = new Date(toDate).getTime();

  const periodBills = allBills.filter(b => {
    if (!b.created_at) return false;
    const t = new Date(b.created_at).getTime();
    return t >= fromTime && t <= toTime;
  });

  const completedBills = periodBills.filter(b => b.status === 'completed' || b.status === 'closed');
  const voidedBills = periodBills.filter(b => b.status === 'voided');

  // Index bill items by bill_id
  const billItemsByBillId = {};
  for (const bi of allBillItems) {
    if (!billItemsByBillId[bi.bill_id]) billItemsByBillId[bi.bill_id] = [];
    billItemsByBillId[bi.bill_id].push(bi);
  }

  // Collect items for completed bills
  const completedBillItems = [];
  for (const b of completedBills) {
    const items = billItemsByBillId[b.id] || [];
    completedBillItems.push(...items);
  }

  // 3. Compute Summary Totals
  const grossSales = round2(completedBills.reduce((sum, b) => sum + (Number(b.subtotal) || 0), 0));
  const discountsGiven = round2(completedBills.reduce((sum, b) => sum + (Number(b.discount_amount) || 0), 0));
  const cgstTotal = round2(completedBills.reduce((sum, b) => sum + (Number(b.cgst_total) || 0), 0));
  const sgstTotal = round2(completedBills.reduce((sum, b) => sum + (Number(b.sgst_total) || 0), 0));
  const taxTotal = round2(cgstTotal + sgstTotal);
  const totalSales = round2(completedBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));
  const totalBills = completedBills.length;

  const itemsSold = round2(completedBillItems.reduce((sum, bi) => {
    return sum + (bi.weight_kg ? 1 : (Number(bi.quantity) || 1));
  }, 0));

  const avgBillValue = totalBills > 0 ? round2(totalSales / totalBills) : 0;

  const voidedBillsCount = voidedBills.length;
  const voidedBillsAmount = round2(voidedBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

  // Reconciliation line: "Gross ₹3,050.00 - Discount ₹149.00 + Tax ₹167.66 = Total Sales ₹3,068.66"
  const formulaLine = `Gross ${formatINR(grossSales)} − Discount ${formatINR(discountsGiven)} + Tax ${formatINR(taxTotal)} = Total Sales ${formatINR(totalSales)}`;

  // 4. Compute Previous Period Comparison
  let prevSales = 0;
  let prevBillsCount = 0;
  let prevItemsCount = 0;
  let prevAvgBill = 0;
  let prevDiscounts = 0;
  let prevVoids = 0;
  let prevTax = 0;

  if (prevFromDate && prevToDate) {
    const pFrom = new Date(prevFromDate).getTime();
    const pTo = new Date(prevToDate).getTime();

    const prevPeriodBills = allBills.filter(b => {
      if (!b.created_at) return false;
      const t = new Date(b.created_at).getTime();
      return t >= pFrom && t <= pTo;
    });

    const prevCompleted = prevPeriodBills.filter(b => b.status === 'completed' || b.status === 'closed');
    const prevVoided = prevPeriodBills.filter(b => b.status === 'voided');

    prevSales = round2(prevCompleted.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));
    prevBillsCount = prevCompleted.length;
    prevAvgBill = prevBillsCount > 0 ? round2(prevSales / prevBillsCount) : 0;
    prevDiscounts = round2(prevCompleted.reduce((sum, b) => sum + (Number(b.discount_amount) || 0), 0));
    prevVoids = prevVoided.length;
    prevTax = round2(prevCompleted.reduce((sum, b) => sum + (Number(b.tax_total) || (b.cgst_total + b.sgst_total) || 0), 0));

    for (const b of prevCompleted) {
      const bItems = billItemsByBillId[b.id] || [];
      prevItemsCount += bItems.reduce((s, bi) => s + (bi.weight_kg ? 1 : (Number(bi.quantity) || 1)), 0);
    }
    prevItemsCount = round2(prevItemsCount);
  }

  const calcDiffPct = (curr, prev) => {
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return round2(((curr - prev) / prev) * 100);
  };

  const comparison = {
    prevLabel,
    salesDiffPct: calcDiffPct(totalSales, prevSales),
    billsDiffPct: calcDiffPct(totalBills, prevBillsCount),
    itemsDiffPct: calcDiffPct(itemsSold, prevItemsCount),
    avgBillDiffPct: calcDiffPct(avgBillValue, prevAvgBill),
    discountsDiffPct: calcDiffPct(discountsGiven, prevDiscounts),
    voidsDiffPct: calcDiffPct(voidedBillsCount, prevVoids),
    taxDiffPct: calcDiffPct(taxTotal, prevTax),
  };

  // 5. Chart Data Buckets (Zero gaps, filled cleanly)
  let chartData = [];
  const startD = new Date(fromDate);
  const endD = new Date(toDate);

  if (period === 'today' || period === 'yesterday') {
    // Hourly buckets: 06:00 to 22:00 (or 24 hours)
    for (let h = 6; h <= 22; h++) {
      const hourLabel = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
      const hourStr = String(h).padStart(2, '0');

      const hourBills = completedBills.filter(b => {
        const bd = new Date(b.created_at);
        return bd.getHours() === h;
      });

      const sales = round2(hourBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));
      chartData.push({
        key: `hour-${h}`,
        label: hourLabel,
        sales,
        billsCount: hourBills.length,
        drillType: null,
        drillParam: null,
      });
    }
  } else if (period === 'week') {
    // 7 Day buckets (Mon to Sun)
    const cur = new Date(startD);
    while (cur <= endD) {
      const dateStr = toDateStr(cur);
      const dayName = DAY_NAMES[cur.getDay()];
      const dayLabel = `${dayName} ${cur.getDate()}`;

      const dayBills = completedBills.filter(b => (b.created_at || '').startsWith(dateStr));
      const sales = round2(dayBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

      chartData.push({
        key: dateStr,
        label: dayLabel,
        sales,
        billsCount: dayBills.length,
        drillType: 'day',
        drillParam: dateStr,
      });

      cur.setDate(cur.getDate() + 1);
    }
  } else if (period === 'month') {
    // 28 to 31 Day buckets
    const cur = new Date(startD);
    while (cur <= endD) {
      const dateStr = toDateStr(cur);
      const dayLabel = `${cur.getDate()}`;

      const dayBills = completedBills.filter(b => (b.created_at || '').startsWith(dateStr));
      const sales = round2(dayBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

      chartData.push({
        key: dateStr,
        label: dayLabel,
        sales,
        billsCount: dayBills.length,
        drillType: 'day',
        drillParam: dateStr,
      });

      cur.setDate(cur.getDate() + 1);
    }
  } else if (period === 'year') {
    // 12 Monthly buckets
    if (yearType === 'financial') {
      // Apr (month 3) to Mar (month 2)
      const fyStartYear = startD.getFullYear();
      for (let i = 0; i < 12; i++) {
        const m = (3 + i) % 12;
        const y = i < 9 ? fyStartYear : fyStartYear + 1;
        const mLabel = `${MONTH_NAMES[m]}`;
        const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;

        const monthBills = completedBills.filter(b => (b.created_at || '').startsWith(prefix));
        const sales = round2(monthBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

        chartData.push({
          key: prefix,
          label: mLabel,
          sales,
          billsCount: monthBills.length,
          drillType: 'month',
          drillParam: `${prefix}-01`,
        });
      }
    } else {
      // Jan (month 0) to Dec (month 11)
      const y = startD.getFullYear();
      for (let m = 0; m < 12; m++) {
        const mLabel = MONTH_NAMES[m];
        const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;

        const monthBills = completedBills.filter(b => (b.created_at || '').startsWith(prefix));
        const sales = round2(monthBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

        chartData.push({
          key: prefix,
          label: mLabel,
          sales,
          billsCount: monthBills.length,
          drillType: 'month',
          drillParam: `${prefix}-01`,
        });
      }
    }
  } else {
    // Custom range (daily)
    const cur = new Date(startD);
    while (cur <= endD) {
      const dateStr = toDateStr(cur);
      const dayLabel = formatShortDateIST(cur);

      const dayBills = completedBills.filter(b => (b.created_at || '').startsWith(dateStr));
      const sales = round2(dayBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0));

      chartData.push({
        key: dateStr,
        label: dayLabel,
        sales,
        billsCount: dayBills.length,
        drillType: 'day',
        drillParam: dateStr,
      });

      cur.setDate(cur.getDate() + 1);
    }
  }

  // 6. Category Breakdown
  const catAgg = {};
  for (const bi of completedBillItems) {
    const cid = bi.category_id || 'uncategorized';
    if (!catAgg[cid]) {
      catAgg[cid] = {
        id: cid,
        name: catMap[cid]?.name || (cid === 'uncategorized' ? 'Uncategorized' : cid),
        itemsCount: 0,
        grossSales: 0,
      };
    }
    catAgg[cid].itemsCount += bi.weight_kg ? 1 : (Number(bi.quantity) || 1);
    catAgg[cid].grossSales += Number(bi.line_total) || 0;
  }

  const categoryBreakdown = Object.values(catAgg)
    .map(c => ({
      ...c,
      grossSales: round2(c.grossSales),
      itemsCount: round2(c.itemsCount),
      sharePct: grossSales > 0 ? round2((c.grossSales / grossSales) * 100) : 0,
    }))
    .sort((a, b) => b.grossSales - a.grossSales);

  // 7. Top 10 Selling Items
  const itemAgg = {};
  for (const bi of completedBillItems) {
    const iid = bi.item_id || bi.name;
    if (!itemAgg[iid]) {
      itemAgg[iid] = {
        id: iid,
        name: bi.name || bi.item_name || 'Item',
        isWeight: Boolean(bi.weight_kg || bi.item_type === 'weight'),
        quantity: 0,
        weightKg: 0,
        revenue: 0,
        categoryName: catMap[bi.category_id]?.name || '',
      };
    }
    if (bi.weight_kg) {
      itemAgg[iid].weightKg += Number(bi.weight_kg) || 0;
      itemAgg[iid].quantity += 1;
    } else {
      itemAgg[iid].quantity += Number(bi.quantity) || 1;
    }
    itemAgg[iid].revenue += Number(bi.line_total) || 0;
  }

  const topItems = Object.values(itemAgg)
    .map(it => ({
      ...it,
      weightKg: round2(it.weightKg),
      revenue: round2(it.revenue),
      sharePct: totalSales > 0 ? round2((it.revenue / totalSales) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 8. Weight vs Piece Selling Breakdown
  let weightKgSold = 0;
  let weightRevenue = 0;
  let pieceCountSold = 0;
  let pieceRevenue = 0;

  for (const bi of completedBillItems) {
    const isW = Boolean(bi.weight_kg || bi.item_type === 'weight');
    if (isW) {
      weightKgSold += Number(bi.weight_kg) || 0;
      weightRevenue += Number(bi.line_total) || 0;
    } else {
      pieceCountSold += Number(bi.quantity) || 1;
      pieceRevenue += Number(bi.line_total) || 0;
    }
  }

  const weightVsPiece = {
    weight: {
      totalKg: round2(weightKgSold),
      revenue: round2(weightRevenue),
      sharePct: totalSales > 0 ? round2((weightRevenue / totalSales) * 100) : 0,
    },
    piece: {
      totalPcs: round2(pieceCountSold),
      revenue: round2(pieceRevenue),
      sharePct: totalSales > 0 ? round2((pieceRevenue / totalSales) * 100) : 0,
    },
  };

  // 9. Payment Mode Split (Cash, UPI, Card)
  const payAgg = { cash: 0, upi: 0, card: 0 };
  const payCounts = { cash: 0, upi: 0, card: 0 };

  for (const b of completedBills) {
    const mode = (b.payment_mode || 'cash').toLowerCase();
    const cleanMode = mode.includes('upi') ? 'upi' : mode.includes('card') ? 'card' : 'cash';
    payAgg[cleanMode] += Number(b.grand_total) || 0;
    payCounts[cleanMode] += 1;
  }

  const paymentModes = [
    { mode: 'UPI / QR', id: 'upi', amount: round2(payAgg.upi), count: payCounts.upi, sharePct: totalSales > 0 ? round2((payAgg.upi / totalSales) * 100) : 0 },
    { mode: 'Cash', id: 'cash', amount: round2(payAgg.cash), count: payCounts.cash, sharePct: totalSales > 0 ? round2((payAgg.cash / totalSales) * 100) : 0 },
    { mode: 'Card', id: 'card', amount: round2(payAgg.card), count: payCounts.card, sharePct: totalSales > 0 ? round2((payAgg.card / totalSales) * 100) : 0 },
  ];

  // 10. Staff / Cashier Sales
  const staffAgg = {};
  for (const b of completedBills) {
    const cid = b.cashier_id || 'unassigned';
    if (!staffAgg[cid]) {
      const u = userMap[cid];
      staffAgg[cid] = {
        cashierId: cid,
        name: u?.name || (cid === 'unassigned' ? 'Counter' : cid),
        role: u?.role || 'cashier',
        billsCount: 0,
        salesAmount: 0,
      };
    }
    staffAgg[cid].billsCount += 1;
    staffAgg[cid].salesAmount += Number(b.grand_total) || 0;
  }

  const staffSales = Object.values(staffAgg).map(s => ({
    ...s,
    salesAmount: round2(s.salesAmount),
    avgBill: s.billsCount > 0 ? round2(s.salesAmount / s.billsCount) : 0,
  })).sort((a, b) => b.salesAmount - a.salesAmount);

  // 11. Period Drill Table (Day-wise inside Week/Month, Month-wise inside Year)
  let periodBreakdown = [];
  if (period === 'week' || period === 'month' || period === 'custom') {
    const cur = new Date(startD);
    while (cur <= endD) {
      const dateStr = toDateStr(cur);
      const dayBills = completedBills.filter(b => (b.created_at || '').startsWith(dateStr));
      const s = round2(dayBills.reduce((acc, b) => acc + (Number(b.grand_total) || 0), 0));
      const tx = round2(dayBills.reduce((acc, b) => acc + (Number(b.cgst_total + b.sgst_total) || 0), 0));

      // Top category for this day
      const dayItems = [];
      dayBills.forEach(b => dayItems.push(...(billItemsByBillId[b.id] || [])));
      const dayCatCount = {};
      dayItems.forEach(bi => {
        const cat = catMap[bi.category_id]?.name || 'Bakery';
        dayCatCount[cat] = (dayCatCount[cat] || 0) + 1;
      });
      const topCat = Object.entries(dayCatCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

      periodBreakdown.push({
        key: dateStr,
        dateStr,
        label: formatDateIST(cur),
        sublabel: DAY_NAMES[cur.getDay()],
        billsCount: dayBills.length,
        salesAmount: s,
        taxAmount: tx,
        topCategory: topCat,
        drillType: 'day',
        drillParam: dateStr,
      });

      cur.setDate(cur.getDate() + 1);
    }
  } else if (period === 'year') {
    for (const b of chartData) {
      const monthBills = completedBills.filter(bill => (bill.created_at || '').startsWith(b.key));
      const tx = round2(monthBills.reduce((acc, bill) => acc + (Number(bill.cgst_total + bill.sgst_total) || 0), 0));

      periodBreakdown.push({
        key: b.key,
        dateStr: b.key,
        label: b.label,
        sublabel: b.key,
        billsCount: b.billsCount,
        salesAmount: b.sales,
        taxAmount: tx,
        drillType: 'month',
        drillParam: `${b.key}-01`,
      });
    }
  }

  // 12. Detailed Bills List with Line Items attached for drill-down
  const billsList = periodBills.map(b => {
    const bItems = billItemsByBillId[b.id] || [];
    const cashierName = userMap[b.cashier_id]?.name || 'Cashier';
    return {
      ...b,
      cashierName,
      items: bItems,
      itemsSummary: bItems.map(bi => `${bi.name || bi.item_name} ×${bi.weight_kg ? bi.weight_kg + 'kg' : bi.quantity}`).join(', '),
      grand_total: round2(Number(b.grand_total) || 0),
      discount_amount: round2(Number(b.discount_amount) || 0),
      subtotal: round2(Number(b.subtotal) || 0),
      cgst_total: round2(Number(b.cgst_total) || 0),
      sgst_total: round2(Number(b.sgst_total) || 0),
    };
  }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  // 13. Z-Report History for closed days
  const closedSessions = daySessions
    .filter(s => s.status === 'closed')
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return {
    period: {
      type: period,
      yearType,
      fromDate,
      toDate,
      label,
      prevFromDate,
      prevToDate,
      prevLabel,
    },
    summary: {
      grossSales,
      discountsGiven,
      cgstTotal,
      sgstTotal,
      taxTotal,
      totalSales,
      totalBills,
      itemsSold,
      avgBillValue,
      voidedBillsCount,
      voidedBillsAmount,
      formulaLine,
    },
    comparison,
    chartData,
    categoryBreakdown,
    topItems,
    weightVsPiece,
    paymentModes,
    staffSales,
    periodBreakdown,
    billsList,
    voidedBills,
    closedSessions,
    hasSales: completedBills.length > 0,
  };
}

/**
 * Export Period Report as a formatted CSV file
 */
export function exportReportToCSV(report) {
  if (!report) return;

  const lines = [];
  const addLine = (...cols) => lines.push(cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));

  // Header & Period Info
  addLine('BAKE & BREW POS — SALES REPORT');
  addLine('Period', report.period.label);
  addLine('Date Range', `${formatDateTime(report.period.fromDate)} to ${formatDateTime(report.period.toDate)}`);
  addLine('Generated At', formatDateTime(new Date().toISOString()));
  addLine();

  // Summary KPIs
  addLine('SUMMARY METRICS');
  addLine('Metric', 'Value', `vs ${report.comparison.prevLabel}`);
  addLine('Total Sales (Net)', formatINR(report.summary.totalSales), `${report.comparison.salesDiffPct >= 0 ? '+' : ''}${report.comparison.salesDiffPct}%`);
  addLine('Total Bills Issued', report.summary.totalBills, `${report.comparison.billsDiffPct >= 0 ? '+' : ''}${report.comparison.billsDiffPct}%`);
  addLine('Items Sold', report.summary.itemsSold, `${report.comparison.itemsDiffPct >= 0 ? '+' : ''}${report.comparison.itemsDiffPct}%`);
  addLine('Average Bill Value', formatINR(report.summary.avgBillValue), `${report.comparison.avgBillDiffPct >= 0 ? '+' : ''}${report.comparison.avgBillDiffPct}%`);
  addLine('Discounts Given', formatINR(report.summary.discountsGiven), `${report.comparison.discountsDiffPct >= 0 ? '+' : ''}${report.comparison.discountsDiffPct}%`);
  addLine('Voided Bills Count', report.summary.voidedBillsCount, '');
  addLine('Voided Bills Value', formatINR(report.summary.voidedBillsAmount), '');
  addLine('CGST Collected', formatINR(report.summary.cgstTotal), '');
  addLine('SGST Collected', formatINR(report.summary.sgstTotal), '');
  addLine('Total Tax Collected', formatINR(report.summary.taxTotal), '');
  addLine('Reconciliation', report.summary.formulaLine);
  addLine();

  // Category Breakdown
  addLine('CATEGORY BREAKDOWN');
  addLine('Category', 'Items Sold', 'Gross Sales', '% Share');
  report.categoryBreakdown.forEach(cat => {
    addLine(cat.name, cat.itemsCount, cat.grossSales, `${cat.sharePct}%`);
  });
  addLine();

  // Top 10 Selling Items
  addLine('TOP SELLING ITEMS');
  addLine('Item Name', 'Category', 'Quantity Sold', 'Revenue', '% Share');
  report.topItems.forEach(it => {
    const qtyStr = it.isWeight ? `${it.weightKg} kg` : `${it.quantity} pcs`;
    addLine(it.name, it.categoryName, qtyStr, it.revenue, `${it.sharePct}%`);
  });
  addLine();

  // Transaction Ledger
  addLine('BILLS TRANSACTION LEDGER');
  addLine('Bill Number', 'Date & Time', 'Cashier', 'Status', 'Items', 'Subtotal', 'Discount', 'CGST', 'SGST', 'Grand Total', 'Void Reason');
  report.billsList.forEach(b => {
    addLine(
      b.bill_number,
      formatDateTime(b.created_at),
      b.cashierName,
      b.status,
      b.itemsSummary,
      b.subtotal,
      b.discount_amount,
      b.cgst_total,
      b.sgst_total,
      b.grand_total,
      b.void_reason || ''
    );
  });

  const csvContent = '\uFEFF' + lines.join('\n'); // UTF-8 BOM
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = `sales_report_${report.period.type}_${report.period.label.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Print Report in 80mm Thermal Receipt (for Day Z-Report) or A4 Format (for Week/Month/Year)
 */
export function printReportWindow(report, outletConfig = {}) {
  const isSingleDay = report.period.type === 'today' || report.period.type === 'yesterday';
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;

  const shopName = outletConfig.shop_name || 'Bake & Brew';
  const shopAddress = outletConfig.shop_address || '42, MG Road, Pune';
  const gstin = outletConfig.gstin || '27AABCU9603R1ZM';

  if (isSingleDay) {
    // 80mm Thermal Z-Report Format
    const catRows = report.categoryBreakdown.map(c =>
      `<tr><td>${c.name}</td><td style="text-align:right">${c.itemsCount}</td><td style="text-align:right">${formatINR(c.grossSales)}</td></tr>`
    ).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Z-Report - ${report.period.label}</title><style>
      @page { size: 80mm auto; margin: 2mm; }
      body { font-family: 'Courier New', monospace; font-size: 9pt; width: 76mm; margin: 0 auto; padding: 2mm; color: #000; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .bold { font-weight: bold; }
      h1 { font-size: 13pt; margin: 2px 0; }
      h2 { font-size: 11pt; margin: 4px 0 2px 0; }
      hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
      td, th { padding: 1.5px 0; }
      .kpi-row td { padding: 2px 0; font-size: 9pt; }
      .total-row { font-size: 11pt; font-weight: bold; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    </style></head><body>
      <div class="text-center">
        <h1>${shopName}</h1>
        <div>${shopAddress}</div>
        <div>GSTIN: ${gstin}</div>
        <hr>
        <h2>DAILY Z-REPORT</h2>
        <div class="bold">${report.period.label}</div>
        <div style="font-size:7.5pt">Printed: ${formatDateTime(new Date().toISOString())}</div>
      </div>
      <hr>
      <table>
        <tr class="kpi-row"><td>Total Bills:</td><td class="text-right bold">${report.summary.totalBills}</td></tr>
        <tr class="kpi-row"><td>Items Sold:</td><td class="text-right">${report.summary.itemsSold}</td></tr>
        <tr class="kpi-row"><td>Gross Sales:</td><td class="text-right">${formatINR(report.summary.grossSales)}</td></tr>
        <tr class="kpi-row"><td>Discounts:</td><td class="text-right">-${formatINR(report.summary.discountsGiven)}</td></tr>
        <tr class="kpi-row"><td>CGST Tax:</td><td class="text-right">${formatINR(report.summary.cgstTotal)}</td></tr>
        <tr class="kpi-row"><td>SGST Tax:</td><td class="text-right">${formatINR(report.summary.sgstTotal)}</td></tr>
        <tr class="kpi-row total-row"><td>NET TOTAL SALES:</td><td class="text-right">${formatINR(report.summary.totalSales)}</td></tr>
        ${report.summary.voidedBillsCount > 0 ? `<tr class="kpi-row" style="color:#666"><td>Voided Bills (${report.summary.voidedBillsCount}):</td><td class="text-right">${formatINR(report.summary.voidedBillsAmount)}</td></tr>` : ''}
      </table>
      <hr>
      <div class="bold text-center" style="font-size:8.5pt;margin-bottom:2px">CATEGORY BREAKDOWN</div>
      <table>
        <tr><th style="text-align:left">Category</th><th style="text-align:right">Qty</th><th style="text-align:right">Sales</th></tr>
        ${catRows}
      </table>
      <hr>
      <div class="text-center" style="font-size:7.5pt">
        <div>${report.summary.formulaLine}</div>
        <div style="margin-top:4px">*** END OF Z-REPORT ***</div>
      </div>
    </body></html>`);
  } else {
    // A4 Executive Format for Week / Month / Year
    const catRows = report.categoryBreakdown.map(c =>
      `<tr><td>${c.name}</td><td style="text-align:right">${c.itemsCount}</td><td style="text-align:right">${formatINR(c.grossSales)}</td><td style="text-align:right">${c.sharePct}%</td></tr>`
    ).join('');

    const topItemRows = report.topItems.map((it, idx) =>
      `<tr><td>${idx + 1}. ${it.name}</td><td>${it.categoryName}</td><td style="text-align:right">${it.isWeight ? it.weightKg + ' kg' : it.quantity + ' pcs'}</td><td style="text-align:right">${formatINR(it.revenue)}</td><td style="text-align:right">${it.sharePct}%</td></tr>`
    ).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Sales Report - ${report.period.label}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1a1a1a; padding: 10px; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #116D6E; padding-bottom: 10px; margin-bottom: 16px; }
      h1 { margin: 0; color: #2B1810; font-size: 20pt; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
      .kpi-card { background: #fdfbf7; border: 1px solid #e0d8cc; padding: 10px 12px; border-radius: 6px; }
      .kpi-label { font-size: 8pt; color: #736357; text-transform: uppercase; letter-spacing: 0.5px; }
      .kpi-value { font-size: 15pt; font-weight: bold; color: #116D6E; margin-top: 2px; }
      .formula-box { background: #eef6f6; border: 1px solid #c2e2e3; padding: 8px 12px; border-radius: 6px; font-size: 9pt; color: #0c4e4f; margin-bottom: 20px; font-weight: 500; }
      table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 18px; }
      th, td { border: 1px solid #e6dfd5; padding: 6px 8px; }
      th { background: #f7f3ec; font-weight: 600; text-align: left; }
      .section-title { font-size: 12pt; font-weight: bold; color: #2B1810; margin: 16px 0 8px 0; }
    </style></head><body>
      <div class="header">
        <div>
          <h1>${shopName}</h1>
          <div style="font-size:9pt;color:#666">${shopAddress} · GSTIN: ${gstin}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12pt;font-weight:bold;color:#116D6E">PERIOD SALES REPORT</div>
          <div style="font-size:10pt;font-weight:600">${report.period.label}</div>
          <div style="font-size:8pt;color:#888">Generated: ${formatDateTime(new Date().toISOString())}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Total Sales</div><div class="kpi-value">${formatINR(report.summary.totalSales)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Bills Issued</div><div class="kpi-value">${report.summary.totalBills}</div></div>
        <div class="kpi-card"><div class="kpi-label">Items Sold</div><div class="kpi-value">${report.summary.itemsSold}</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg Bill Value</div><div class="kpi-value">${formatINR(report.summary.avgBillValue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Discounts Given</div><div class="kpi-value">${formatINR(report.summary.discountsGiven)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Tax (CGST+SGST)</div><div class="kpi-value">${formatINR(report.summary.taxTotal)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Weight Items Sales</div><div class="kpi-value">${formatINR(report.weightVsPiece.weight.revenue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Piece Items Sales</div><div class="kpi-value">${formatINR(report.weightVsPiece.piece.revenue)}</div></div>
      </div>

      <div class="formula-box">${report.summary.formulaLine}</div>

      <div class="section-title">Category Performance Breakdown</div>
      <table>
        <tr><th>Category</th><th style="text-align:right">Items Sold</th><th style="text-align:right">Gross Revenue</th><th style="text-align:right">% Share</th></tr>
        ${catRows}
      </table>

      <div class="section-title">Top 10 Bestselling Products</div>
      <table>
        <tr><th>Product</th><th>Category</th><th style="text-align:right">Quantity</th><th style="text-align:right">Revenue</th><th style="text-align:right">% Share</th></tr>
        ${topItemRows}
      </table>
    </body></html>`);
  }

  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}
