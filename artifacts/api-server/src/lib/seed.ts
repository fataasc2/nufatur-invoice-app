import { and, eq, isNull } from "drizzle-orm";
import { db, bankAccounts, companySettings, customers, invoiceItems, invoices, payments } from "@workspace/db";
import { hashPassword } from "./auth";

const companyDefaults = {
  companyName: "PT Nurul Fajar Abinaya",
  brandName: "NUFATUR",
  address: "Jl. Raden Saleh, Sukmajaya,\nKec. Sukmajaya, Kota Depok,\nJawa Barat 16412",
  whatsapp: "081220744334",
  email: "nufaturtravel@gmail.com",
  website: "nufaturfamily.com",
  invoiceTitle: "INVOICE",
  receiptTitle: "KUITANSI",
  footer: "Terima kasih telah mempercayakan perjalanan Anda kepada NUFATUR.",
  notes: "Harap konfirmasi setelah melakukan pembayaran ke WhatsApp NUFATUR.",
  adminName: "Admin NUFATUR",
  adminTitle: "Penanggung Jawab",
  includeText: "",
  pdfNotes: `* Pelunasan dilakukan 40 hari sebelum tanggal keberangkatan.
* Deposit yang sudah kami terima akan hangus dan dianggap tidak melanjutkan blockseat/paket umroh lagi apabila pelunasan tidak sesuai ketentuan diatas dan seat direlease kembali.
* Kami tidak bertanggung jawab atas ter-CANCEL nya Group Booking yang terjadi dikarenakan keterlambatan pembayaran yang tidak sesuai dengan jatuh tempo/timelimit yang sudah ditentukan tersebut.
* Perubahan nama hanya bisa dilakukan sebelum issued sebanyak 10% dari total penumpang masing2 group.
* Data manifest wajib dilengkapi : Nama, Gender, Tgl Lahir, No.Paspor, Exp. Paspor, Issue Paspor.
* Manifest penumpang tersebut dikirimkan 10 hari sebelum keberangkatan/setelah pelunasan.`,
};

export async function ensureSeedData(): Promise<void> {
  let settings = (await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1))[0];
  if (!settings) {
    settings = (await db.insert(companySettings).values(companyDefaults).returning())[0];
  }
  if ((await db.select({ id: bankAccounts.id }).from(bankAccounts).limit(1)).length === 0) {
    await db.insert(bankAccounts).values({
      bankName: "Bank Syariah Indonesia (BSI)",
      accountNumber: "7133264765",
      accountName: "PT Nurul Fajar Abinaya (NUFATUR)",
      isPrimary: true,
    });
  }
  if (settings.seededAt) return;

  const seedCustomer = (await db.insert(customers).values({
    kind: "Instansi",
    name: "Dinas Psikologi Angkatan Darat Bandung",
    whatsapp: "081220744334",
    email: "operasional@example.com",
    address: "Bandung, Jawa Barat",
  }).returning())[0];

  const today = new Date();
  const iso = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const [unpaid] = await db.insert(invoices).values({
    number: "INV/NUF/2026/09/001",
    invoiceDate: iso(-14),
    dueDate: iso(14),
    reference: "Paket perjalanan dinas — Bandung",
    customerId: seedCustomer.id,
    customerType: "Instansi",
    customerName: seedCustomer.name,
    customerWhatsapp: seedCustomer.whatsapp,
    customerEmail: seedCustomer.email,
    customerAddress: seedCustomer.address,
    notes: "Jadwal dan detail perjalanan mengikuti konfirmasi terakhir.",
  }).returning();
  await db.insert(invoiceItems).values({
    invoiceId: unpaid.id,
    position: 0,
    description: "Paket perjalanan dinas",
    details: "Transportasi dan akomodasi sesuai kesepakatan",
    itemDate: iso(10),
    quantity: "1",
    price: "976800000",
    amount: "976800000",
  });
  await db.insert(payments).values({
    invoiceId: unpaid.id,
    paymentDate: iso(-5),
    description: "Pembayaran tahap pertama",
    amount: "727885000",
    bank: "BSI",
    method: "Transfer",
  });

  const [paid] = await db.insert(invoices).values({
    number: "INV/NUF/2026/09/002",
    invoiceDate: iso(-20),
    dueDate: iso(-5),
    reference: "Paket Umrah keluarga",
    customerType: "Keluarga",
    customerName: "Keluarga H. Ahmad",
    customerWhatsapp: "081234567890",
    customerAddress: "Depok, Jawa Barat",
    notes: "Pelunasan sudah diterima.",
  }).returning();
  await db.insert(invoiceItems).values({
    invoiceId: paid.id,
    position: 0,
    description: "Paket Umrah keluarga",
    quantity: "4",
    price: "18500000",
    amount: "74000000",
  });
  await db.insert(payments).values({
    invoiceId: paid.id,
    paymentDate: iso(-7),
    description: "Pelunasan",
    amount: "74000000",
    bank: "BSI",
    method: "Transfer",
  });

  const [overdue] = await db.insert(invoices).values({
    number: "INV/NUF/2026/09/003",
    invoiceDate: iso(-45),
    dueDate: iso(-12),
    reference: "Tiket pesawat rombongan",
    customerType: "Perusahaan",
    customerName: "PT Cahaya Perjalanan",
    customerWhatsapp: "081298765432",
    customerAddress: "Jakarta Selatan",
    notes: "Segera lakukan konfirmasi pembayaran.",
  }).returning();
  await db.insert(invoiceItems).values({
    invoiceId: overdue.id,
    position: 0,
    description: "Tiket pesawat rombongan",
    quantity: "10",
    price: "2500000",
    amount: "25000000",
  });
  await db.insert(payments).values({
    invoiceId: overdue.id,
    paymentDate: iso(-35),
    description: "Uang muka",
    amount: "5000000",
    bank: "BCA",
    method: "Transfer",
  });

  await db.update(companySettings).set({ seededAt: new Date(), updatedAt: new Date() }).where(and(eq(companySettings.id, 1), isNull(companySettings.seededAt)));
}