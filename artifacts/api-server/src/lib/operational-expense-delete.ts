export type ExpenseDeleteResult =
  | { deleted: true; number: string }
  | { deleted: false; status: 400 | 404 | 409; message: string };

export type ExpenseDeleteOperations = {
  lockFinance: () => Promise<void>;
  lockExpense: (id: number) => Promise<void>;
  findExpense: (id: number) => Promise<{ number: string } | undefined>;
  hasAllocations: (id: number) => Promise<boolean>;
  hasVendorPayments: (id: number) => Promise<boolean>;
  deleteExpense: (id: number) => Promise<boolean>;
  writeAudit: (userId: number, id: number, number: string) => Promise<void>;
};

export function isOperationalFinanceOwner(role: string): boolean {
  return role === "owner";
}

export function operationalFinanceDeleteAccess(role: string | null): 401 | 403 | null {
  if (role === null) return 401;
  return isOperationalFinanceOwner(role) ? null : 403;
}

export async function deleteOperationalExpense(
  id: number,
  userId: number,
  operations: ExpenseDeleteOperations,
): Promise<ExpenseDeleteResult> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { deleted: false, status: 400, message: "ID tagihan operasional tidak valid." };
  }

  await operations.lockFinance();
  await operations.lockExpense(id);

  const expense = await operations.findExpense(id);
  if (!expense) {
    return { deleted: false, status: 404, message: "Tagihan operasional tidak ditemukan." };
  }

  const hasAllocations = await operations.hasAllocations(id);
  const hasVendorPayments = await operations.hasVendorPayments(id);
  if (hasAllocations || hasVendorPayments) {
    const dependencies = [
      hasAllocations ? "histori alokasi dana" : "",
      hasVendorPayments ? "histori pembayaran vendor" : "",
    ].filter(Boolean).join(" dan ");
    return {
      deleted: false,
      status: 409,
      message: `Tagihan ${expense.number} tidak dapat dihapus karena masih memiliki ${dependencies}. Selesaikan atau reversal transaksi melalui detail tagihan; tagihan dengan histori transaksi tetap disimpan sebagai arsip.`,
    };
  }

  if (!await operations.deleteExpense(id)) {
    return { deleted: false, status: 404, message: "Tagihan operasional tidak ditemukan." };
  }

  await operations.writeAudit(userId, id, expense.number);
  return { deleted: true, number: expense.number };
}
