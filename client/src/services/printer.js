import db from '../db/dexie.js';
import { v4 as uuidv4 } from 'uuid';
import { formatINR, round2 } from '../utils/tax.js';
import { formatDateTime } from '../utils/billNumber.js';

/**
 * Printer service — ESC/POS via WebUSB/WebSerial with CSS print fallback.
 * Print failures queue to IndexedDB for retry.
 */

// ESC/POS commands
const ESC = 0x1B;
const GS = 0x1D;
const COMMANDS = {
  INIT: [ESC, 0x40],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  NORMAL_SIZE: [ESC, 0x21, 0x00],
  CUT: [GS, 0x56, 0x00],
  FEED_3: [ESC, 0x64, 0x03],
  LINE: [0x0A],
};

let usbDevice = null;

/**
 * Try to connect to a USB thermal printer.
 */
async function connectUSBPrinter() {
  try {
    if (usbDevice) return usbDevice;
    const device = await navigator.usb.requestDevice({
      filters: [{ classCode: 7 }], // Printer class
    });
    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);
    usbDevice = device;
    return device;
  } catch (err) {
    console.warn('[Printer] USB connection failed:', err);
    return null;
  }
}

/**
 * Send raw bytes to USB printer.
 */
async function sendToUSB(data) {
  if (!usbDevice) return false;
  try {
    const endpoint = usbDevice.configuration.interfaces[0]
      .alternate.endpoints.find(e => e.direction === 'out');
    if (!endpoint) return false;
    await usbDevice.transferOut(endpoint.endpointNumber, new Uint8Array(data));
    return true;
  } catch (err) {
    console.error('[Printer] USB send failed:', err);
    usbDevice = null;
    return false;
  }
}

/**
 * Convert string to byte array.
 */
function textToBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

/**
 * Build a 58mm receipt line (32 chars wide).
 */
function padLine(left, right, width = 32) {
  const rightStr = String(right);
  const leftStr = String(left);
  const space = width - leftStr.length - rightStr.length;
  return leftStr + ' '.repeat(Math.max(1, space)) + rightStr;
}

function dashedLine(width = 32) {
  return '-'.repeat(width);
}

/**
 * Generate ESC/POS bytes for a bill receipt.
 */
async function buildReceiptBytes(bill, items) {
  const config = {};
  const configEntries = await db.outlet_config.toArray();
  configEntries.forEach(c => { config[c.key] = c.value; });

  const bytes = [];
  const add = (...args) => args.forEach(a => bytes.push(...(Array.isArray(a) ? a : textToBytes(a))));

  // Init
  add(COMMANDS.INIT);

  // Header
  add(COMMANDS.ALIGN_CENTER);
  add(COMMANDS.BOLD_ON, COMMANDS.DOUBLE_HEIGHT);
  add(config.shop_name || 'Bake & Brew', COMMANDS.LINE);
  add(COMMANDS.NORMAL_SIZE, COMMANDS.BOLD_OFF);
  add(config.shop_address || '', COMMANDS.LINE);
  if (config.shop_phone) add('Ph: ' + config.shop_phone, COMMANDS.LINE);
  if (config.gstin) add('GSTIN: ' + config.gstin, COMMANDS.LINE);
  if (config.fssai) add('FSSAI: ' + config.fssai, COMMANDS.LINE);
  add(dashedLine(), COMMANDS.LINE);

  // Bill info
  add(COMMANDS.ALIGN_LEFT);
  add(padLine('Bill: ' + bill.bill_number, formatDateTime(bill.created_at)), COMMANDS.LINE);
  add(dashedLine(), COMMANDS.LINE);

  // Column headers
  add(COMMANDS.BOLD_ON);
  add(padLine('Item', 'Amount'), COMMANDS.LINE);
  add(COMMANDS.BOLD_OFF);
  add(dashedLine(), COMMANDS.LINE);

  // Items
  for (const item of items) {
    const name = item.item_name || 'Item';
    let qtyStr;
    if (item.weight_kg) {
      qtyStr = `${item.weight_kg}kg x ${formatINR(item.price)}`;
    } else if (item.quantity > 1) {
      qtyStr = `${item.quantity} x ${formatINR(item.price)}`;
    } else {
      qtyStr = '';
    }

    add(padLine(name, formatINR(item.line_total)), COMMANDS.LINE);
    if (qtyStr) {
      add('  ' + qtyStr, COMMANDS.LINE);
    }
    if (item.discount_amount > 0) {
      add(padLine('  Disc', '-' + formatINR(item.discount_amount)), COMMANDS.LINE);
    }
    if (item.token_number) {
      add('  Token: T' + item.token_number, COMMANDS.LINE);
    }
  }

  add(dashedLine(), COMMANDS.LINE);

  // Totals
  add(padLine('Subtotal', formatINR(bill.subtotal)), COMMANDS.LINE);
  if (bill.discount_amount > 0) {
    add(padLine('Discount', '-' + formatINR(bill.discount_amount)), COMMANDS.LINE);
  }
  if (bill.cgst_total > 0) {
    add(padLine('CGST', formatINR(bill.cgst_total)), COMMANDS.LINE);
    add(padLine('SGST', formatINR(bill.sgst_total)), COMMANDS.LINE);
  }
  add(dashedLine(), COMMANDS.LINE);
  add(COMMANDS.BOLD_ON, COMMANDS.DOUBLE_HEIGHT);
  add(COMMANDS.ALIGN_RIGHT);
  add(padLine('TOTAL', formatINR(bill.grand_total)), COMMANDS.LINE);
  add(COMMANDS.NORMAL_SIZE, COMMANDS.BOLD_OFF);

  add(COMMANDS.ALIGN_CENTER);
  add(dashedLine(), COMMANDS.LINE);

  // Tax summary
  const taxGroups = {};
  items.forEach(item => {
    if (item.tax_rate_pct > 0) {
      const key = item.tax_rate_pct;
      if (!taxGroups[key]) taxGroups[key] = { cgst: 0, sgst: 0 };
      taxGroups[key].cgst += item.cgst;
      taxGroups[key].sgst += item.sgst;
    }
  });
  if (Object.keys(taxGroups).length > 0) {
    add('Tax Summary', COMMANDS.LINE);
    Object.entries(taxGroups).forEach(([rate, tax]) => {
      add(padLine(`GST ${rate}%`, `C:${formatINR(round2(tax.cgst))} S:${formatINR(round2(tax.sgst))}`), COMMANDS.LINE);
    });
    add(dashedLine(), COMMANDS.LINE);
  }

  // Footer
  add(COMMANDS.ALIGN_CENTER);
  add(config.footer_message || 'Thank you!', COMMANDS.LINE);
  add(COMMANDS.FEED_3, COMMANDS.CUT);

  return bytes;
}

/**
 * Print bill — tries USB first, falls back to browser print.
 */
export async function printBill(bill, items) {
  // Queue to print_queue first (crash safety)
  const queueId = uuidv4();
  await db.print_queue.add({
    id: queueId,
    bill_id: bill.id,
    print_type: 'receipt',
    payload: JSON.stringify({ bill, items }),
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
    printed_at: null,
  });

  try {
    // Try USB printer
    if (usbDevice || navigator.usb) {
      const bytes = await buildReceiptBytes(bill, items);
      const success = await sendToUSB(bytes);
      if (success) {
        await db.print_queue.update(queueId, { status: 'printed', printed_at: new Date().toISOString() });
        return true;
      }
    }

    // Fallback: browser print with CSS
    browserPrintReceipt(bill, items);
    await db.print_queue.update(queueId, { status: 'printed', printed_at: new Date().toISOString() });
    return true;
  } catch (err) {
    console.error('[Printer] Print failed:', err);
    await db.print_queue.update(queueId, {
      status: 'failed',
      retry_count: 1,
    });
    throw err;
  }
}

/**
 * Print kitchen token — separate slip for made-to-order items.
 */
export async function printKitchenToken(mtoItems, billNumber) {
  // Queue first
  const queueId = uuidv4();
  await db.print_queue.add({
    id: queueId,
    bill_id: null,
    print_type: 'kitchen_token',
    payload: JSON.stringify({ items: mtoItems, billNumber }),
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
    printed_at: null,
  });

  try {
    if (usbDevice) {
      const bytes = [];
      const add = (...args) => args.forEach(a => bytes.push(...(Array.isArray(a) ? a : textToBytes(a))));

      add(COMMANDS.INIT, COMMANDS.ALIGN_CENTER);
      add(COMMANDS.BOLD_ON, COMMANDS.DOUBLE_HEIGHT);
      add('KITCHEN ORDER', COMMANDS.LINE);
      add(COMMANDS.NORMAL_SIZE, COMMANDS.BOLD_OFF);
      add('Bill: ' + billNumber, COMMANDS.LINE);
      add(dashedLine(), COMMANDS.LINE);

      for (const item of mtoItems) {
        add(COMMANDS.BOLD_ON, COMMANDS.DOUBLE_HEIGHT);
        add('T' + item.token_number, COMMANDS.LINE);
        add(COMMANDS.NORMAL_SIZE, COMMANDS.BOLD_OFF);
        add((item.item_name || 'Item') + ' x' + item.quantity, COMMANDS.LINE);
        add(COMMANDS.LINE);
      }

      add(COMMANDS.FEED_3, COMMANDS.CUT);

      const success = await sendToUSB(bytes);
      if (success) {
        await db.print_queue.update(queueId, { status: 'printed', printed_at: new Date().toISOString() });
        return;
      }
    }

    // Fallback: browser print
    browserPrintKitchenToken(mtoItems, billNumber);
    await db.print_queue.update(queueId, { status: 'printed', printed_at: new Date().toISOString() });
  } catch (err) {
    console.error('[Printer] Kitchen token print failed:', err);
    await db.print_queue.update(queueId, { status: 'failed', retry_count: 1 });
  }
}

/**
 * Browser print fallback — opens a print dialog with formatted receipt.
 */
function browserPrintReceipt(bill, items) {
  const win = window.open('', '_blank', 'width=320,height=600');
  if (!win) return;

  let taxRows = '';
  const taxGroups = {};
  items.forEach(item => {
    if (item.tax_rate_pct > 0) {
      const key = item.tax_rate_pct;
      if (!taxGroups[key]) taxGroups[key] = { cgst: 0, sgst: 0 };
      taxGroups[key].cgst += item.cgst;
      taxGroups[key].sgst += item.sgst;
    }
  });
  Object.entries(taxGroups).forEach(([rate, tax]) => {
    taxRows += `<tr><td>GST ${rate}%</td><td class="text-right">C:${formatINR(round2(tax.cgst))} S:${formatINR(round2(tax.sgst))}</td></tr>`;
  });

  const itemRows = items.map(item => {
    let qty = '';
    if (item.weight_kg) qty = `${item.weight_kg}kg × ${formatINR(item.price)}`;
    else if (item.quantity > 1) qty = `${item.quantity} × ${formatINR(item.price)}`;
    let disc = item.discount_amount > 0 ? `<br><small>Disc: -${formatINR(item.discount_amount)}</small>` : '';
    let token = item.token_number ? `<br><small><strong>Token: T${item.token_number}</strong></small>` : '';
    return `<tr><td>${item.item_name}${qty ? '<br><small>' + qty + '</small>' : ''}${disc}${token}</td><td class="text-right">${formatINR(item.line_total)}</td></tr>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 10pt; width: 58mm; padding: 2mm; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    h1 { font-size: 14pt; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; font-size: 9pt; }
    hr { border: none; border-top: 1px dashed #000; margin: 3px 0; }
    .total { font-size: 14pt; font-weight: bold; }
    small { font-size: 8pt; color: #666; }
  </style></head><body>
    <div class="text-center">
      <h1>Bake & Brew</h1>
      <p style="font-size:8pt">${bill.bill_number}<br>${formatDateTime(bill.created_at)}</p>
    </div>
    <hr>
    <table>${itemRows}</table>
    <hr>
    <table>
      <tr><td>Subtotal</td><td class="text-right">${formatINR(bill.subtotal)}</td></tr>
      ${bill.discount_amount > 0 ? `<tr><td>Discount</td><td class="text-right">-${formatINR(bill.discount_amount)}</td></tr>` : ''}
      ${bill.cgst_total > 0 ? `<tr><td>CGST</td><td class="text-right">${formatINR(bill.cgst_total)}</td></tr><tr><td>SGST</td><td class="text-right">${formatINR(bill.sgst_total)}</td></tr>` : ''}
    </table>
    <hr>
    <table><tr><td class="total">TOTAL</td><td class="text-right total">${formatINR(bill.grand_total)}</td></tr></table>
    ${taxRows ? '<hr><div class="text-center" style="font-size:8pt">Tax Summary</div><table>' + taxRows + '</table>' : ''}
    <hr>
    <p class="text-center" style="font-size:8pt;margin-top:4px">Thank you! Visit again.</p>
  </body></html>`);

  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 300);
}

function browserPrintKitchenToken(mtoItems, billNumber) {
  const win = window.open('', '_blank', 'width=320,height=400');
  if (!win) return;

  const rows = mtoItems.map(item =>
    `<div style="margin:8px 0;text-align:center">
      <div style="font-size:24pt;font-weight:bold">T${item.token_number}</div>
      <div>${item.item_name} ×${item.quantity}</div>
    </div>`
  ).join('');

  win.document.write(`<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; } body { font-family: 'Courier New', monospace; width: 58mm; padding: 2mm; text-align: center; }
    h2 { font-size: 14pt; margin-bottom: 4px; } hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  </style></head><body>
    <h2>KITCHEN ORDER</h2>
    <p style="font-size:9pt">Bill: ${billNumber}</p>
    <hr>${rows}<hr>
  </body></html>`);

  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 300);
}

/**
 * Request USB printer connection (called from settings or first print).
 */
export async function requestPrinterConnection() {
  return connectUSBPrinter();
}

/**
 * Retry failed print jobs from the queue.
 */
export async function retryFailedPrints() {
  const failed = await db.print_queue.where('status').equals('failed').toArray();
  for (const job of failed) {
    try {
      const payload = JSON.parse(job.payload);
      if (job.print_type === 'receipt') {
        await printBill(payload.bill, payload.items);
      } else if (job.print_type === 'kitchen_token') {
        await printKitchenToken(payload.items, payload.billNumber);
      }
      await db.print_queue.update(job.id, { status: 'printed', printed_at: new Date().toISOString() });
    } catch (err) {
      await db.print_queue.update(job.id, { retry_count: job.retry_count + 1 });
    }
  }
}
