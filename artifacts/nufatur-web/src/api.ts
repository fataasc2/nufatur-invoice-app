export type User = { id: number; username: string; displayName: string; role: string };
export type Item = {
  id?: number;
  description: string;
  flight?: string | null;
  details?: string | null;
  itemDate?: string | null;
  quantity?: string | null;
  price?: string | null;
  amount: string | number;
};
export type Payment = {
  id: number;
  invoiceId: number;
  paymentDate: string;
  description: string;
  amount: string;
  bank?: string | null;
  method: string;
  notes?: string | null;
  invoice?: { id: number; number: string; customerName: string };
};
export type DepartureGroup = {
  id: number;
  code: string;
  name: string;
  departureDate: string;
  returnDate?: string | null;
  packageName: string;
  notes?: string | null;
  status: string;
};
export type DepartureGroupDetail = DepartureGroup & {
  invoiceCount: number;
  invoiceTotal: number;
  paymentTotal: number;
  remainingTotal: number;
  invoices: Invoice[];
};
export type Invoice = {
  id: number;
  number: string;
  invoiceDate: string;
  dueDate: string;
  reference?: string | null;
    groupId?: number | null;
    group?: DepartureGroup | null;
  customerType: string;
  customerName: string;
  customerWhatsapp?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  notes?: string | null;
  includeText: string;
  items: Item[];
  payments: Payment[];
  subtotal: number;
  discount: number;
  additionalCost: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  status: string;
};
export type Receipt = {
  id: number;
  number: string;
  paymentId: number;
  receiptDate: string;
  receivedFrom: string;
  amount: string;
  words: string;
  purpose: string;
  notes?: string | null;
  includeText: string;
  invoice?: { id: number; number: string };
  group?: DepartureGroup | null;
};
export type Settings = {
  id: number;
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
  pdfNotes: string;
  invoiceTitle: string;
  receiptTitle: string;
  footer: string;
  notes: string;
};
export type Bank = { id: number; bankName: string; accountNumber: string; accountName: string; isPrimary: boolean };
export type Dashboard = {
  counts: { all: number; unpaid: number; overdue: number; paid: number };
  totals: { billed: number; paid: number; remaining: number };
  recent: Invoice[];
};

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(typeof payload.message === "string" ? payload.message : "Terjadi kesalahan.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
export const parseMoneyInput = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = String(value ?? "").replace(/[^0-9-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoneyInput = (value: string | number | null | undefined): string => {
  const raw = String(value ?? "");
  if (!raw) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(parseMoneyInput(raw));
};

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "-";

export const today = () => new Date().toISOString().slice(0, 10);