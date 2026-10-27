import assert from "node:assert/strict";
import test from "node:test";
import { invoicePaymentSummary } from "./invoice-payment-summary.ts";

test("keeps the unpaid balance when payment is below the invoice total", () => {
  assert.deepEqual(invoicePaymentSummary(2_000_000, 1_500_000), {
    remaining: 500_000,
    overpayment: 0,
    isPaid: false,
  });
});

test("marks an invoice paid when payment exactly covers its total", () => {
  assert.deepEqual(invoicePaymentSummary(2_000_000, 2_000_000), {
    remaining: 0,
    overpayment: 0,
    isPaid: true,
  });
});

test("keeps the invoice total covered and reports the excess separately", () => {
  assert.deepEqual(invoicePaymentSummary(2_000_000, 2_250_000), {
    remaining: 0,
    overpayment: 250_000,
    isPaid: true,
  });
});
