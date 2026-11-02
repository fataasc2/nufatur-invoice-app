export type StandaloneReceiptBankValidation =
  | { valid: true; bank: string | null }
  | { valid: false; message: string };

export function validateStandaloneReceiptBank(method: string | null, rawBank: unknown): StandaloneReceiptBankValidation {
  if (rawBank != null && typeof rawBank !== "string") {
    return { valid: false, message: "Nama bank tidak valid." };
  }

  const bank = typeof rawBank === "string" ? rawBank.trim() || null : null;
  if (bank && bank.length > 120) {
    return { valid: false, message: "Nama bank maksimal 120 karakter." };
  }
  if (method === "Transfer" && !bank) {
    return { valid: false, message: "Nama bank wajib diisi untuk metode Transfer Bank." };
  }
  if (method !== "Transfer" && bank) {
    return { valid: false, message: "Nama bank hanya berlaku untuk metode Transfer Bank." };
  }

  return { valid: true, bank };
}
