import PDFDocument from "pdfkit";
import type { Response } from "express";
import { money, numberValue } from "./format";

const LEFT = 42;
const RIGHT = 553;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_Y = 790;
const CONTENT_BOTTOM = 790;
const SIGNATURE_RESERVE = 106;
const SIGNATURE_GAP = 14;
const CONTINUATION_CONTENT_TOP = 88;
const INVOICE_SLOTS = {
  customerY: 172,
  departureY: 221,
  tableY: 258,
  tableRowHeight: 30,
  pageOneRows: 2,
  continuationTableY: 110,
  continuationRows: 15,
  includeY: 344,
  includeHeight: 42,
  summaryY: 360,
  paymentY: 480,
  bankY: 540,
  notesY: 580,
  notesHeight: 95,
  signatureY: 684,
} as const;
const DEFAULT_PDF_NOTES = `* Pelunasan dilakukan 40 hari sebelum tanggal keberangkatan.
* Deposit yang sudah kami terima akan hangus dan dianggap tidak melanjutkan blockseat/paket umroh lagi apabila pelunasan tidak sesuai ketentuan diatas dan seat direlease kembali.
* Kami tidak bertanggung jawab atas ter-CANCEL nya Group Booking yang terjadi dikarenakan keterlambatan pembayaran yang tidak sesuai dengan jatuh tempo/timelimit yang sudah ditentukan tersebut.
* Perubahan nama hanya bisa dilakukan sebelum issued sebanyak 10% dari total penumpang masing2 group.
* Data manifest wajib dilengkapi : Nama, Gender, Tgl Lahir, No.Paspor, Exp. Paspor, Issue Paspor.
* Manifest penumpang tersebut dikirimkan 10 hari sebelum keberangkatan/setelah pelunasan.`;

type PdfCompany = {
  companyName: string;
  brandName: string;
  address: string;
  whatsapp: string;
  email: string;
  website: string;
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
  adminName: string;
  adminTitle: string;
  includeText: string;
  invoiceTitle: string;
  receiptTitle: string;
  footer: string;
  notes: string;
  pdfNotes: string;
};

type PdfInvoice = {
  number: string;
  invoiceDate: string;
  dueDate: string;
  reference?: string | null;
  customerName: string;
  customerType: string;
  customerAddress?: string | null;
  notes?: string | null;
  includeText?: string | null;
  items: Array<{ description: string; flight?: string | null; details?: string | null; itemDate?: string | null; quantity?: string | null; price?: string | null; amount: string }>;
  payments: Array<{ paymentDate: string; description: string; amount: string; bank?: string | null; method: string }>;
  subtotal: number;
  discount: number;
  additionalCost: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  group?: { name: string; departureDate: string; packageName: string } | null;
};

type PdfReceipt = {
  number: string;
  receiptDate: string;
  receivedFrom: string;
  amount: string;
  words: string;
  purpose: string;
  invoiceNumber: string;
  method: string;
  bank?: string | null;
  notes?: string | null;
  includeText?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  cashback: number;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  departureDate?: string | null;
  groupName?: string | null;
};

function imageBuffer(dataUrl?: string | null): Buffer | null {
  if (!dataUrl?.startsWith("data:image/")) return null;
  const encoded = dataUrl.split(",")[1];
  if (!encoded) return null;
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return null;
  }
}

function addImage(doc: PDFKit.PDFDocument, dataUrl: string | null | undefined, x: number, y: number, fit: [number, number], opacity = 1): boolean {
  const image = imageBuffer(dataUrl);
  if (!image) return false;
  try {
    doc.save();
    doc.opacity(opacity);
    doc.image(image, x, y, { fit });
    doc.restore();
    return true;
  } catch {
    return false;
  }
}

function addLogo(doc: PDFKit.PDFDocument, company: PdfCompany, x: number, y: number, fit: [number, number] = [138, 48]): void {
  if (!addImage(doc, company.logoDataUrl, x, y, fit)) {
    doc.fontSize(22).fillColor("#0f5a78").font("Helvetica-Bold").text(company.brandName, x, y + 8);
  }
}

function line(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor("#d5dde2").lineWidth(0.8).stroke();
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 150): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text(label, x, y, { width });
  doc.font("Helvetica").fillColor("#1c2a32").text(value || "-", x, y + 12, { width });
}

function displayQty(value?: string | null): string {
  if (value == null || value === "") return "-";
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : "-";
}

function nonEmpty(value?: string | null): string {
  return value?.trim() ?? "";
}

function noteText(company: PdfCompany, custom?: string | null): string {
  return [nonEmpty(company.pdfNotes) || DEFAULT_PDF_NOTES, nonEmpty(custom)].filter(Boolean).join("\n\n");
}

function drawBrandHeader(doc: PDFKit.PDFDocument, company: PdfCompany, title: string, continuation = false, documentNumber = ""): void {
  if (continuation) {
    addLogo(doc, company, LEFT, 24, [82, 28]);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#16394b").text(title, 350, 27, { width: 203, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#52616a").text(`${documentNumber}  •  Lanjutan`, 320, 48, { width: 233, align: "right" });
    line(doc, 55);
    doc.font("Helvetica").fontSize(7).fillColor("#6b7d86").text("DOKUMEN NUFATUR", LEFT, 62);
    return;
  }
  addLogo(doc, company, LEFT, 24, [120, 42]);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#52616a").text(company.companyName, LEFT, 70, { width: 270 });
  doc.font("Helvetica").fontSize(7.5).text(company.address, LEFT, 82, { width: 270, height: 36, lineGap: 1.5 });
  doc.text(`WhatsApp: ${company.whatsapp}`, LEFT, 123, { width: 270 });
  doc.text(company.email, LEFT, 134, { width: 270 });
  doc.text(company.website, LEFT, 145, { width: 270 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#16394b").text(title, 350, 30, { width: 203, align: "right" });
}

function drawInvoiceTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const tableX = [42, 250, 326, 382, 448, 553];
  doc.rect(LEFT, y, CONTENT_WIDTH, 22).fill("#e7f0f4");
  ["DESCRIPTION", "FARE / PRICE", "QTY", "DATE", "TOTAL"].forEach((header, index) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text(header, tableX[index] + 5, y + 7, {
      width: tableX[index + 1] - tableX[index] - 10,
      align: index === 4 ? "right" : "left",
    });
  });
  return y + 22;
}

function drawInvoiceItemRow(doc: PDFKit.PDFDocument, item: PdfInvoice["items"][number], y: number, height = INVOICE_SLOTS.tableRowHeight): void {
  const description = [item.description, item.flight, item.details].filter(Boolean).join("\n");
  const tableX = [42, 250, 326, 382, 448, 553];
  doc.rect(LEFT, y, CONTENT_WIDTH, height).strokeColor("#cad6dc").stroke();
  for (let index = 1; index < tableX.length - 1; index += 1) doc.moveTo(tableX[index], y).lineTo(tableX[index], y + height).strokeColor("#cad6dc").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(description || "-", 48, y + 6, { width: 196, height: height - 8, lineGap: 1, ellipsis: true });
  doc.text(item.price ? money(item.price) : "-", 255, y + 6, { width: 66, align: "right" });
  doc.text(displayQty(item.quantity), 331, y + 6, { width: 46, align: "center" });
  doc.text(item.itemDate ?? "-", 387, y + 6, { width: 56, align: "center" });
  doc.font("Helvetica-Bold").text(money(item.amount), 453, y + 6, { width: 94, align: "right" });
}

function drawEmptyInvoiceRow(doc: PDFKit.PDFDocument, y: number): void {
  drawInvoiceItemRow(doc, { description: "", amount: "0" }, y);
}

function drawFixedInclude(doc: PDFKit.PDFDocument, text: string, y: number, height: number = INVOICE_SLOTS.includeHeight): void {
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 4).fill("#f4f8f9");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#244b5e").text("INCLUDE", LEFT + 9, y + 7);
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(text || "-", LEFT + 76, y + 7, { width: 415, height: height - 12, lineGap: 1 });
}

function drawFixedPaymentSlot(doc: PDFKit.PDFDocument, payments: PdfInvoice["payments"]): void {
  const y = INVOICE_SLOTS.paymentY;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("PAYMENT HISTORY", LEFT, y);
  doc.rect(LEFT, y + 13, CONTENT_WIDTH, 35).strokeColor("#cad6dc").stroke();
  if (payments.length === 0) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#52616a").text("Belum ada pembayaran", LEFT + 7, y + 26);
    return;
  }
  payments.slice(0, 2).forEach((payment, index) => {
    const rowY = y + 20 + index * 15;
    doc.font("Helvetica").fontSize(7.5).fillColor("#1c2a32").text(payment.description, LEFT + 7, rowY, { width: 205, ellipsis: true });
    doc.text(payment.paymentDate, 300, rowY, { width: 70 });
    doc.text(payment.bank ?? payment.method, 380, rowY, { width: 70, ellipsis: true });
    doc.font("Helvetica-Bold").text(money(payment.amount), 453, rowY, { width: 94, align: "right" });
  });
}

function drawPaymentContinuation(doc: PDFKit.PDFDocument, payments: PdfInvoice["payments"]): void {
  if (payments.length < 2) return;
  const y = 400;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("PAYMENT HISTORY (LANJUTAN)", LEFT, y);
  payments.slice(1, 4).forEach((payment, index) => {
    const rowY = y + 13 + index * 19;
    doc.rect(LEFT, rowY, CONTENT_WIDTH, 19).strokeColor("#cad6dc").stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor("#1c2a32").text(payment.description, 48, rowY + 5, { width: 205, height: 12, ellipsis: true });
    doc.text(payment.paymentDate, 300, rowY + 5, { width: 70 });
    doc.text(payment.bank ?? payment.method, 380, rowY + 5, { width: 70, height: 12, ellipsis: true });
    doc.font("Helvetica-Bold").text(money(payment.amount), 453, rowY + 5, { width: 94, align: "right" });
  });
}

function drawFixedBank(doc: PDFKit.PDFDocument, company: PdfCompany): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("BANK NUFATUR", LEFT, INVOICE_SLOTS.bankY);
  doc.font("Helvetica").fontSize(7.5).fillColor("#1c2a32").text(company.notes || "-", LEFT, INVOICE_SLOTS.bankY + 15, { width: CONTENT_WIDTH, height: 22, lineGap: 1, ellipsis: true });
}

function drawFixedNotes(doc: PDFKit.PDFDocument, text: string, y: number = INVOICE_SLOTS.notesY, height: number = INVOICE_SLOTS.notesHeight, title = "CATATAN / PERHATIAN"): void {
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 4).fill("#fff4bf");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#674f00").text(title, LEFT + 9, y + 7);
  doc.font("Helvetica").fontSize(6.4).fillColor("#3d3520").text(text || "-", LEFT + 9, y + 17, { width: CONTENT_WIDTH - 18, height: height - 20, lineGap: 0 });
}

function newInvoicePage(doc: PDFKit.PDFDocument, company: PdfCompany, documentNumber: string): number {
  doc.addPage();
  drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE", true, documentNumber);
  return CONTINUATION_CONTENT_TOP;
}

function drawInclude(doc: PDFKit.PDFDocument, includeText: string, y: number): number {
  const height = Math.max(29, doc.heightOfString(includeText, { width: 415, lineGap: 1 }) + 18);
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 4).fill("#f4f8f9");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#244b5e").text("INCLUDE", LEFT + 9, y + 7);
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(includeText, LEFT + 76, y + 7, { width: 415, lineGap: 1 });
  return y + height + 8;
}

function drawSummary(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number): number {
  rows.forEach(([label, value]) => {
    const emphasis = label === "TOTAL INVOICE" || label === "SISA PEMBAYARAN" || label === "STATUS";
    doc.font("Helvetica-Bold").fontSize(emphasis ? 8.5 : 8).fillColor("#244b5e").text(label, 330, y + 4);
    doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fillColor(emphasis ? "#16394b" : "#1c2a32").text(value, 453, y + 4, { width: 94, align: "right" });
    doc.moveTo(330, y + 14).lineTo(RIGHT, y + 14).strokeColor("#d5dde2").lineWidth(0.5).stroke();
    y += 16;
  });
  return y;
}

function drawFixedSummary(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number): number {
  rows.forEach(([label, value]) => {
    const emphasis = label === "TOTAL INVOICE" || label === "SISA PEMBAYARAN" || label === "STATUS";
    doc.font("Helvetica-Bold").fontSize(emphasis ? 8.5 : 8).fillColor("#244b5e").text(label, 330, y + 4);
    doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fillColor(emphasis ? "#16394b" : "#1c2a32").text(value, 453, y + 4, { width: 94, align: "right" });
    doc.moveTo(330, y + 13).lineTo(RIGHT, y + 13).strokeColor("#d5dde2").lineWidth(0.5).stroke();
    y += 14;
  });
  return y;
}

function drawNotes(doc: PDFKit.PDFDocument, text: string, y: number, width = CONTENT_WIDTH, title = "CATATAN / PERHATIAN"): number {
  const height = noteHeight(doc, text, width - 18);
  doc.roundedRect(LEFT, y, width, height, 4).fill("#fff4bf");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#674f00").text(title, LEFT + 9, y + 7);
  doc.font("Helvetica").fontSize(6.8).fillColor("#3d3520").text(text, LEFT + 9, y + 19, { width: width - 18, lineGap: 0 });
  return y + height + 8;
}

function noteHeight(doc: PDFKit.PDFDocument, text: string, width = 491): number {
  return Math.max(36, doc.heightOfString(text, { width, lineGap: 0 }) + 20);
}

function splitTextToFit(doc: PDFKit.PDFDocument, text: string, width: number, maxHeight: number): [string, string] {
  if (doc.heightOfString(text, { width, lineGap: 0 }) <= maxHeight) return [text, ""];
  let low = 1;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, middle).trimEnd();
    if (doc.heightOfString(candidate, { width, lineGap: 0 }) <= maxHeight) low = middle;
    else high = middle - 1;
  }
  let cut = text.slice(0, low).trimEnd().lastIndexOf(" ");
  if (cut < 1) cut = low;
  return [text.slice(0, cut).trimEnd(), text.slice(cut).trimStart()];
}

function signatureHeight(): number {
  return 106;
}

function drawSignature(doc: PDFKit.PDFDocument, company: PdfCompany, y: number): number {
  const containerWidth = 205;
  const containerX = RIGHT - containerWidth;
  const signatureWidth = containerWidth - 20;
  const stampSize = 58;
  const targetCenterX = containerX + containerWidth / 2 + 26;
  const signatureOpticalOffsetX = 48;
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text("Hormat kami,", containerX, y, { width: containerWidth, align: "center" });
  addImage(doc, company.signatureDataUrl, targetCenterX - signatureWidth / 2 + signatureOpticalOffsetX, y + 14, [signatureWidth, 40]);
  addImage(doc, company.logoDataUrl, targetCenterX - stampSize / 2, y + 10, [stampSize, stampSize], 0.58);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#16394b").text(company.adminName || "Admin NUFATUR", containerX, y + 76, { width: containerWidth, align: "center" });
  doc.font("Helvetica").fontSize(7.5).fillColor("#52616a").text(company.adminTitle || "Penanggung Jawab", containerX, y + 91, { width: containerWidth, align: "center" });
  return y + signatureHeight();
}

function formatDepartureDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(date).toUpperCase();
}

function drawDeparture(doc: PDFKit.PDFDocument, date: string | null | undefined, groupName: string | null | undefined, y: number): number {
  const departureDate = formatDepartureDate(date);
  const group = nonEmpty(groupName);
  if (!departureDate && !group) return y;
  const height = departureDate && group ? 48 : 32;
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 5).fill("#e8f5f1");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#287261").text("KEBERANGKATAN", LEFT + 10, y + 8);
  if (departureDate) doc.font("Helvetica-Bold").fontSize(10).fillColor("#16394b").text(departureDate, LEFT + 10, y + 20, { width: group ? 250 : 490 });
  if (group) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#287261").text("PAKET / GROUP", 330, y + 8);
    doc.font("Helvetica").fontSize(8.5).fillColor("#16394b").text(group, 330, y + 20, { width: 205, height: 20, ellipsis: true });
  }
  return y + height + 8;
}

function ensureSpace(doc: PDFKit.PDFDocument, company: PdfCompany, y: number, height: number, documentNumber: string): number {
  if (y + height <= CONTENT_BOTTOM) return y;
  return newInvoicePage(doc, company, documentNumber);
}

function newReceiptPage(doc: PDFKit.PDFDocument, company: PdfCompany, documentNumber: string): number {
  doc.addPage();
  drawBrandHeader(doc, company, company.receiptTitle || "KUITANSI", true, documentNumber);
  return CONTINUATION_CONTENT_TOP;
}

function ensureReceiptSpace(doc: PDFKit.PDFDocument, company: PdfCompany, y: number, height: number, documentNumber: string): number {
  if (y + height <= CONTENT_BOTTOM) return y;
  return newReceiptPage(doc, company, documentNumber);
}

function drawBottomBlocks(doc: PDFKit.PDFDocument, company: PdfCompany, notes: string, y: number, newPage: (doc: PDFKit.PDFDocument, company: PdfCompany) => number): number {
  let remaining = notes;
  while (remaining) {
    const available = CONTENT_BOTTOM - y;
    const notesHeight = noteHeight(doc, remaining, CONTENT_WIDTH - 18);
    if (notesHeight + 8 + SIGNATURE_GAP + SIGNATURE_RESERVE <= available) {
      y = drawNotes(doc, remaining, y, CONTENT_WIDTH) + 6;
      remaining = "";
      break;
    }
    if (available > 58) {
      const [chunk, rest] = splitTextToFit(doc, remaining, CONTENT_WIDTH - 18, available - 58);
      if (chunk) {
        y = drawNotes(doc, chunk, y, CONTENT_WIDTH, remaining === notes ? "CATATAN / PERHATIAN" : "CATATAN / PERHATIAN - LANJUTAN");
        remaining = rest;
      }
    }
    if (remaining) y = newPage(doc, company);
  }
  if (y + SIGNATURE_GAP + SIGNATURE_RESERVE > CONTENT_BOTTOM) y = newPage(doc, company);
  return drawSignature(doc, company, y + SIGNATURE_GAP);
}

function addFooters(doc: PDFKit.PDFDocument, company: PdfCompany): void {
  const range = doc.bufferedPageRange();
  if (!company.footer.trim() || range.count === 0) return;
  doc.switchToPage(range.start + range.count - 1);
  doc.font("Helvetica").fontSize(7).fillColor("#6b7d86").text(company.footer, LEFT, FOOTER_Y, { width: CONTENT_WIDTH, align: "center" });
}

function contentDisposition(name: string, inline: boolean): string {
  return `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^a-z0-9/_-]/gi, "_")}.pdf"`;
}

export function streamInvoicePdf(res: Response, company: PdfCompany, invoice: PdfInvoice, inline = false): void {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(invoice.number, inline));
  doc.pipe(res);

  const summaryRows: Array<[string, string]> = [
    ["Subtotal", money(invoice.subtotal)],
    ["Diskon", numberValue(invoice.discount) ? money(invoice.discount) : "-"],
    ["Pajak", numberValue(invoice.tax) ? money(invoice.tax) : "-"],
    ["CASHBACK", numberValue(invoice.additionalCost) ? money(invoice.additionalCost) : "-"],
    ["TOTAL INVOICE", money(invoice.total)],
    ["DIBAYAR", money(invoice.paid)],
    ["SISA PEMBAYARAN", money(invoice.remaining)],
    ["STATUS", invoice.status],
  ];
  const includeText = nonEmpty(invoice.includeText) || nonEmpty(company.includeText);
  const invoiceNotes = noteText(company, invoice.notes);
  const itemRows = invoice.items.length ? invoice.items : [{ description: "", amount: "0" }];
  doc.font("Helvetica").fontSize(8);
  const [includeFirst, includeRest] = splitTextToFit(doc, includeText, 415, INVOICE_SLOTS.includeHeight - 14);
  doc.font("Helvetica").fontSize(6.4);
  const [notesFirst, notesRest] = splitTextToFit(doc, invoiceNotes, CONTENT_WIDTH - 18, INVOICE_SLOTS.notesHeight - 20);

  const drawPageOne = (): void => {
    drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE");
    labelValue(doc, "Tanggal Invoice", invoice.invoiceDate, 366, 82, 145);
    labelValue(doc, "Invoice Number", invoice.number, 366, 112, 145);
    line(doc, 160);
    labelValue(doc, "CUSTOMER", invoice.customerName, LEFT, INVOICE_SLOTS.customerY, 270);
    doc.fontSize(7.5).font("Helvetica").fillColor("#52616a").text(invoice.customerAddress || invoice.customerType || "-", LEFT, INVOICE_SLOTS.customerY + 27, { width: 270, height: 18, ellipsis: true });
    labelValue(doc, "JATUH TEMPO", invoice.dueDate, 366, INVOICE_SLOTS.customerY, 145);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(invoice.status === "LUNAS" ? "#16835b" : invoice.status === "JATUH TEMPO" ? "#ba5b17" : "#234252").text(invoice.status, 366, INVOICE_SLOTS.customerY + 27, { width: 145, align: "right" });
    drawDeparture(doc, invoice.group?.departureDate, invoice.group ? `${invoice.group.name} • ${invoice.group.packageName}` : null, INVOICE_SLOTS.departureY);
    drawInvoiceTableHeader(doc, INVOICE_SLOTS.tableY);
    for (let index = 0; index < INVOICE_SLOTS.pageOneRows; index += 1) {
      if (itemRows[index]) drawInvoiceItemRow(doc, itemRows[index], INVOICE_SLOTS.tableY + 22 + index * INVOICE_SLOTS.tableRowHeight);
      else drawEmptyInvoiceRow(doc, INVOICE_SLOTS.tableY + 22 + index * INVOICE_SLOTS.tableRowHeight);
    }
    drawFixedInclude(doc, includeFirst, INVOICE_SLOTS.includeY);
    drawFixedSummary(doc, summaryRows, INVOICE_SLOTS.summaryY);
    drawFixedPaymentSlot(doc, invoice.payments);
    drawFixedBank(doc, company);
  };

  const drawContinuationTable = (items: PdfInvoice["items"], fillTemplateRows: boolean): void => {
    drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE", true, invoice.number);
    drawInvoiceTableHeader(doc, INVOICE_SLOTS.continuationTableY);
    items.forEach((item, index) => drawInvoiceItemRow(doc, item, INVOICE_SLOTS.continuationTableY + 22 + index * INVOICE_SLOTS.tableRowHeight));
    if (fillTemplateRows) {
      for (let index = items.length; index < INVOICE_SLOTS.continuationRows; index += 1) drawEmptyInvoiceRow(doc, INVOICE_SLOTS.continuationTableY + 22 + index * INVOICE_SLOTS.tableRowHeight);
    }
  };

  drawPageOne();
  let remainingItems = itemRows.slice(INVOICE_SLOTS.pageOneRows);
  let remainingInclude = includeRest;
  let remainingNotes = notesRest;
  let paymentContinuationPending = invoice.payments.length > 2;
  const hasOverflow = remainingItems.length > 0 || Boolean(remainingInclude) || Boolean(remainingNotes) || paymentContinuationPending;
  if (!hasOverflow) {
    drawFixedNotes(doc, notesFirst);
    drawSignature(doc, company, INVOICE_SLOTS.signatureY);
  } else {
    drawFixedNotes(doc, "");
  }

  while (remainingItems.length > 0 || remainingInclude || remainingNotes || paymentContinuationPending) {
    doc.addPage();
    const pageItems = remainingItems.splice(0, INVOICE_SLOTS.continuationRows);
    const finalPage = remainingItems.length === 0;
    drawContinuationTable(pageItems, !finalPage);
    if (remainingItems.length === 0) {
      if (paymentContinuationPending) drawPaymentContinuation(doc, invoice.payments);
      paymentContinuationPending = false;
      if (remainingInclude) {
        drawFixedInclude(doc, remainingInclude, 300, 70);
        remainingInclude = "";
      }
      if (remainingNotes) {
        drawFixedNotes(doc, remainingNotes, INVOICE_SLOTS.notesY, INVOICE_SLOTS.notesHeight, "CATATAN / PERHATIAN - LANJUTAN");
        remainingNotes = "";
      }
      drawSignature(doc, company, INVOICE_SLOTS.signatureY);
    }
  }
  addFooters(doc, company);
  doc.end();
}

export function streamReceiptPdf(res: Response, company: PdfCompany, receipt: PdfReceipt, inline = false): void {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(receipt.number, inline));
  doc.pipe(res);

  drawBrandHeader(doc, company, company.receiptTitle || "KUITANSI");
  doc.font("Helvetica").fontSize(9).fillColor("#52616a").text(`No. ${receipt.number}`, 370, 84, { align: "right" });
  doc.text(`Tanggal: ${receipt.receiptDate}`, 370, 99, { align: "right" });
  line(doc, 160);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#287261").text("DITERIMA DARI", LEFT, 173);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#16394b").text(receipt.receivedFrom || "-", LEFT, 188, { width: CONTENT_WIDTH, height: 20, ellipsis: true });
  const receiptRows: Array<[string, string]> = [
    ["GROUP / PAKET", receipt.groupName || "-"],
    ["KEBERANGKATAN", formatDepartureDate(receipt.departureDate) || "-"],
    ["UNTUK PEMBAYARAN", `Invoice: ${receipt.invoiceNumber || "-"}`],
    ["METODE PEMBAYARAN", `${receipt.method || "-"}${receipt.bank ? ` • ${receipt.bank}` : ""}`],
  ];
  receiptRows.forEach(([label, value], index) => {
    const y = 226 + index * 28;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#52616a").text(label, LEFT, y, { width: 125 });
    doc.font("Helvetica").fontSize(9).fillColor("#1c2a32").text(value, LEFT + 135, y, { width: CONTENT_WIDTH - 135, height: 22, lineGap: 1, ellipsis: true });
  });
  const amountY = 352;
  doc.roundedRect(LEFT, amountY, CONTENT_WIDTH, 58, 6).fill("#e7f0f4");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#287261").text("JUMLAH DITERIMA", LEFT + 14, amountY + 11);
  doc.font("Helvetica-Bold").fontSize(19).fillColor("#16394b").text(money(receipt.amount), LEFT + 14, amountY + 25);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#287261").text("TERBILANG", LEFT + 205, amountY + 11);
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text(receipt.words || "-", LEFT + 205, amountY + 24, { width: 270, height: 28, lineGap: 1, ellipsis: true });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("RINGKASAN PEMBAYARAN", LEFT, 438);
  drawSummary(doc, [["TOTAL INVOICE", money(receipt.total)], ["TOTAL DIBAYAR", money(receipt.paid)], ["SISA PEMBAYARAN", money(receipt.remaining)], ["STATUS", receipt.status]], 453);
  drawFixedNotes(doc, receipt.notes || "", 535, 70);
  drawSignature(doc, company, INVOICE_SLOTS.signatureY);
  addFooters(doc, company);
  doc.end();
}