import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3005/api";
const username = process.env.QA_USERNAME ?? "nufatur";
const password = process.env.QA_PASSWORD ?? "bismillah827";
const prefix = "TEST-FIXED-";
const outputDir = path.resolve(".agents/outputs/fixed-template-qa");

const cases = [
  { key: "EMPTY", customerName: "TEST-FIXED-EMPTY", includeText: "", notes: "", items: [{ description: "", quantity: "", price: "", amount: "0" }], payments: [] },
  { key: "NORMAL", customerName: "TEST-FIXED-NORMAL", includeText: "Tiket pesawat\nHotel", notes: "Catatan normal fixed template.", items: [{ description: "Paket Umroh Normal", quantity: "1", price: "18500000" }], payments: [{ amount: "5000000", description: "DP NORMAL", method: "Transfer", bank: "BSI" }] },
  { key: "FULL", customerName: "TEST-FIXED-FULL", includeText: "Tiket pesawat\nHotel Madinah\nHotel Makkah\nTransportasi\nHandling\nVisa", notes: "Catatan lengkap fixed template dengan diskon pajak cashback dan pembayaran.", items: [{ description: "Paket Umroh Full", details: "Akomodasi dan transportasi", quantity: "2", price: "18500000" }, { description: "Perlengkapan perjalanan", quantity: "2", price: "750000" }], payments: [{ amount: "10000000", description: "DP FULL", method: "Transfer", bank: "BSI" }] },
  { key: "MULTI-PAGE", customerName: "TEST-FIXED-MULTI-PAGE", includeText: Array.from({ length: 5 }, (_, i) => `Include fixed ${i + 1}: layanan perjalanan, hotel, tiket, transportasi, dan handling.`).join("\n"), notes: Array.from({ length: 8 }, (_, i) => `Catatan fixed ${i + 1}: informasi penting pengujian halaman lanjutan dan pembayaran.`).join("\n"), items: Array.from({ length: 20 }, (_, i) => ({ description: `Item fixed template ${i + 1} dengan deskripsi panjang untuk continuation table`, details: "Hotel, transportasi, handling, dan dokumen", quantity: "1", price: "2500000" })), payments: [{ amount: "10000000", description: "DP MULTI", method: "Transfer", bank: "BSI" }, { amount: "5000000", description: "Cicilan MULTI", method: "Transfer", bank: "BSI" }] },
];

let cookie = "";
async function request(route, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  return (response.headers.get("content-type") ?? "").includes("application/pdf") ? Buffer.from(await response.arrayBuffer()) : response.json();
}
function pages(pdf) { return (pdf.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length; }
async function login() { if (!password) throw new Error("QA_PASSWORD is required"); await request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }); }
async function cleanup() {
  await login();
  const invoices = (await request("/invoices")).invoices.filter((x) => x.number.startsWith(prefix));
  for (const invoice of invoices) await request(`/invoices/${invoice.id}`, { method: "DELETE" });
  const groups = (await request("/groups")).groups.filter((x) => x.code.startsWith(prefix));
  for (const group of groups) await request(`/groups/${group.id}`, { method: "DELETE" });
  console.log(`Cleaned ${invoices.length} invoice(s) and ${groups.length} group(s).`);
}
async function create(test, index) {
  const departureDates = ["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"];
  const group = (await request("/groups", { method: "POST", body: JSON.stringify({ code: `${prefix}${test.key}-GROUP`, name: `${prefix}${test.key}`, departureDate: departureDates[index], packageName: `Paket ${test.key}` }) })).group;
  const invoice = (await request("/invoices", { method: "POST", body: JSON.stringify({ number: `${prefix}${test.key}`, invoiceDate: "2026-09-24", dueDate: "2026-12-31", groupId: group.id, customerName: test.customerName, customerType: "Perusahaan", customerAddress: "Alamat QA fixed template", includeText: test.includeText, notes: test.notes, discount: test.key === "FULL" ? "500000" : "0", tax: test.key === "FULL" ? "250000" : "0", additionalCost: test.key === "FULL" ? "100000" : "0", items: test.items }) })).invoice;
  const paymentIds = [];
  for (const payment of test.payments) paymentIds.push((await request(`/invoices/${invoice.id}/payments`, { method: "POST", body: JSON.stringify({ ...payment, paymentDate: "2026-09-24" }) })).payment.id);
  let receipt = null;
  if (paymentIds[0]) receipt = (await request(`/payments/${paymentIds[0]}/receipt`, { method: "POST", body: JSON.stringify({ number: `${prefix}${test.key}-KWT`, receiptDate: "2026-09-24", purpose: `Pembayaran ${test.key}` }) })).receipt;
  const current = (await request(`/invoices/${invoice.id}`)).invoice;
  const invoicePdf = await request(`/invoices/${invoice.id}/pdf`);
  await fs.writeFile(path.join(outputDir, `${prefix}${test.key}-invoice.pdf`), invoicePdf);
  let receiptPages = null;
  if (receipt) { const receiptPdf = await request(`/receipts/${receipt.id}/pdf`); receiptPages = pages(receiptPdf); await fs.writeFile(path.join(outputDir, `${prefix}${test.key}-receipt.pdf`), receiptPdf); }
  return { key: test.key, invoiceId: invoice.id, receiptId: receipt?.id ?? null, invoicePages: pages(invoicePdf), receiptPages, total: current.total, paid: current.paid, remaining: current.remaining, status: current.status };
}
await fs.mkdir(outputDir, { recursive: true });
if (process.argv.includes("--cleanup")) await cleanup();
else { await login(); const existing = (await request("/invoices")).invoices.filter((x) => x.number.startsWith(prefix)); if (existing.length) throw new Error("TEST-FIXED data already exists; run --cleanup first."); const results = []; for (let i = 0; i < cases.length; i += 1) results.push(await create(cases[i], i)); console.log(JSON.stringify({ outputDir, results }, null, 2)); }
