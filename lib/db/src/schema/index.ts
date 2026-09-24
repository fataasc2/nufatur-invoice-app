import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 120 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("owner"),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companySettings = pgTable("company_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }).notNull(),
  address: text("address").notNull(),
  whatsapp: varchar("whatsapp", { length: 40 }).notNull(),
  email: varchar("email", { length: 160 }).notNull(),
  website: varchar("website", { length: 160 }).notNull(),
  logoDataUrl: text("logo_data_url"),
  signatureDataUrl: text("signature_data_url"),
  invoiceTitle: varchar("invoice_title", { length: 100 }).notNull().default("INVOICE"),
  receiptTitle: varchar("receipt_title", { length: 100 }).notNull().default("KUITANSI"),
  footer: text("footer").notNull().default("Terima kasih telah mempercayakan perjalanan Anda kepada NUFATUR."),
  notes: text("notes").notNull().default("Harap konfirmasi pembayaran setelah transfer."),
  seededAt: timestamp("seeded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  bankName: varchar("bank_name", { length: 120 }).notNull(),
  accountNumber: varchar("account_number", { length: 80 }).notNull(),
  accountName: varchar("account_name", { length: 200 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 40 }).notNull().default("Perusahaan"),
  name: varchar("name", { length: 200 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 40 }),
  email: varchar("email", { length: 160 }),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const departureGroups = pgTable("departure_groups", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  departureDate: date("departure_date").notNull(),
  returnDate: date("return_date"),
  packageName: varchar("package_name", { length: 200 }).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 80 }).notNull().unique(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  reference: text("reference"),
  groupId: integer("group_id").references(() => departureGroups.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerType: varchar("customer_type", { length: 40 }).notNull().default("Perusahaan"),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  customerWhatsapp: varchar("customer_whatsapp", { length: 40 }),
  customerEmail: varchar("customer_email", { length: 160 }),
  customerAddress: text("customer_address"),
  notes: text("notes"),
  discount: numeric("discount", { precision: 16, scale: 2 }).notNull().default("0"),
  additionalCost: numeric("additional_cost", { precision: 16, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 16, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 24 }).notNull().default("issued"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  flight: text("flight"),
  details: text("details"),
  itemDate: date("item_date"),
  quantity: numeric("quantity", { precision: 12, scale: 2 }),
  price: numeric("price", { precision: 16, scale: 2 }),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull().default("0"),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
  bank: varchar("bank", { length: 120 }),
  method: varchar("method", { length: 40 }).notNull().default("Transfer"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 80 }).notNull().unique(),
  paymentId: integer("payment_id").notNull().unique().references(() => payments.id, { onDelete: "cascade" }),
  receiptDate: date("receipt_date").notNull(),
  receivedFrom: varchar("received_from", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
  words: text("words").notNull(),
  purpose: text("purpose").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceTemplates = pgTable("invoice_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  config: jsonb("config").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receiptTemplates = pgTable("receipt_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  config: jsonb("config").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});