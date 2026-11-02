export function invoicePaymentSummary(total: number, paid: number): {
  remaining: number;
  overpayment: number;
  isPaid: boolean;
} {
  return {
    remaining: Math.max(0, total - paid),
    overpayment: Math.max(0, paid - total),
    isPaid: paid >= total,
  };
}

export function invoicePaymentStatusAfterEdit(status: string, total: number, paid: number): string {
  if (status === "draft" || status === "cancelled") return status;
  return invoicePaymentSummary(total, paid).isPaid ? "paid" : "issued";
}
