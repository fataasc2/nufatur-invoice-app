import { companySettings, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const defaultPdfNotes = `* Pelunasan dilakukan 40 hari sebelum tanggal keberangkatan.
* Deposit yang sudah kami terima akan hangus dan dianggap tidak melanjutkan blockseat/paket umroh lagi apabila pelunasan tidak sesuai ketentuan diatas dan seat direlease kembali.
* Kami tidak bertanggung jawab atas ter-CANCEL nya Group Booking yang terjadi dikarenakan keterlambatan pembayaran yang tidak sesuai dengan jatuh tempo/timelimit yang sudah ditentukan tersebut.
* Perubahan nama hanya bisa dilakukan sebelum issued sebanyak 10% dari total penumpang masing2 group.
* Data manifest wajib dilengkapi : Nama, Gender, Tgl Lahir, No.Paspor, Exp. Paspor, Issue Paspor.
* Manifest penumpang tersebut dikirimkan 10 hari sebelum keberangkatan/setelah pelunasan.`;

const companySettingsColumns = {
  id: companySettings.id,
  companyName: companySettings.companyName,
  brandName: companySettings.brandName,
  address: companySettings.address,
  whatsapp: companySettings.whatsapp,
  email: companySettings.email,
  website: companySettings.website,
  logoDataUrl: companySettings.logoDataUrl,
  signatureDataUrl: companySettings.signatureDataUrl,
  invoiceTitle: companySettings.invoiceTitle,
  receiptTitle: companySettings.receiptTitle,
  footer: companySettings.footer,
  notes: companySettings.notes,
  seededAt: companySettings.seededAt,
  updatedAt: companySettings.updatedAt,
};

export async function getCompanySettings() {
  const row = (await db.select(companySettingsColumns).from(companySettings).where(eq(companySettings.id, 1)).limit(1))[0];
  if (!row) return undefined;
  return {
    ...row,
    adminName: "Admin NUFATUR",
    adminTitle: "Penanggung Jawab",
    includeText: "",
    pdfNotes: defaultPdfNotes,
  };
}
