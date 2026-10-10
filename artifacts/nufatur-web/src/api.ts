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
  cashback?: string | number | null;
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
  financialSummary?: {
    customerPaymentTotal: number;
    operationalCostTotal: number;
    vendorPaidTotal: number;
    vendorRemainingTotal: number;
    availableAllocationTotal: number;
    unallocatedFunds: number;
    shortfallTotal: number;
  };
  expenses?: OperationalExpense[];
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
  discountPercent: number;
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

export type OperationalExpense = {
  id: number;
  number: string;
  groupId?: number | null;
  group?: DepartureGroup | null;
  category: string;
  name: string;
  vendor: string;
  billNumber?: string | null;
  totalAmount: number;
  billDate: string;
  dueDate?: string | null;
  notes?: string | null;
  status: string;
  allocatedAmount: number;
  usedAmount: number;
  remainingBalance: number;
  availableAllocation: number;
  shortfall: number;
  allocations: Array<{ id: number; amount: number; allocationDate: string; notes?: string | null; paymentId: number; paymentNumber?: string | null; isActive: boolean; available: number; used: number; }>;
  vendorPayments: Array<{ id: number; amount: number; paymentDate: string; method: string; reference?: string | null; notes?: string | null; status: string; allocationId?: number | null; }>;
};

export type OperationalFinanceSummary = {
  totalCustomerPayments: number;
  totalUnallocatedFunds: number;
  totalAllocatedAvailable: number;
  totalOperationalCosts: number;
  totalVendorPayments: number;
  totalVendorRemaining: number;
  totalShortfall: number;
  dueSoonCount: number;
  overdueCount: number;
  expenses: OperationalExpense[];
};

export type OperationalFundSource = {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  groupId: number | null;
  group: DepartureGroup | null;
  paymentDate: string;
  description: string;
  amount: number;
  allocatedAmount: number;
  availableAmount: number;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

const API_REQUEST_TIMEOUT_MS = 20_000;

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(options?.signal?.reason);
  if (options?.signal?.aborted) {
    abortFromCaller();
  } else {
    options?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
      credentials: "same-origin",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(typeof payload.message === "string" ? payload.message : "Terjadi kesalahan.", response.status);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted && !options?.signal?.aborted) {
      throw new Error("Server tidak merespons. Periksa koneksi lalu coba lagi.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export const parseMoneyInput = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const decimal = /^-?\d+(?:\.\d{1,2})?$/.exec(raw);
  if (decimal) return Math.round(Number(raw));

  const westernGroupedDecimal = /^-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.exec(raw);
  if (westernGroupedDecimal) return Math.round(Number(raw.replaceAll(",", "")));

  const indonesianGroupedDecimal = /^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.exec(raw);
  if (indonesianGroupedDecimal) return Math.round(Number(raw.replaceAll(".", "").replace(",", ".")));

  const digits = raw.replace(/[^0-9-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeMoneyInputValue = (value: string | number | null | undefined): string =>
  value == null || String(value).trim() === "" ? "" : String(parseMoneyInput(value));

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(parseMoneyInput(value));

export const formatMoneyInput = (value: string | number | null | undefined): string => {
  const raw = String(value ?? "");
  if (!raw) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(parseMoneyInput(raw));
};

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "-";

export const today = () => new Date().toISOString().slice(0, 10);