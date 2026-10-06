import PDFDocument from "pdfkit";
import type { Response } from "express";
import { money, numberValue } from "./format";

const LEFT = 42;
const RIGHT = 553;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_Y = 790;
const CONTENT_BOTTOM = 760;
const INVOICE_CONTENT_BOTTOM = 774;
const SIGNATURE_GAP = 14;
const INVOICE_SIGNATURE_GAP = 6;
const CONTINUATION_CONTENT_TOP = 88;
const SIGNATURE_HEIGHT = 106;
const INVOICE_SIGNATURE_HEIGHT = 90;
const INVOICE_COLUMNS = [LEFT, 235, 295, 335, 390, 465, RIGHT] as const;
const INVOICE_DESCRIPTION_WIDTH = INVOICE_COLUMNS[1] - INVOICE_COLUMNS[0] - 12;
const INVOICE_CONTINUATION_TABLE_Y = 104;
const INVOICE_SLOTS = { notesY: 580, notesHeight: 95, signatureY: 684 } as const;
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
  items: Array<{ description: string; flight?: string | null; details?: string | null; itemDate?: string | null; quantity?: string | null; price?: string | null; amount: string; cashback?: string | number | null }>;
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
  doc.rect(LEFT, y, CONTENT_WIDTH, 20).fill("#e7f0f4");
  ["DESCRIPTION", "FARE / PRICE", "QTY", "DATE", "CASHBACK", "TOTAL"].forEach((header, index) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text(header, INVOICE_COLUMNS[index] + 5, y + 6, {
      width: INVOICE_COLUMNS[index + 1] - INVOICE_COLUMNS[index] - 10,
      align: index >= 4 ? "right" : "left",
    });
  });
  return y + 20;
}

function invoiceItemDescription(item: PdfInvoice["items"][number]): string {
  return [item.description, item.flight, item.details]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
}

function invoiceItemRowHeight(doc: PDFKit.PDFDocument, description: string): number {
  doc.font("Helvetica").fontSize(8);
  return Math.max(24, doc.heightOfString(description || "-", { width: INVOICE_DESCRIPTION_WIDTH, lineGap: 1 }) + 8);
}

function drawInvoiceItemRow(
  doc: PDFKit.PDFDocument,
  item: PdfInvoice["items"][number],
  y: number,
  description: string,
  showValues: boolean,
): number {
  const height = invoiceItemRowHeight(doc, description);
  doc.rect(LEFT, y, CONTENT_WIDTH, height).strokeColor("#cad6dc").stroke();
  for (let index = 1; index < INVOICE_COLUMNS.length - 1; index += 1) {
    doc.moveTo(INVOICE_COLUMNS[index], y).lineTo(INVOICE_COLUMNS[index], y + height).strokeColor("#cad6dc").stroke();
  }
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(description || "-", LEFT + 6, y + 4, { width: INVOICE_DESCRIPTION_WIDTH, lineGap: 1 });
  if (showValues) {
    doc.text(item.price ? money(item.price) : "-", INVOICE_COLUMNS[1] + 5, y + 4, { width: INVOICE_COLUMNS[2] - INVOICE_COLUMNS[1] - 10, align: "right" });
    doc.text(displayQty(item.quantity), INVOICE_COLUMNS[2] + 3, y + 4, { width: INVOICE_COLUMNS[3] - INVOICE_COLUMNS[2] - 6, align: "center" });
    doc.text(item.itemDate ?? "-", INVOICE_COLUMNS[3] + 3, y + 4, { width: INVOICE_COLUMNS[4] - INVOICE_COLUMNS[3] - 6, align: "center" });
    doc.text(money(item.cashback), INVOICE_COLUMNS[4] + 5, y + 4, { width: INVOICE_COLUMNS[5] - INVOICE_COLUMNS[4] - 10, align: "right" });
    doc.font("Helvetica-Bold").text(money(item.amount), INVOICE_COLUMNS[5] + 5, y + 4, { width: INVOICE_COLUMNS[6] - INVOICE_COLUMNS[5] - 10, align: "right" });
  }
  return height;
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

function drawInclude(doc: PDFKit.PDFDocument, includeText: string, y: number, title = "INCLUDE"): number {
  doc.font("Helvetica").fontSize(8);
  const height = Math.max(29, doc.heightOfString(includeText, { width: 415, lineGap: 1 }) + 16);
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 4).fill("#f4f8f9");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#244b5e").text(title, LEFT + 9, y + 7, { width: 60 });
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(includeText, LEFT + 76, y + 7, { width: 415, lineGap: 1 });
  return y + height + 8;
}

function drawSummary(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number): number {
  const columnWidth = CONTENT_WIDTH / 2;
  for (let index = 0; index < rows.length; index += 2) {
    for (const [column, row] of [rows[index], rows[index + 1]].entries()) {
      if (!row) continue;
      const [label, value] = row;
      const x = LEFT + column * columnWidth;
      const emphasis = label === "TOTAL INVOICE" || label === "SISA PEMBAYARAN" || label === "STATUS";
      doc.font("Helvetica-Bold").fontSize(emphasis ? 8.5 : 8).fillColor("#244b5e").text(label, x + 7, y + 3, { width: 125 });
      doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(emphasis ? "#16394b" : "#1c2a32")
        .text(value, x + 132, y + 3, { width: columnWidth - 140, align: "right" });
      if (column === 1) {
        doc.moveTo(x, y).lineTo(x, y + 15).strokeColor("#d5dde2").lineWidth(0.5).stroke();
      }
    }
    doc.moveTo(LEFT, y + 15).lineTo(RIGHT, y + 15).strokeColor("#d5dde2").lineWidth(0.5).stroke();
    y += 16;
  }
  return y;
}

function drawNotes(doc: PDFKit.PDFDocument, text: string, y: number, width = CONTENT_WIDTH, title = "CATATAN / PERHATIAN"): number {
  doc.font("Helvetica").fontSize(6.8);
  const height = noteHeight(doc, text, width - 18);
  doc.roundedRect(LEFT, y, width, height, 4).fill("#fff4bf");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#674f00").text(title, LEFT + 9, y + 7);
  doc.font("Helvetica").fontSize(6.8).fillColor("#3d3520").text(text, LEFT + 9, y + 19, { width: width - 18, lineGap: 0 });
  return y + height + 8;
}

function bankCardHeight(doc: PDFKit.PDFDocument, text: string): number {
  doc.font("Helvetica").fontSize(7.5);
  return doc.heightOfString(text, { width: CONTENT_WIDTH - 16, lineGap: 1 }) + 24;
}

function drawBankCard(doc: PDFKit.PDFDocument, text: string, y: number, title: string): number {
  const height = bankCardHeight(doc, text);
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 4).fill("#f4f8f9");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text(title, LEFT + 8, y + 6);
  doc.font("Helvetica").fontSize(7.5).fillColor("#1c2a32").text(text, LEFT + 8, y + 17, { width: CONTENT_WIDTH - 16, lineGap: 1 });
  return y + height + 7;
}

function noteHeight(doc: PDFKit.PDFDocument, text: string, width = 491): number {
  return Math.max(36, doc.heightOfString(text, { width, lineGap: 0 }) + 20);
}

function splitTextToFit(doc: PDFKit.PDFDocument, text: string, width: number, maxHeight: number, lineGap = 0): [string, string] {
  if (doc.heightOfString(text, { width, lineGap }) <= maxHeight) return [text, ""];
  let low = 1;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, middle);
    if (doc.heightOfString(candidate, { width, lineGap }) <= maxHeight) low = middle;
    else high = middle - 1;
  }
  const whitespace = text.lastIndexOf(" ", low);
  const cut = whitespace > Math.max(0, low - 32) ? whitespace + 1 : low;
  return [text.slice(0, cut), text.slice(cut)];
}

function signatureHeight(compact = false): number {
  return compact ? INVOICE_SIGNATURE_HEIGHT : SIGNATURE_HEIGHT;
}

function drawSignature(doc: PDFKit.PDFDocument, company: PdfCompany, y: number, compact = false): number {
  const containerWidth = 205;
  const containerX = RIGHT - containerWidth;
  const signatureWidth = containerWidth - 20;
  const stampSize = compact ? 50 : 58;
  const targetCenterX = containerX + containerWidth / 2 + 26;
  const signatureOpticalOffsetX = 48;
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text("Hormat kami,", containerX, y, { width: containerWidth, align: "center" });
  addImage(doc, company.signatureDataUrl, targetCenterX - signatureWidth / 2 + signatureOpticalOffsetX, y + (compact ? 12 : 14), [signatureWidth, compact ? 34 : 40]);
  addImage(doc, company.logoDataUrl, targetCenterX - stampSize / 2, y + (compact ? 8 : 10), [stampSize, stampSize], 0.58);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#16394b").text(company.adminName || "Admin NUFATUR", containerX, y + (compact ? 65 : 76), { width: containerWidth, align: "center" });
  doc.font("Helvetica").fontSize(7.5).fillColor("#52616a").text(company.adminTitle || "Penanggung Jawab", containerX, y + (compact ? 80 : 91), { width: containerWidth, align: "center" });
  return y + signatureHeight(compact);
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
  const dateWidth = group ? 190 : CONTENT_WIDTH - 20;
  const groupWidth = CONTENT_WIDTH - dateWidth - 30;
  doc.font("Helvetica-Bold").fontSize(10);
  const dateHeight = departureDate ? doc.heightOfString(departureDate, { width: dateWidth }) : 0;
  doc.font("Helvetica").fontSize(8.5);
  const groupHeight = group ? doc.heightOfString(group, { width: groupWidth, lineGap: 1 }) : 0;
  const height = Math.max(dateHeight, groupHeight, 13) + 20;
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 5).fill("#e8f5f1");
  if (departureDate) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#287261").text("KEBERANGKATAN", LEFT + 10, y + 5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#16394b").text(departureDate, LEFT + 10, y + 15, { width: dateWidth });
  }
  if (group) {
    const groupX = departureDate ? LEFT + 10 + dateWidth + 10 : LEFT + 10;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#287261").text("PAKET / GROUP", groupX, y + 5);
    doc.font("Helvetica").fontSize(8.5).fillColor("#16394b").text(group, groupX, y + 15, { width: departureDate ? groupWidth : CONTENT_WIDTH - 20, lineGap: 1 });
  }
  return y + height + 8;
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
    if (notesHeight + 8 + SIGNATURE_GAP + SIGNATURE_HEIGHT <= available) {
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
  if (y + SIGNATURE_GAP + SIGNATURE_HEIGHT > CONTENT_BOTTOM) y = newPage(doc, company);
  return drawSignature(doc, company, y + SIGNATURE_GAP);
}

function addFooters(doc: PDFKit.PDFDocument, company: PdfCompany, allPages = false): void {
  const range = doc.bufferedPageRange();
  if (!company.footer.trim() || range.count === 0) return;
  const firstPage = allPages ? range.start : range.start + range.count - 1;
  for (let index = firstPage; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font("Helvetica").fontSize(7).fillColor("#6b7d86").text(company.footer, LEFT, FOOTER_Y, { width: CONTENT_WIDTH, align: "center" });
  }
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
    ["TOTAL CASHBACK", numberValue(invoice.additionalCost) ? money(-invoice.additionalCost) : "-"],
    ["TOTAL INVOICE", money(invoice.total)],
    ["DIBAYAR", money(invoice.paid)],
    ["SISA PEMBAYARAN", money(invoice.remaining)],
    ["STATUS", invoice.status],
  ];
  const includeText = nonEmpty(invoice.includeText) || nonEmpty(company.includeText);
  const invoiceNotes = noteText(company, invoice.notes);
  let y = 0;
  const nextPage = (): number => newInvoicePage(doc, company, invoice.number);
  const nextItemPage = (): number => drawInvoiceTableHeader(doc, drawBrandContinuationForItems());
  const drawBrandContinuationForItems = (): number => {
    doc.addPage();
    drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE", true, invoice.number);
    return INVOICE_CONTINUATION_TABLE_Y;
  };

  drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE");
  labelValue(doc, "Tanggal Invoice", invoice.invoiceDate, 366, 82, 145);
  labelValue(doc, "Invoice Number", invoice.number, 366, 112, 145);
  line(doc, 160);

  y = 164;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("CUSTOMER", LEFT, y);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1c2a32");
  const customerNameHeight = doc.heightOfString(invoice.customerName || "-", { width: 270 });
  doc.font("Helvetica").fontSize(7.5).fillColor("#52616a");
  const customerDetails = invoice.customerAddress || invoice.customerType;
  const customerDetailsHeight = customerDetails ? doc.heightOfString(customerDetails, { width: 270, lineGap: 1 }) : 0;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(invoice.status === "LUNAS" ? "#16835b" : invoice.status === "JATUH TEMPO" ? "#ba5b17" : "#234252");
  const dueHeight = Math.max(doc.heightOfString(invoice.dueDate, { width: 145 }), doc.heightOfString(invoice.status, { width: 145 }));
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1c2a32").text(invoice.customerName || "-", LEFT, y + 12, { width: 270 });
  if (customerDetails) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#52616a").text(customerDetails, LEFT, y + 14 + customerNameHeight, { width: 270, lineGap: 1 });
  }
  labelValue(doc, "JATUH TEMPO", invoice.dueDate, 366, y, 145);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(invoice.status === "LUNAS" ? "#16835b" : invoice.status === "JATUH TEMPO" ? "#ba5b17" : "#234252")
    .text(invoice.status, 366, y + 27, { width: 145, align: "right" });
  y += Math.max(40, 13 + customerNameHeight + (customerDetails ? customerDetailsHeight + 2 : 0), 27 + dueHeight) + 8;

  const groupDisplay = invoice.group
    ? [nonEmpty(invoice.group.name), nonEmpty(invoice.group.packageName)].filter(Boolean).join(" • ")
    : "";
  y = drawDeparture(doc, invoice.group?.departureDate, groupDisplay, y);
  y = drawInvoiceTableHeader(doc, y);

  const itemRows: PdfInvoice["items"] = invoice.items.length > 0
    ? invoice.items
    : [{ description: "", amount: "0" }];
  for (const item of itemRows) {
    let remainingDescription = invoiceItemDescription(item) || "-";
    let showValues = true;
    while (remainingDescription.length > 0) {
      const fullHeight = invoiceItemRowHeight(doc, remainingDescription);
      const availableHeight = INVOICE_CONTENT_BOTTOM - y;
      if (fullHeight <= availableHeight) {
        y += drawInvoiceItemRow(doc, item, y, remainingDescription, showValues);
        break;
      }
      if (availableHeight < 28) {
        y = nextItemPage();
        continue;
      }
      const [visibleDescription, rest] = splitTextToFit(doc, remainingDescription, INVOICE_DESCRIPTION_WIDTH, availableHeight - 12, 1);
      if (!visibleDescription || visibleDescription === remainingDescription) {
        y = nextItemPage();
        continue;
      }
      y += drawInvoiceItemRow(doc, item, y, visibleDescription, showValues);
      remainingDescription = rest;
      showValues = false;
      y = nextItemPage();
    }
  }

  if (includeText) {
    let remainingInclude = includeText;
    let includeTitle = "INCLUDE";
    while (remainingInclude) {
      doc.font("Helvetica").fontSize(8);
      const fullHeight = Math.max(29, doc.heightOfString(remainingInclude, { width: 415, lineGap: 1 }) + 16);
      const availableHeight = INVOICE_CONTENT_BOTTOM - y;
      if (fullHeight <= availableHeight) {
        y = drawInclude(doc, remainingInclude, y, includeTitle);
        break;
      }
      if (availableHeight < 30) {
        y = nextPage();
        includeTitle = "INCLUDE (LANJUTAN)";
        continue;
      }
      const [visibleText, rest] = splitTextToFit(doc, remainingInclude, 415, availableHeight - 16, 1);
      if (!visibleText || visibleText === remainingInclude) {
        y = nextPage();
        includeTitle = "INCLUDE (LANJUTAN)";
        continue;
      }
      y = drawInclude(doc, visibleText, y, includeTitle);
      remainingInclude = rest;
      includeTitle = "INCLUDE (LANJUTAN)";
      if (remainingInclude) y = nextPage();
    }
  }

  const summaryHeight = Math.ceil(summaryRows.length / 2) * 16;
  if (y + summaryHeight > INVOICE_CONTENT_BOTTOM) y = nextPage();
  y = drawSummary(doc, summaryRows, y + 1) + 6;

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252");
  if (y + 26 > INVOICE_CONTENT_BOTTOM) y = nextPage();
  doc.text("PAYMENT HISTORY", LEFT, y);
  y += 12;
  if (invoice.payments.length === 0) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#52616a").text("Belum ada pembayaran", LEFT + 7, y + 5);
    y += 22;
  } else {
    invoice.payments.forEach((payment, index) => {
      doc.font("Helvetica").fontSize(7.5);
      const descriptionHeight = doc.heightOfString(payment.description || "-", { width: 230, lineGap: 1 });
      const method = payment.bank ?? payment.method;
      const methodHeight = doc.heightOfString(method, { width: 82, lineGap: 1 });
      const rowHeight = Math.max(18, descriptionHeight + 6, methodHeight + 6);
      if (y + rowHeight > INVOICE_CONTENT_BOTTOM) {
        y = nextPage();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text("PAYMENT HISTORY (LANJUTAN)", LEFT, y);
        y += 14;
      }
      doc.rect(LEFT, y, CONTENT_WIDTH, rowHeight).strokeColor("#cad6dc").stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#1c2a32").text(payment.description || "-", LEFT + 7, y + 3, { width: 230, lineGap: 1 });
      doc.text(payment.paymentDate, 290, y + 4, { width: 70 });
      doc.text(method, 365, y + 3, { width: 82, lineGap: 1 });
      doc.font("Helvetica-Bold").text(money(payment.amount), 453, y + 4, { width: 94, align: "right" });
      y += rowHeight;
      if (index < invoice.payments.length - 1) y += 2;
    });
  }

  const bankText = nonEmpty(company.notes);
  if (bankText) {
    y += 8;
    let remainingBankText = bankText;
    let bankTitle = "BANK NUFATUR";
    while (remainingBankText) {
      const fullHeight = bankCardHeight(doc, remainingBankText);
      const availableHeight = INVOICE_CONTENT_BOTTOM - y;
      if (fullHeight <= availableHeight) {
        y = drawBankCard(doc, remainingBankText, y, bankTitle);
        break;
      }
      if (availableHeight < 30) {
        y = nextPage();
        bankTitle = "BANK NUFATUR (LANJUTAN)";
        continue;
      }
      const [visibleText, rest] = splitTextToFit(doc, remainingBankText, CONTENT_WIDTH - 16, availableHeight - 24, 1);
      if (!visibleText || visibleText === remainingBankText) {
        y = nextPage();
        bankTitle = "BANK NUFATUR (LANJUTAN)";
        continue;
      }
      y = drawBankCard(doc, visibleText, y, bankTitle);
      remainingBankText = rest;
      if (remainingBankText) {
        y = nextPage();
        bankTitle = "BANK NUFATUR (LANJUTAN)";
      }
    }
  }

  let remainingNotes = invoiceNotes;
  let notesTitle = "CATATAN / PERHATIAN";
  while (remainingNotes) {
    doc.font("Helvetica").fontSize(6.8);
    const fullHeight = noteHeight(doc, remainingNotes, CONTENT_WIDTH - 18);
    const availableHeight = INVOICE_CONTENT_BOTTOM - y;
    if (fullHeight <= availableHeight) {
      if (y + fullHeight + 8 + INVOICE_SIGNATURE_GAP + signatureHeight(true) > INVOICE_CONTENT_BOTTOM) {
        y = nextPage();
        notesTitle = "CATATAN / PERHATIAN";
        continue;
      }
      y = drawNotes(doc, remainingNotes, y, CONTENT_WIDTH, notesTitle);
      break;
    }
    if (availableHeight < 40) {
      y = nextPage();
      notesTitle = "CATATAN / PERHATIAN - LANJUTAN";
      continue;
    }
    const [visibleText, rest] = splitTextToFit(doc, remainingNotes, CONTENT_WIDTH - 18, availableHeight - 20);
    if (!visibleText || visibleText === remainingNotes) {
      y = nextPage();
      notesTitle = "CATATAN / PERHATIAN - LANJUTAN";
      continue;
    }
    y = drawNotes(doc, visibleText, y, CONTENT_WIDTH, notesTitle);
    remainingNotes = rest;
    notesTitle = "CATATAN / PERHATIAN - LANJUTAN";
    if (remainingNotes) y = nextPage();
  }

  if (y + INVOICE_SIGNATURE_GAP + signatureHeight(true) > INVOICE_CONTENT_BOTTOM) y = nextPage();
  drawSignature(doc, company, y + INVOICE_SIGNATURE_GAP, true);
  addFooters(doc, company, true);
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