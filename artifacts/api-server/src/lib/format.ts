export function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

const ONES = [
  "nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan",
  "sembilan", "sepuluh", "sebelas",
];

function wordsUnderThousand(value: number): string {
  if (value < 12) return ONES[value];
  if (value < 20) return `${ONES[value - 10]} belas`;
  if (value < 100) return `${ONES[Math.floor(value / 10)]} puluh${value % 10 ? ` ${ONES[value % 10]}` : ""}`;
  if (value < 200) return `seratus${value % 100 ? ` ${wordsUnderThousand(value % 100)}` : ""}`;
  return `${ONES[Math.floor(value / 100)]} ratus${value % 100 ? ` ${wordsUnderThousand(value % 100)}` : ""}`;
}

export function terbilang(value: string | number): string {
  let number = Math.floor(numberValue(value));
  if (number === 0) return "Nol Rupiah";
  if (number < 0) return `Minus ${terbilang(-number)}`;
  const groups: Array<[number, string]> = [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ];
  const result: string[] = [];
  for (const [unit, label] of groups) {
    if (number >= unit) {
      const count = Math.floor(number / unit);
      result.push(`${count === 1 && label === "ribu" ? "se" : wordsUnderThousand(count)} ${label}`);
      number %= unit;
    }
  }
  if (number > 0) result.push(wordsUnderThousand(number));
  return `${result.join(" ")} Rupiah`.replace(/\s+/g, " ").replace(/^./, (char) => char.toUpperCase());
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextDocumentNumber(prefix: "INV" | "KWT", numbers: string[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const pattern = new RegExp(`^${prefix}\\/NUF\\/${year}\\/${month}\\/(\\d+)$`);
  const max = numbers.reduce((highest, value) => {
    const match = value.match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}/NUF/${year}/${month}/${String(max + 1).padStart(3, "0")}`;
}