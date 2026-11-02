import assert from "node:assert/strict";
import test from "node:test";
import { invoicePaymentStatusAfterEdit, invoicePaymentSummary } from "./invoice-payment-summary.ts";

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

test("recalculates invoice status after an edited payment drops below the total", () => {
  assert.equal(invoicePaymentStatusAfterEdit("paid", 2_000_000, 1_500_000), "issued");
});

test("keeps an invoice paid when edited payments still cover the total, including overpayment", () => {
  assert.equal(invoicePaymentStatusAfterEdit("issued", 2_000_000, 2_250_000), "paid");
});

test("does not change draft or cancelled invoice states after editing a payment", () => {
  assert.equal(invoicePaymentStatusAfterEdit("draft", 2_000_000, 2_500_000), "draft");
  assert.equal(invoicePaymentStatusAfterEdit("cancelled", 2_000_000, 0), "cancelled");
});
