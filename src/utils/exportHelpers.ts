import { jsPDF } from 'jspdf';
import type { Invoice } from '../types/autocare';

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDateTime(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return '—';
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function toISOStringSafe(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  return '';
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadInvoicePDF(invoice: Invoice): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Navy Header Band
  doc.setFillColor(11, 19, 43);
  doc.rect(0, 0, 595, 110, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('AutoCare Garage', 40, 45);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Your Vehicle, Our Responsibility.', 40, 64);
  doc.text(invoice.garageName || 'AutoCare Garage Branch', 40, 82);
  if (invoice.garageAddress) {
    doc.text(invoice.garageAddress.slice(0, 75), 40, 96);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TAX INVOICE', 430, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, 430, 68);
  doc.text(`Date: ${formatDateTime(invoice.createdAt)}`, 430, 84);
  doc.text(`Status: ${invoice.paymentStatus}`, 430, 100);

  // Customer & Vehicle Details
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BILL TO', 40, 145);
  doc.text('VEHICLE & BOOKING', 320, 145);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(invoice.customerName, 40, 163);
  doc.text(`Phone: ${invoice.customerPhone || 'N/A'}`, 40, 179);
  doc.text(`Garage ID: ${invoice.garageId}`, 40, 195);

  doc.text(`Vehicle: ${invoice.vehicleSummary}`, 320, 163);
  doc.text(`Booking Ref: ${invoice.bookingId}`, 320, 179);
  if (invoice.jobCardId) {
    doc.text(`Job Card Ref: ${invoice.jobCardId}`, 320, 195);
  }

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(40, 230, 515, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 50, 247);
  doc.text('Amount (INR)', 470, 247);

  // Line Items
  doc.setFont('helvetica', 'normal');
  let y = 278;
  doc.text(`Service Scope: ${invoice.serviceDescription.slice(0, 68)}`, 50, y);
  y += 26;

  const lines: Array<[string, number]> = [
    ['Labour & Service Charges', invoice.labourCharges],
    ['Spare Parts & Consumables', invoice.partsCharges],
    ['Discount Applied', -invoice.discount],
    [`GST / Applicable Tax (${invoice.taxRate}%)`, invoice.taxAmount],
  ];

  lines.forEach(([label, val]) => {
    doc.text(label, 50, y);
    doc.text(`INR ${val.toLocaleString('en-IN')}`, 470, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(40, y + 8, 555, y + 8);
    y += 28;
  });

  // Totals
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Final Total', 350, y);
  doc.text(`INR ${invoice.finalTotal.toLocaleString('en-IN')}`, 470, y);

  y += 22;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Amount Paid (Verified)', 350, y);
  doc.text(`INR ${invoice.paidAmount.toLocaleString('en-IN')}`, 470, y);

  y += 18;
  const balance = Math.max(0, invoice.finalTotal - invoice.paidAmount);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(balance > 0 ? 220 : 22, balance > 0 ? 38 : 163, balance > 0 ? 38 : 74);
  doc.text('Balance Due', 350, y);
  doc.text(`INR ${balance.toLocaleString('en-IN')}`, 470, y);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This is a computer-generated invoice from AutoCare Garage Multi-Location Platform.', 40, 780);

  doc.save(`${invoice.invoiceNumber || 'AutoCare-Invoice'}.pdf`);
}
