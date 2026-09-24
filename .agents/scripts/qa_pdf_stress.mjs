import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3001/api";
const username = process.env.QA_USERNAME ?? "nufatur";
const password = process.env.QA_PASSWORD;
const outputDir = path.resolve(".agents/outputs/qa-pdf-stress");
const prefix = "TEST-QA-";

const longInclude = Array.from({ length: 9 }, (_, index) => `Include layanan pengujian ${index + 1}: tiket, hotel, transportasi, handling, dan pendampingan perjalanan.`).join("\n");
const longNotes = Array.from({ length: 11 }, (_, index) => `Catatan pengujian ${index + 1}: pastikan informasi perjalanan, pembayaran, dokumen, dan ketentuan pelunasan terbaca utuh tanpa clipping.`).join("\n");

const cases = [
  {
    id: 1,
    group: { code: "TEST-QA-1-GROUP", name: "NUFATUR TEST 1 PAGE", departureDate: "2026-10-15", packageName: "Paket Umroh Test 1" },
    invoice: { number: "TEST-QA-1", customerName: "TEST CUSTOMER 1", dueDate: "2026-10-10", includeText: "Tiket pesawat\nHotel Madinah", notes: "" },
    items: [{ description: "Paket Umroh Test 1", details: "Layanan lengkap perjalanan umroh", quantity: "2", price: "12500000" }],
    payments: [{ amount: "10000000", description: "DP TEST-QA-1", method: "Transfer", bank: "BSI", paymentDate: "2026-09-25" }],
  },
  {
    id: 2,
    group: { code: "TEST-QA-2-GROUP", name: "NUFATUR TEST 2 PAGE", departureDate: "2026-11-20", packageName: "Paket Umroh Test 2" },
    invoice: { number: "TEST-QA-2", customerName: "TEST CUSTOMER 2", dueDate: "2026-11-01", includeText: longInclude, notes: longNotes },
    items: Array.from({ length: 7 }, (_, index) => ({
      description: `Paket layanan test 2 item ${index + 1} dengan uraian perjalanan dan akomodasi yang cukup panjang`,
      flight: `FLIGHT QA2-${index + 1}`,
      details: "Hotel, transportasi, handling, dan perlengkapan jamaah",
      quantity: "1",
      price: "3000000",
    })),
    payments: [{ amount: "12000000", description: "DP TEST-QA-2", method: "Transfer", bank: "BSI", paymentDate: "2026-10-01" }],
  },
  {
    id: 3,
    group: { code: "TEST-QA-3-GROUP", name: "NUFATUR TEST 3 PAGE", departureDate: "2026-12-10", packageName: "Paket Umroh Test 3" },
    invoice: { number: "TEST-QA-3", customerName: "TEST CUSTOMER 3", dueDate: "2026-12-01", includeText: `${longInclude}\n${longInclude}`, notes: `${longNotes}\n${longNotes}` },
    items: Array.from({ length: 20 }, (_, index) => ({
      description: `Paket layanan test 3 item ${index + 1} dengan deskripsi panjang untuk pengujian overflow natural pada tabel invoice`,
      flight: `FLIGHT QA3-${index + 1}`,
      details: "Akomodasi hotel, transportasi, handling, visa, dan perlengkapan perjalanan jamaah",
      quantity: "1",
      price: "2500000",
    })),
    payments: [
      { amount: "10000000", description: "DP TEST-QA-3", method: "Transfer", bank: "BSI", paymentDate: "2026-10-05" },
      { amount: "12000000", description: "Cicilan TEST-QA-3", method: "Transfer", bank: "BSI", paymentDate: "2026-11-05" },
      { amount: "8000000", description: "Cicilan kedua TEST-QA-3", method: "Transfer", bank: "BSI", paymentDate: "2026-11-20" },
    ],
  },
];

let cookie = "";

async function request(route, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${route} failed ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/pdf") ? Buffer.from(await response.arrayBuffer()) : response.json();
}

function pageCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length;
}

function totalFor(testCase) {
  return testCase.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
}

async function login() {
  if (!password) throw new Error("QA_PASSWORD must be provided via the environment.");
  await request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

async function cleanup() {
  await login();
  const invoices = (await request("/invoices")).invoices;
  for (const invoice of invoices.filter((row) => row.number.startsWith(prefix))) await request(`/invoices/${invoice.id}`, { method: "DELETE" });
  const groups = (await request("/groups")).groups;
  for (const group of groups.filter((row) => row.code.startsWith(prefix))) await request(`/groups/${group.id}`, { method: "DELETE" });
  console.log(`Cleaned TEST-QA data: ${invoices.filter((row) => row.number.startsWith(prefix)).length} invoice(s), ${groups.filter((row) => row.code.startsWith(prefix)).length} group(s).`);
}

async function createCase(testCase) {
  const groupResponse = await request("/groups", { method: "POST", body: JSON.stringify(testCase.group) });
  const groupId = groupResponse.group.id;
  const subtotal = totalFor(testCase);
  const invoiceResponse = await request("/invoices", {
    method: "POST",
    body: JSON.stringify({
      number: testCase.invoice.number,
      invoiceDate: "2026-09-24",
      dueDate: testCase.invoice.dueDate,
      groupId,
      customerType: "Perusahaan",
      customerName: testCase.invoice.customerName,
      customerWhatsapp: "081200000001",
      customerEmail: `${testCase.invoice.number.toLowerCase()}@example.test`,
      customerAddress: "Alamat customer pengujian NUFATUR",
      includeText: testCase.invoice.includeText,
      notes: testCase.invoice.notes,
      discount: testCase.id === 1 ? "0" : testCase.id === 2 ? "1000000" : "1500000",
      tax: testCase.id === 1 ? "0" : testCase.id === 2 ? "750000" : "1250000",
      additionalCost: testCase.id === 1 ? "0" : testCase.id === 2 ? "250000" : "500000",
      items: testCase.items,
    }),
  });
  const invoice = invoiceResponse.invoice;
  const paymentIds = [];
  for (const paymentInput of testCase.payments) {
    const paymentResponse = await request(`/invoices/${invoice.id}/payments`, { method: "POST", body: JSON.stringify(paymentInput) });
    paymentIds.push(paymentResponse.payment.id);
  }
  const receiptResponse = await request(`/payments/${paymentIds[0]}/receipt`, {
    method: "POST",
    body: JSON.stringify({ number: `TEST-QA-${testCase.id}-KWT`, receiptDate: "2026-09-24", purpose: `Pembayaran ${testCase.invoice.number}` }),
  });
  const refreshed = (await request(`/invoices/${invoice.id}`)).invoice;
  const invoicePdf = await request(`/invoices/${invoice.id}/pdf`);
  const receiptPdf = await request(`/receipts/${receiptResponse.receipt.id}/pdf`);
  await fs.writeFile(path.join(outputDir, `TEST-QA-${testCase.id}-invoice.pdf`), invoicePdf);
  await fs.writeFile(path.join(outputDir, `TEST-QA-${testCase.id}-receipt.pdf`), receiptPdf);
  return {
    invoiceId: invoice.id,
    receiptId: receiptResponse.receipt.id,
    subtotal,
    total: refreshed.total,
    paid: refreshed.paid,
    remaining: refreshed.remaining,
    status: refreshed.status,
    invoicePages: pageCount(invoicePdf),
    receiptPages: pageCount(receiptPdf),
  };
}

await fs.mkdir(outputDir, { recursive: true });
if (process.argv.includes("--cleanup")) {
  await cleanup();
} else {
  await login();
  const existing = (await request("/invoices")).invoices.filter((row) => row.number.startsWith(prefix));
  if (existing.length) throw new Error(`TEST-QA data already exists (${existing.map((row) => row.number).join(", ")}); run --cleanup first.`);
  const results = [];
  for (const testCase of cases) results.push({ test: `QA-${testCase.id}`, ...(await createCase(testCase)) });
  console.log(JSON.stringify({ outputDir, results }, null, 2));
}
