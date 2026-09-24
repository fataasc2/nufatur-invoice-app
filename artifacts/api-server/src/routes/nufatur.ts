import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  auditLogs,
  bankAccounts,
  companySettings,
  customers,
  departureGroups,
  db,
  invoiceItems,
  invoices,
  payments,
  receipts,
  users,
} from "@workspace/db";
import { clearSession, currentUser, ensureOwnerAccount, requireUser, setSession, verifyPassword } from "../lib/auth";
import { getCompanySettings } from "../lib/company-settings";
import { nextDocumentNumber, numberValue, terbilang, todayIso } from "../lib/format";
import { ensureSeedData } from "../lib/seed";
import { streamInvoicePdf, streamReceiptPdf } from "../lib/pdf";

const router: IRouter = Router();

function text(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const result = value.trim();
  return result || fallback;
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function moneyValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function statusFor(invoice: { status: string; dueDate: string; total: number; paid: number }): string {
  if (invoice.status === "draft") return "DRAFT";
  if (invoice.status === "cancelled") return "DIBATALKAN";
  if (invoice.paid >= invoice.total) return "LUNAS";
  if (invoice.dueDate < todayIso()) return "JATUH TEMPO";
  return "BELUM LUNAS";
}

const invoiceColumns = {
  id: invoices.id,
  number: invoices.number,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  reference: invoices.reference,
  groupId: invoices.groupId,
  customerId: invoices.customerId,
  customerType: invoices.customerType,
  customerName: invoices.customerName,
  customerWhatsapp: invoices.customerWhatsapp,
  customerEmail: invoices.customerEmail,
  customerAddress: invoices.customerAddress,
  notes: invoices.notes,
  discount: invoices.discount,
  additionalCost: invoices.additionalCost,
  tax: invoices.tax,
  status: invoices.status,
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
};

const receiptColumns = {
  id: receipts.id,
  number: receipts.number,
  paymentId: receipts.paymentId,
  receiptDate: receipts.receiptDate,
  receivedFrom: receipts.receivedFrom,
  amount: receipts.amount,
  words: receipts.words,
  purpose: receipts.purpose,
  notes: receipts.notes,
  createdAt: receipts.createdAt,
};

const groupColumns = {
  id: departureGroups.id,
  code: departureGroups.code,
  name: departureGroups.name,
  departureDate: departureGroups.departureDate,
  returnDate: departureGroups.returnDate,
  packageName: departureGroups.packageName,
  notes: departureGroups.notes,
  status: departureGroups.status,
  createdAt: departureGroups.createdAt,
  updatedAt: departureGroups.updatedAt,
};

async function groupRow(id: number) {
  return (await db.select(groupColumns).from(departureGroups).where(eq(departureGroups.id, id)).limit(1))[0] ?? null;
}

async function groupForInvoice(groupId: number | null | undefined) {
  return groupId ? groupRow(groupId) : null;
}

async function invoiceRow(id: number) {
  const row = (await db.select(invoiceColumns).from(invoices).where(eq(invoices.id, id)).limit(1))[0];
  if (!row) return null;
  const includeAudit = await db.select({ metadata: auditLogs.metadata }).from(auditLogs)
    .where(and(eq(auditLogs.entity, "invoice"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.createdAt)).limit(1);
  const metadata = includeAudit[0]?.metadata;
  const includeText = metadata && typeof metadata === "object" && "includeText" in metadata && typeof metadata.includeText === "string"
    ? metadata.includeText
    : "";
  return { ...row, includeText, group: await groupForInvoice(row.groupId) };
}

async function receiptRow(id: number) {
  const row = (await db.select(receiptColumns).from(receipts).where(eq(receipts.id, id)).limit(1))[0];
  return row ? { ...row, includeText: "" } : null;
}

async function receiptForPayment(paymentId: number) {
  const row = (await db.select(receiptColumns).from(receipts).where(eq(receipts.paymentId, paymentId)).limit(1))[0];
  return row ? { ...row, includeText: "" } : null;
}

async function invoiceRecord(id: number) {
  const invoice = await invoiceRow(id);
  if (!invoice) return null;
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.position);
  const invoicePayments = await db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.paymentDate));
  const subtotal = items.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const discount = numberValue(invoice.discount);
  const additionalCost = numberValue(invoice.additionalCost);
  const tax = numberValue(invoice.tax);
  const total = Math.max(0, subtotal - discount + additionalCost + tax);
  const paid = invoicePayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  const remaining = Math.max(0, total - paid);
  const status = statusFor({ status: invoice.status, dueDate: invoice.dueDate, total, paid });
  return {
    ...invoice,
    items,
    payments: invoicePayments,
    subtotal,
    total,
    paid,
    remaining,
    discount,
    additionalCost,
    tax,
    status,
  };
}

async function allInvoiceRecords() {
  const rows = await db.select(invoiceColumns).from(invoices).orderBy(desc(invoices.createdAt));
  const records = await Promise.all(rows.map((row) => invoiceRecord(row.id)));
  return records.filter((record): record is NonNullable<typeof record> => Boolean(record));
}

async function audit(userId: number, action: string, entity: string, entityId?: number, metadata?: unknown): Promise<void> {
  await db.insert(auditLogs).values({ userId, action, entity, entityId, metadata });
}

function guard(handler: (req: Request, res: Response, userId: number) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const userId = await requireUser(req, res);
    if (userId) await handler(req, res, userId);
  };
}

function groupIdValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requiredGroup(value: unknown, res: Response) {
  const groupId = groupIdValue(value);
  if (value != null && value !== "" && groupId == null) {
    res.status(400).json({ message: "Grup keberangkatan tidak valid." });
    return null;
  }
  if (groupId == null) return null;
  const group = await groupRow(groupId);
  if (!group) {
    res.status(400).json({ message: "Grup keberangkatan tidak ditemukan." });
    return null;
  }
  return group;
}

router.post("/auth/login", async (req, res) => {
  const username = text(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const user = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ message: "Username atau password tidak sesuai." });
    return;
  }
  setSession(res, user.id);
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

router.get("/auth/session", async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ message: "Belum masuk." });
    return;
  }
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

router.post("/auth/logout", (req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get("/groups", guard(async (req, res) => {
  const search = text(req.query.search).toLowerCase();
  const status = text(req.query.status, "Semua");
  const rows = await db.select(groupColumns).from(departureGroups).orderBy(desc(departureGroups.departureDate), desc(departureGroups.createdAt));
  const groups = rows.filter((group) => {
    const matchesSearch = !search || `${group.code} ${group.name} ${group.packageName}`.toLowerCase().includes(search);
    const matchesStatus = status === "Semua" || group.status === status;
    return matchesSearch && matchesStatus;
  });
  res.json({ groups });
}));

router.get("/groups/:id", guard(async (req, res) => {
  const group = await groupRow(Number(req.params.id));
  if (!group) {
    res.status(404).json({ message: "Grup keberangkatan tidak ditemukan." });
    return;
  }
  const records = (await allInvoiceRecords()).filter((invoice) => invoice.groupId === group.id);
  res.json({
    group: {
      ...group,
      invoiceCount: records.length,
      invoiceTotal: records.reduce((sum, invoice) => sum + invoice.total, 0),
      paymentTotal: records.reduce((sum, invoice) => sum + invoice.paid, 0),
      remainingTotal: records.reduce((sum, invoice) => sum + invoice.remaining, 0),
      invoices: records,
    },
  });
}));

router.post("/groups", guard(async (req, res, userId) => {
  const body = req.body ?? {};
  const code = text(body.code);
  const name = text(body.name);
  const departureDate = text(body.departureDate);
  const returnDate = optionalText(body.returnDate);
  const packageName = text(body.packageName);
  const status = text(body.status, "active");
  if (!code || !name || !departureDate || !packageName) {
    res.status(400).json({ message: "Kode, nama group, tanggal keberangkatan, dan paket wajib diisi." });
    return;
  }
  if (returnDate && returnDate < departureDate) {
    res.status(400).json({ message: "Tanggal pulang tidak boleh sebelum tanggal keberangkatan." });
    return;
  }
  if (!["active", "completed", "cancelled"].includes(status)) {
    res.status(400).json({ message: "Status group tidak valid." });
    return;
  }
  try {
    const group = (await db.insert(departureGroups).values({ code, name, departureDate, returnDate, packageName, notes: optionalText(body.notes), status }).returning(groupColumns))[0];
    await audit(userId, "create", "departure_group", group.id);
    res.status(201).json({ group });
  } catch (error) {
    if (String(error).toLowerCase().includes("duplicate")) {
      res.status(409).json({ message: "Kode group sudah digunakan." });
      return;
    }
    throw error;
  }
}));

router.patch("/groups/:id", guard(async (req, res, userId) => {
  const id = Number(req.params.id);
  const existing = await groupRow(id);
  if (!existing) {
    res.status(404).json({ message: "Grup keberangkatan tidak ditemukan." });
    return;
  }
  const body = req.body ?? {};
  const departureDate = text(body.departureDate, existing.departureDate);
  const returnDate = optionalText(body.returnDate);
  const status = text(body.status, existing.status);
  if (returnDate && returnDate < departureDate) {
    res.status(400).json({ message: "Tanggal pulang tidak boleh sebelum tanggal keberangkatan." });
    return;
  }
  if (!["active", "completed", "cancelled"].includes(status)) {
    res.status(400).json({ message: "Status group tidak valid." });
    return;
  }
  const group = (await db.update(departureGroups).set({
    code: text(body.code, existing.code),
    name: text(body.name, existing.name),
    departureDate,
    returnDate,
    packageName: text(body.packageName, existing.packageName),
    notes: optionalText(body.notes),
    status,
    updatedAt: new Date(),
  }).where(eq(departureGroups.id, id)).returning(groupColumns))[0];
  await audit(userId, "update", "departure_group", id);
  res.json({ group });
}));

router.delete("/groups/:id", guard(async (req, res, userId) => {
  const id = Number(req.params.id);
  const existingInvoice = (await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.groupId, id)).limit(1))[0];
  if (existingInvoice) {
    res.status(409).json({ message: "Group masih digunakan oleh invoice dan tidak dapat dihapus." });
    return;
  }
  const deleted = await db.delete(departureGroups).where(eq(departureGroups.id, id)).returning({ id: departureGroups.id });
  if (!deleted[0]) {
    res.status(404).json({ message: "Grup keberangkatan tidak ditemukan." });
    return;
  }
  await audit(userId, "delete", "departure_group", id);
  res.status(204).end();
}));

router.get("/settings", guard(async (_req, res) => {
  const settings = await getCompanySettings();
  const banks = await db.select().from(bankAccounts).orderBy(desc(bankAccounts.isPrimary), bankAccounts.bankName);
  res.json({ settings, banks });
}));

router.patch("/settings", guard(async (req, res, userId) => {
  const body = req.body ?? {};
  const values = {
    companyName: text(body.companyName, "PT Nurul Fajar Abinaya"),
    brandName: text(body.brandName, "NUFATUR"),
    address: text(body.address),
    whatsapp: text(body.whatsapp),
    email: text(body.email),
    website: text(body.website),
    logoDataUrl: optionalText(body.logoDataUrl),
    signatureDataUrl: optionalText(body.signatureDataUrl),
    invoiceTitle: text(body.invoiceTitle, "INVOICE"),
    receiptTitle: text(body.receiptTitle, "KUITANSI"),
    footer: text(body.footer),
    notes: text(body.notes),
    updatedAt: new Date(),
  };
  await db.update(companySettings).set(values).where(eq(companySettings.id, 1));
  const settings = await getCompanySettings();
  await audit(userId, "update", "company_settings", 1);
  res.json({ settings });
}));

router.post("/settings/banks", guard(async (req, res) => {
  const body = req.body ?? {};
  const bank = (await db.insert(bankAccounts).values({
    bankName: text(body.bankName),
    accountNumber: text(body.accountNumber),
    accountName: text(body.accountName),
    isPrimary: Boolean(body.isPrimary),
  }).returning())[0];
  res.status(201).json({ bank });
}));

router.patch("/settings/banks/:id", guard(async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const bank = (await db.update(bankAccounts).set({
    bankName: text(body.bankName),
    accountNumber: text(body.accountNumber),
    accountName: text(body.accountName),
    isPrimary: Boolean(body.isPrimary),
  }).where(eq(bankAccounts.id, id)).returning())[0];
  if (!bank) {
    res.status(404).json({ message: "Rekening tidak ditemukan." });
    return;
  }
  res.json({ bank });
}));

router.delete("/settings/banks/:id", guard(async (req, res) => {
  await db.delete(bankAccounts).where(eq(bankAccounts.id, Number(req.params.id)));
  res.status(204).end();
}));

router.get("/dashboard", guard(async (_req, res) => {
  const records = await allInvoiceRecords();
  const total = records.reduce((sum, row) => sum + row.total, 0);
  const paid = records.reduce((sum, row) => sum + row.paid, 0);
  res.json({
    counts: {
      all: records.length,
      unpaid: records.filter((row) => row.status === "BELUM LUNAS").length,
      overdue: records.filter((row) => row.status === "JATUH TEMPO").length,
      paid: records.filter((row) => row.status === "LUNAS").length,
    },
    totals: { billed: total, paid, remaining: Math.max(0, total - paid) },
    recent: records.slice(0, 5),
  });
}));

router.get("/invoices", guard(async (req, res) => {
  const search = text(req.query.search);
  const filter = text(req.query.filter, "Semua");
  let records = await allInvoiceRecords();
  if (search) {
    const lower = search.toLowerCase();
    records = records.filter((row) => `${row.number} ${row.customerName} ${row.reference ?? ""}`.toLowerCase().includes(lower));
  }
  if (filter !== "Semua") records = records.filter((row) => row.status === filter.toUpperCase());
  res.json({ invoices: records });
}));

router.get("/invoices/:id", guard(async (req, res) => {
  const record = await invoiceRecord(Number(req.params.id));
  if (!record) {
    res.status(404).json({ message: "Invoice tidak ditemukan." });
    return;
  }
  res.json({ invoice: record });
}));

router.post("/invoices", guard(async (req, res, userId) => {
  const body = req.body ?? {};
  const group = await requiredGroup(body.groupId, res);
  if (res.headersSent) return;
  const existingNumbers = (await db.select({ number: invoices.number }).from(invoices)).map((row) => row.number);
  const invoiceNumber = text(body.number, nextDocumentNumber("INV", existingNumbers));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!text(body.customerName) || items.length === 0) {
    res.status(400).json({ message: "Nomor, customer, dan minimal satu item wajib diisi." });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const customer = (await tx.insert(customers).values({
      kind: text(body.customerType, "Perusahaan"),
      name: text(body.customerName),
      whatsapp: optionalText(body.customerWhatsapp),
      email: optionalText(body.customerEmail),
      address: optionalText(body.customerAddress),
    }).returning())[0];
    const invoice = (await tx.insert(invoices).values({
      number: invoiceNumber,
      invoiceDate: text(body.invoiceDate, todayIso()),
      dueDate: text(body.dueDate, todayIso()),
      reference: optionalText(body.reference),
      groupId: group?.id ?? null,
      customerId: customer.id,
      customerType: text(body.customerType, "Perusahaan"),
      customerName: text(body.customerName),
      customerWhatsapp: optionalText(body.customerWhatsapp),
      customerEmail: optionalText(body.customerEmail),
      customerAddress: optionalText(body.customerAddress),
      notes: optionalText(body.notes),
      discount: String(moneyValue(body.discount)),
      additionalCost: String(moneyValue(body.additionalCost)),
      tax: String(moneyValue(body.tax)),
      status: text(body.status, "issued"),
    }).returning(invoiceColumns))[0];
    await tx.insert(invoiceItems).values(items.map((item: Record<string, unknown>, position: number) => {
      const quantity = item.quantity === "" || item.quantity == null ? null : moneyValue(item.quantity);
      const price = item.price === "" || item.price == null ? null : moneyValue(item.price);
      const amount = quantity != null && price != null ? quantity * price : moneyValue(item.amount);
      return {
        invoiceId: invoice.id,
        position,
        description: text(item.description, "Item invoice"),
        flight: optionalText(item.flight),
        details: optionalText(item.details),
        itemDate: group?.departureDate ?? optionalText(item.itemDate),
        quantity: quantity == null ? null : String(quantity),
        price: price == null ? null : String(price),
        amount: String(amount),
      };
    }));
    return invoice;
  });
  await audit(userId, "create", "invoice", created.id, { includeText: text(body.includeText) });
  res.status(201).json({ invoice: await invoiceRecord(created.id) });
}));

router.put("/invoices/:id", guard(async (req, res, userId) => {
  const id = Number(req.params.id);
  const existing = await invoiceRecord(id);
  if (!existing) {
    res.status(404).json({ message: "Invoice tidak ditemukan." });
    return;
  }
  const body = req.body ?? {};
  const group = await requiredGroup(body.groupId, res);
  if (res.headersSent) return;
  const items = Array.isArray(body.items) ? body.items : [];
  await db.transaction(async (tx) => {
    await tx.update(invoices).set({
      number: text(body.number, existing.number),
      invoiceDate: text(body.invoiceDate, existing.invoiceDate),
      dueDate: text(body.dueDate, existing.dueDate),
      reference: optionalText(body.reference),
      groupId: group?.id ?? null,
      customerType: text(body.customerType, existing.customerType),
      customerName: text(body.customerName, existing.customerName),
      customerWhatsapp: optionalText(body.customerWhatsapp),
      customerEmail: optionalText(body.customerEmail),
      customerAddress: optionalText(body.customerAddress),
      notes: optionalText(body.notes),
      discount: String(moneyValue(body.discount)),
      additionalCost: String(moneyValue(body.additionalCost)),
      tax: String(moneyValue(body.tax)),
      status: text(body.status, existing.status.toLowerCase()),
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    if (items.length > 0) {
      await tx.insert(invoiceItems).values(items.map((item: Record<string, unknown>, position: number) => {
        const quantity = item.quantity === "" || item.quantity == null ? null : moneyValue(item.quantity);
        const price = item.price === "" || item.price == null ? null : moneyValue(item.price);
        return {
          invoiceId: id,
          position,
          description: text(item.description, "Item invoice"),
          flight: optionalText(item.flight),
          details: optionalText(item.details),
          itemDate: group?.departureDate ?? optionalText(item.itemDate),
          quantity: quantity == null ? null : String(quantity),
          price: price == null ? null : String(price),
          amount: String(quantity != null && price != null ? quantity * price : moneyValue(item.amount)),
        };
      }));
    }
  });
  await audit(userId, "update", "invoice", id, { includeText: text(body.includeText) });
  res.json({ invoice: await invoiceRecord(id) });
}));

router.delete("/invoices/:id", guard(async (req, res, userId) => {
  const id = Number(req.params.id);
  await db.delete(invoices).where(eq(invoices.id, id));
  await audit(userId, "delete", "invoice", id);
  res.status(204).end();
}));

router.post("/invoices/:id/payments", guard(async (req, res, userId) => {
  const invoiceId = Number(req.params.id);
  if (!(await invoiceRecord(invoiceId))) {
    res.status(404).json({ message: "Invoice tidak ditemukan." });
    return;
  }
  const body = req.body ?? {};
  const payment = (await db.insert(payments).values({
    invoiceId,
    paymentDate: text(body.paymentDate, todayIso()),
    description: text(body.description, "Pembayaran"),
    amount: String(moneyValue(body.amount)),
    bank: optionalText(body.bank),
    method: text(body.method, "Transfer"),
    notes: optionalText(body.notes),
  }).returning())[0];
  await audit(userId, "create", "payment", payment.id, { invoiceId });
  res.status(201).json({ payment, invoice: await invoiceRecord(invoiceId) });
}));

router.get("/payments", guard(async (req, res) => {
  const search = text(req.query.search).toLowerCase();
  const rows = await db.select().from(payments).orderBy(desc(payments.paymentDate));
  const invoiceRows = await db.select({ id: invoices.id, number: invoices.number, customerName: invoices.customerName }).from(invoices);
  const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));
  const result = rows.map((payment) => ({ ...payment, invoice: invoiceMap.get(payment.invoiceId) })).filter((payment) => {
    if (!search) return true;
    return `${payment.description} ${payment.invoice?.number ?? ""} ${payment.invoice?.customerName ?? ""}`.toLowerCase().includes(search);
  });
  res.json({ payments: result });
}));

router.post("/payments/:id/receipt", guard(async (req, res, userId) => {
  const paymentId = Number(req.params.id);
  const payment = (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
  if (!payment) {
    res.status(404).json({ message: "Pembayaran tidak ditemukan." });
    return;
  }
  const existing = await receiptForPayment(paymentId);
  if (existing) {
    res.json({ receipt: existing });
    return;
  }
  const invoice = await invoiceRecord(payment.invoiceId);
  if (!invoice) {
    res.status(404).json({ message: "Invoice tidak ditemukan." });
    return;
  }
  const numbers = (await db.select({ number: receipts.number }).from(receipts)).map((row) => row.number);
  const body = req.body ?? {};
  const receipt = (await db.insert(receipts).values({
    number: text(body.number, nextDocumentNumber("KWT", numbers)),
    paymentId,
    receiptDate: text(body.receiptDate, todayIso()),
    receivedFrom: text(body.receivedFrom, invoice.customerName),
    amount: payment.amount,
    words: terbilang(payment.amount),
    purpose: text(body.purpose, payment.description),
    notes: optionalText(body.notes),
  }).returning(receiptColumns))[0];
  await audit(userId, "create", "receipt", receipt.id, { paymentId });
  res.status(201).json({ receipt });
}));

router.get("/receipts", guard(async (_req, res) => {
  const rows = await db.select(receiptColumns).from(receipts).orderBy(desc(receipts.receiptDate));
  const paymentRows = await db.select({ id: payments.id, invoiceId: payments.invoiceId }).from(payments);
  const invoiceRows = await db.select({ id: invoices.id, number: invoices.number, groupId: invoices.groupId }).from(invoices);
  const groupRows = await db.select(groupColumns).from(departureGroups);
  const paymentMap = new Map(paymentRows.map((payment) => [payment.id, payment]));
  const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));
  const groupMap = new Map(groupRows.map((group) => [group.id, group]));
  res.json({ receipts: rows.map((receipt) => { const invoice = invoiceMap.get(paymentMap.get(receipt.paymentId)?.invoiceId ?? -1); return { ...receipt, includeText: "", invoice, group: invoice?.groupId ? groupMap.get(invoice.groupId) ?? null : null }; }) });
}));

router.get("/export/invoices.csv", guard(async (_req, res) => {
  const records = await allInvoiceRecords();
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["Nomor Invoice", "Tanggal", "Customer", "Total", "Terbayar", "Sisa", "Status"].map(escape).join(","),
    ...records.map((row) => [row.number, row.invoiceDate, row.customerName, row.total, row.paid, row.remaining, row.status].map(escape).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"nufatur-invoices.csv\"");
  res.send(`\ufeff${csv}`);
}));

router.get("/invoices/:id/pdf", guard(async (req, res) => {
  const invoice = await invoiceRecord(Number(req.params.id));
  const company = await getCompanySettings();
  if (!invoice || !company) {
    res.status(404).json({ message: "Data invoice tidak ditemukan." });
    return;
  }
  const bank = (await db.select().from(bankAccounts).where(eq(bankAccounts.isPrimary, true)).limit(1))[0];
  streamInvoicePdf(res, { ...company, notes: `${bank?.bankName ?? ""} ${bank?.accountNumber ?? ""} a.n. ${bank?.accountName ?? ""}` }, invoice, req.query.inline === "1");
}));

router.get("/receipts/:id/pdf", guard(async (req, res) => {
  const receipt = await receiptRow(Number(req.params.id));
  const company = await getCompanySettings();
  if (!receipt || !company) {
    res.status(404).json({ message: "Data kuitansi tidak ditemukan." });
    return;
  }
  const payment = (await db.select().from(payments).where(eq(payments.id, receipt.paymentId)).limit(1))[0];
  const invoice = payment ? await invoiceRecord(payment.invoiceId) : null;
  if (!payment || !invoice) {
    res.status(404).json({ message: "Pembayaran terkait tidak ditemukan." });
    return;
  }
  streamReceiptPdf(res, {
    ...company,
    includeText: company.includeText,
    pdfNotes: company.pdfNotes,
  }, {
    ...receipt,
    invoiceNumber: invoice.number,
    method: payment.method,
    bank: payment.bank,
    includeText: receipt.includeText || invoice.includeText || company.includeText,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    cashback: invoice.additionalCost,
    total: invoice.total,
    paid: invoice.paid,
    remaining: invoice.remaining,
    status: invoice.status,
    departureDate: invoice.group?.departureDate,
    groupName: invoice.group ? `${invoice.group.name} • ${invoice.group.packageName}` : null,
  }, req.query.inline === "1");
}));

export async function initializeAppData(): Promise<void> {
  await ensureOwnerAccount();
  await ensureSeedData();
}

export default router;