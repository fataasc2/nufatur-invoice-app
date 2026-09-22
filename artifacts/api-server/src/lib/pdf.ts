import PDFDocument from "pdfkit";
import type { Response } from "express";
import { money, numberValue } from "./format";

const LEFT = 42;
const RIGHT = 553;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_Y = 770;
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

function drawBrandHeader(doc: PDFKit.PDFDocument, company: PdfCompany, title: string, continuation = false): void {
  addLogo(doc, company, LEFT, 28, [138, 48]);
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text(company.companyName, LEFT, 82);
  doc.text(company.address, LEFT, 95, { width: 255, lineGap: 2 });
  doc.text(`WhatsApp: ${company.whatsapp}  •  ${company.email}`, LEFT, 126);
  doc.text(company.website, LEFT, 139);
  doc.font("Helvetica-Bold").fontSize(24).fillColor("#16394b").text(title, 350, 35, { width: 203, align: "right" });
  if (continuation) doc.font("Helvetica").fontSize(8).fillColor("#52616a").text("Lanjutan dokumen", 350, 68, { width: 203, align: "right" });
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

function newInvoicePage(doc: PDFKit.PDFDocument, company: PdfCompany): number {
  doc.addPage();
  drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE", true);
  return 102;
}

function drawInclude(doc: PDFKit.PDFDocument, includeText: string, y: number): number {
  const height = Math.max(34, doc.heightOfString(includeText, { width: 490, lineGap: 2 }) + 24);
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 5).fill("#f4f8f9");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text("INCLUDE", LEFT + 10, y + 8);
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(includeText, LEFT + 10, y + 21, { width: 490, lineGap: 2 });
  return y + height + 14;
}

function drawSummary(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number): number {
  rows.forEach(([label, value]) => {
    doc.rect(LEFT, y, CONTENT_WIDTH, 22).fill(label === "TOTAL" ? "#e7f0f4" : "#fbf3c4");
    doc.font("Helvetica-Bold").fontSize(label === "TOTAL" ? 9 : 8).fillColor("#244b5e").text(label, 330, y + 7);
    doc.text(value, 453, y + 7, { width: 94, align: "right" });
    y += 22;
  });
  return y;
}

function drawNotes(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const height = noteHeight(doc, text);
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 5).fill("#fff4bf");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#674f00").text("CATATAN / PERHATIAN", LEFT + 10, y + 9);
  doc.font("Helvetica").fontSize(8).fillColor("#3d3520").text(text, LEFT + 10, y + 24, { width: 491, lineGap: 2 });
  return y + height + 16;
}

function noteHeight(doc: PDFKit.PDFDocument, text: string): number {
  return Math.max(48, doc.heightOfString(text, { width: 491, lineGap: 2 }) + 28);
}

function drawSignature(doc: PDFKit.PDFDocument, company: PdfCompany, y: number): number {
  const blockHeight = 108;
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text("Hormat kami,", 390, y, { width: 145, align: "center" });
  addImage(doc, company.signatureDataUrl, 392, y + 12, [140, 58]);
  addImage(doc, company.logoDataUrl, 455, y + 16, [70, 50], 0.62);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#16394b").text(company.adminName || "Admin NUFATUR", 390, y + 72, { width: 145, align: "center" });
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text(company.adminTitle || "Penanggung Jawab", 390, y + 86, { width: 145, align: "center" });
  return y + blockHeight;
}

function addFooters(doc: PDFKit.PDFDocument, company: PdfCompany): void {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
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

  drawBrandHeader(doc, company, company.invoiceTitle || "INVOICE");
  labelValue(doc, "Invoice Date", invoice.invoiceDate, 366, 82, 145);
  labelValue(doc, "Invoice Number", invoice.number, 366, 116, 145);
  labelValue(doc, "Reference", invoice.reference ?? "-", 366, 150, 145);
  line(doc, 174);
  labelValue(doc, "BILL TO", invoice.customerName, LEFT, 190, 230);
  doc.fontSize(8).font("Helvetica").fillColor("#52616a").text(`${invoice.customerType}${invoice.customerAddress ? ` • ${invoice.customerAddress}` : ""}`, LEFT, 219, { width: 230 });
  labelValue(doc, "DUE DATE", invoice.dueDate, 366, 190, 145);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(invoice.status === "LUNAS" ? "#16835b" : invoice.status === "JATUH TEMPO" ? "#ba5b17" : "#234252").text(invoice.status, 366, 224);

  let y = drawInvoiceTableHeader(doc, 260);
  invoice.items.forEach((item) => {
    const description = [item.description, item.flight, item.details].filter(Boolean).join("\n");
    const height = Math.max(34, doc.heightOfString(description, { width: 196, lineGap: 2 }) + 20);
    if (y + height > 690) y = newInvoicePage(doc, company);
    const tableX = [42, 250, 326, 382, 448, 553];
    doc.rect(LEFT, y, CONTENT_WIDTH, height).strokeColor("#cad6dc").stroke();
    for (let index = 1; index < tableX.length - 1; index += 1) doc.moveTo(tableX[index], y).lineTo(tableX[index], y + height).strokeColor("#cad6dc").stroke();
    doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(description, 48, y + 8, { width: 196, lineGap: 2 });
    doc.text(item.price ? money(item.price) : "-", 255, y + 8, { width: 66, align: "right" });
    doc.text(displayQty(item.quantity), 331, y + 8, { width: 46, align: "center" });
    doc.text(item.itemDate ?? "-", 387, y + 8, { width: 56, align: "center" });
    doc.font("Helvetica-Bold").text(money(item.amount), 453, y + 8, { width: 94, align: "right" });
    y += height;
  });

  const includeText = nonEmpty(invoice.includeText) || nonEmpty(company.includeText);
  if (includeText) {
    if (y > 650) y = newInvoicePage(doc, company);
    y = drawInclude(doc, includeText, y + 8);
  }
  if (y + 150 > 760) y = newInvoicePage(doc, company);
  const summaryRows: Array<[string, string]> = [["Subtotal", money(invoice.subtotal)]];
  if (numberValue(invoice.discount) > 0) summaryRows.push(["Diskon", money(invoice.discount)]);
  if (numberValue(invoice.tax) > 0) summaryRows.push(["Pajak", money(invoice.tax)]);
  if (numberValue(invoice.additionalCost) > 0) summaryRows.push(["CASHBACK", money(invoice.additionalCost)]);
  summaryRows.push(["TOTAL", money(invoice.total)]);
  y = drawSummary(doc, summaryRows, y + 4) + 14;

  if (y + 110 > 760) y = newInvoicePage(doc, company);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#234252").text("PAYMENT DETAIL", LEFT, y);
  y += 16;
  if (invoice.payments.length === 0) {
    doc.font("Helvetica").fontSize(8).fillColor("#52616a").text("Belum ada pembayaran.", LEFT, y);
    y += 24;
  } else {
    invoice.payments.forEach((payment) => {
      if (y + 24 > 760) y = newInvoicePage(doc, company);
      doc.rect(LEFT, y, CONTENT_WIDTH, 23).strokeColor("#cad6dc").stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(payment.description, 48, y + 7, { width: 180 });
      doc.text(payment.paymentDate, 300, y + 7, { width: 70 });
      doc.text(payment.bank ?? payment.method, 380, y + 7, { width: 70 });
      doc.font("Helvetica-Bold").text(money(payment.amount), 453, y + 7, { width: 94, align: "right" });
      y += 23;
    });
  }
  y += 8;
  if (y + 170 > 760) y = newInvoicePage(doc, company);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#234252").text("PEMBAYARAN MELALUI", LEFT, y);
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(company.notes || "-", LEFT, y + 15, { width: CONTENT_WIDTH });
  y += Math.max(42, doc.heightOfString(company.notes || "-", { width: CONTENT_WIDTH }) + 30);
  const invoiceNotes = noteText(company, invoice.notes);
  if (y + noteHeight(doc, invoiceNotes) + 125 > 760) y = newInvoicePage(doc, company);
  y = drawNotes(doc, invoiceNotes, y);
  drawSignature(doc, company, y);
  addFooters(doc, company);
  doc.end();
}

export function streamReceiptPdf(res: Response, company: PdfCompany, receipt: PdfReceipt, inline = false): void {
  const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(receipt.number, inline));
  doc.pipe(res);

  drawBrandHeader(doc, company, company.receiptTitle || "KUITANSI");
  doc.font("Helvetica").fontSize(9).fillColor("#52616a").text(`No. ${receipt.number}`, 370, 84, { align: "right" });
  doc.text(`Tanggal: ${receipt.receiptDate}`, 370, 99, { align: "right" });
  line(doc, 152);
  doc.font("Helvetica").fontSize(12).fillColor("#1c2a32").text("Telah diterima dari", 60, 190);
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#16394b").text(receipt.receivedFrom, 60, 217);
  doc.roundedRect(60, 263, 475, 66, 8).fill("#e7f0f4");
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#16394b").text(money(receipt.amount), 80, 286);
  doc.font("Helvetica").fontSize(10).fillColor("#52616a").text(receipt.words, 80, 315, { width: 420 });
  doc.font("Helvetica").fontSize(11).fillColor("#1c2a32").text("Untuk pembayaran", 60, 370);
  doc.font("Helvetica-Bold").fontSize(13).text(receipt.purpose, 60, 395, { width: 475 });
  doc.font("Helvetica").fontSize(10).text(`Invoice: ${receipt.invoiceNumber}`, 60, 437);
  doc.text(`Metode: ${receipt.method}${receipt.bank ? ` • ${receipt.bank}` : ""}`, 60, 455);

  let y = 495;
  const summaryRows: Array<[string, string]> = [["Subtotal", money(receipt.subtotal)]];
  if (numberValue(receipt.discount) > 0) summaryRows.push(["Diskon", money(receipt.discount)]);
  if (numberValue(receipt.tax) > 0) summaryRows.push(["Pajak", money(receipt.tax)]);
  if (numberValue(receipt.cashback) > 0) summaryRows.push(["CASHBACK", money(receipt.cashback)]);
  summaryRows.push(["TOTAL", money(receipt.total)]);
  y = drawSummary(doc, summaryRows, y);
  const includeText = nonEmpty(receipt.includeText) || nonEmpty(company.includeText);
  if (includeText) y = drawInclude(doc, includeText, y + 12);
  const receiptNotes = noteText(company, receipt.notes);
  if (y + noteHeight(doc, receiptNotes) + 125 > 760) {
    doc.addPage();
    drawBrandHeader(doc, company, company.receiptTitle || "KUITANSI", true);
    y = 112;
  }
  y = drawNotes(doc, receiptNotes, y + 2);
  drawSignature(doc, company, y);
  addFooters(doc, company);
  doc.end();
}