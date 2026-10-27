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
