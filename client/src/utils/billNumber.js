/**
 * Generate a bill number: {prefix}-{YYYYMMDD}-{seq}
 * @param {string} prefix - Outlet prefix (e.g., 'BB')
 * @param {number} seq - Sequence number for the day
 * @returns {string} Formatted bill number
 */
export function generateBillNumber(prefix, seq) {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  return `${prefix}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

/**
 * Get today's date string in YYYY-MM-DD format.
 */
export function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * Format a date string for display.
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/**
 * Format time only.
 */
export function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
