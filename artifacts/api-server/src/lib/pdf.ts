import PDFDocument from "pdfkit";
import type { Response } from "express";
import { money, numberValue, terbilang } from "./format";

type PdfCompany = {
  companyName: string;
  brandName: string;
  address: string;
  whatsapp: string;
  email: string;
  website: string;
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
  footer: string;
  notes: string;
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

function addLogo(doc: PDFKit.PDFDocument, company: PdfCompany, x: number, y: number): void {
  if (company.logoDataUrl?.startsWith("data:image/")) {
    try {
      const encoded = company.logoDataUrl.split(",")[1];
      if (encoded) doc.image(Buffer.from(encoded, "base64"), x, y, { fit: [120, 42] });
    } catch {
      doc.fontSize(22).fillColor("#0f5a78").font("Helvetica-Bold").text(company.brandName, x, y);
    }
  } else {
    doc.fontSize(22).fillColor("#0f5a78").font("Helvetica-Bold").text(company.brandName, x, y);
  }
}

function line(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(42, y).lineTo(553, y).strokeColor("#d5dde2").lineWidth(0.8).stroke();
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 150): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#234252").text(label, x, y, { width });
  doc.font("Helvetica").fillColor("#1c2a32").text(value || "-", x, y + 12, { width });
}

export function streamInvoicePdf(res: Response, company: PdfCompany, invoice: PdfInvoice, inline = false): void {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${invoice.number.replace(/[^a-z0-9/_-]/gi, "_")}.pdf"`);
  doc.pipe(res);
  addLogo(doc, company, 42, 42);
  doc.font("Helvetica").fontSize(8).fillColor("#52616a").text(company.companyName, 42, 88);
  doc.text(company.address, 42, 101, { width: 230, lineGap: 2 });
  doc.text(`WhatsApp: ${company.whatsapp}  •  ${company.email}`, 42, 137);
  doc.text(company.website, 42, 150);
  doc.font("Helvetica-Bold").fontSize(25).fillColor("#16394b").text("INVOICE", 366, 44, { align: "right" });
  labelValue(doc, "Invoice Date", invoice.invoiceDate, 366, 82, 145);
  labelValue(doc, "Invoice Number", invoice.number, 366, 116, 145);
  labelValue(doc, "Reference", invoice.reference ?? "-", 366, 150, 145);
  line(doc, 180);
  labelValue(doc, "BILL TO", invoice.customerName, 42, 196, 230);
  doc.fontSize(8).font("Helvetica").fillColor("#52616a").text(`${invoice.customerType}${invoice.customerAddress ? ` • ${invoice.customerAddress}` : ""}`, 42, 225, { width: 230 });
  labelValue(doc, "DUE DATE", invoice.dueDate, 366, 196, 145);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(invoice.status === "LUNAS" ? "#16835b" : invoice.status === "JATUH TEMPO" ? "#ba5b17" : "#234252").text(invoice.status, 366, 230);

  let y = 268;
  const tableX = [42, 250, 326, 382, 448, 553];
  doc.rect(42, y, 511, 22).fill("#e7f0f4");
  ["DESCRIPTION", "FARE / PRICE", "QTY", "DATE", "TOTAL"].forEach((header, index) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text(header, tableX[index] + 5, y + 7, { width: tableX[index + 1] - tableX[index] - 10, align: index === 4 ? "right" : "left" });
  });
  y += 22;
  invoice.items.forEach((item) => {
    const text = [item.description, item.flight, item.details].filter(Boolean).join("\n");
    const height = Math.max(34, doc.heightOfString(text, { width: 196 }) + 20);
    doc.rect(42, y, 511, height).strokeColor("#cad6dc").stroke();
    for (let index = 1; index < tableX.length - 1; index++) doc.moveTo(tableX[index], y).lineTo(tableX[index], y + height).strokeColor("#cad6dc").stroke();
    doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(text, 48, y + 8, { width: 196 });
    doc.text(item.price ? money(item.price) : "-", 255, y + 8, { width: 66, align: "right" });
    doc.text(item.quantity ?? "-", 331, y + 8, { width: 46, align: "center" });
    doc.text(item.itemDate ?? "-", 387, y + 8, { width: 56, align: "center" });
    doc.font("Helvetica-Bold").text(money(item.amount), 453, y + 8, { width: 94, align: "right" });
    y += height;
  });
  doc.rect(42, y, 511, 23).fill("#f5f8f9");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#244b5e").text("TOTAL INVOICE", 330, y + 7);
  doc.text(money(invoice.total), 453, y + 7, { width: 94, align: "right" });
  y += 37;
  doc.rect(42, y, 511, 22).fill("#e7f0f4");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text("PAYMENT DETAIL", 48, y + 7);
  y += 22;
  invoice.payments.forEach((payment) => {
    doc.rect(42, y, 511, 23).strokeColor("#cad6dc").stroke();
    doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(payment.description, 48, y + 7, { width: 180 });
    doc.text(payment.paymentDate, 300, y + 7, { width: 70 });
    doc.text(payment.bank ?? payment.method, 380, y + 7, { width: 70 });
    doc.font("Helvetica-Bold").text(money(payment.amount), 453, y + 7, { width: 94, align: "right" });
    y += 23;
  });
  const summaries: Array<[string, string]> = [
    ["TOTAL PEMBAYARAN", money(invoice.paid)],
    ["SISA PEMBAYARAN", money(invoice.remaining)],
  ];
  summaries.forEach(([label, value]) => {
    doc.rect(42, y, 511, 22).fill("#fbf3c4");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#244b5e").text(label, 330, y + 7);
    doc.text(value, 453, y + 7, { width: 94, align: "right" });
    y += 22;
  });
  y += 18;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#234252").text("PEMBAYARAN MELALUI", 42, y);
  doc.font("Helvetica").fontSize(8).fillColor("#1c2a32").text(company.notes, 42, y + 15, { width: 511 });
  y += 42;
  doc.font("Helvetica-Bold").fontSize(9).text("CATATAN / PERHATIAN", 42, y);
  doc.font("Helvetica").fontSize(8).text(invoice.notes || company.footer, 42, y + 15, { width: 511 });
  doc.fontSize(7).fillColor("#6b7d86").text(company.footer, 42, 780, { width: 511, align: "center" });
  doc.end();
}

export function streamReceiptPdf(res: Response, company: PdfCompany, receipt: {
  number: string; receiptDate: string; receivedFrom: string; amount: string; words: string; purpose: string; invoiceNumber: string; method: string; bank?: string | null; notes?: string | null;
}, inline = false): void {
  const doc = new PDFDocument({ size: "A4", margin: 60 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${receipt.number.replace(/[^a-z0-9/_-]/gi, "_")}.pdf"`);
  doc.pipe(res);
  addLogo(doc, company, 60, 58);
  doc.fontSize(9).font("Helvetica").fillColor("#52616a").text(company.companyName, 60, 106);
  doc.text(company.address, 60, 120, { width: 260, lineGap: 2 });
  doc.font("Helvetica-Bold").fontSize(25).fillColor("#16394b").text("KUITANSI", 370, 63, { align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#52616a").text(`No. ${receipt.number}`, 370, 102, { align: "right" });
  doc.text(`Tanggal: ${receipt.receiptDate}`, 370, 117, { align: "right" });
  doc.moveTo(60, 170).lineTo(535, 170).strokeColor("#cad6dc").stroke();
  doc.font("Helvetica").fontSize(12).fillColor("#1c2a32").text("Telah diterima dari", 60, 215);
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#16394b").text(receipt.receivedFrom, 60, 242);
  doc.roundedRect(60, 288, 475, 66, 8).fill("#e7f0f4");
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#16394b").text(money(receipt.amount), 80, 311);
  doc.font("Helvetica").fontSize(10).fillColor("#52616a").text(receipt.words, 80, 340, { width: 420 });
  doc.font("Helvetica").fontSize(11).fillColor("#1c2a32").text("Untuk pembayaran", 60, 395);
  doc.font("Helvetica-Bold").fontSize(13).text(receipt.purpose, 60, 420, { width: 475 });
  doc.font("Helvetica").fontSize(10).text(`Invoice: ${receipt.invoiceNumber}`, 60, 462);
  doc.text(`Metode: ${receipt.method}${receipt.bank ? ` • ${receipt.bank}` : ""}`, 60, 480);
  if (receipt.notes) doc.text(`Catatan: ${receipt.notes}`, 60, 520, { width: 475 });
  doc.fontSize(9).fillColor("#52616a").text(company.companyName, 350, 650, { align: "center", width: 150 });
  if (company.signatureDataUrl?.startsWith("data:image/")) {
    try {
      const encoded = company.signatureDataUrl.split(",")[1];
      if (encoded) doc.image(Buffer.from(encoded, "base64"), 350, 555, { fit: [150, 80] });
    } catch {
      // Keep the receipt usable if a legacy signature asset is invalid.
    }
  }
  doc.fontSize(7).fillColor("#6b7d86").text(company.footer, 60, 760, { width: 475, align: "center" });
  doc.end();
}