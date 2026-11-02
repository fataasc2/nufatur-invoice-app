import assert from "node:assert/strict";
import test from "node:test";
import { validateStandaloneReceiptBank } from "./standalone-receipt-bank.ts";

test("requires a bank name for Transfer receipts", () => {
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", " BSI "), { valid: true, bank: "BSI" });
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", null), {
    valid: false,
    message: "Nama bank wajib diisi untuk metode Transfer Bank.",
  });
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", "  "), {
    valid: false,
    message: "Nama bank wajib diisi untuk metode Transfer Bank.",
  });
});

test("rejects bank names for non-transfer methods", () => {
  for (const method of ["Cash", "QRIS", "Lainnya", null]) {
    assert.deepEqual(validateStandaloneReceiptBank(method, "BSI"), {
      valid: false,
      message: "Nama bank hanya berlaku untuk metode Transfer Bank.",
    });
    assert.deepEqual(validateStandaloneReceiptBank(method, null), { valid: true, bank: null });
  }
});

test("allows a manual bank name while enforcing the database limit", () => {
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", "Bank Contoh"), {
    valid: true,
    bank: "Bank Contoh",
  });
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", "B".repeat(121)), {
    valid: false,
    message: "Nama bank maksimal 120 karakter.",
  });
});

test("rejects non-string bank values", () => {
  assert.deepEqual(validateStandaloneReceiptBank("Transfer", 123), {
    valid: false,
    message: "Nama bank tidak valid.",
  });
});
