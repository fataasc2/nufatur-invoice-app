import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Banknote,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FileText,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { api, formatDate, money, today, type Bank, type Dashboard, type Invoice, type Item, type Payment, type Receipt, type Settings as CompanySettings, type User } from "./api";

type View = "dashboard" | "invoices" | "payments" | "receipts" | "settings";
type InvoiceDraft = {
  id?: number;
  number: string;
  invoiceDate: string;
  dueDate: string;
  reference: string;
  customerType: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string;
  customerAddress: string;
  notes: string;
  includeText: string;
  discount: string;
  additionalCost: string;
  tax: string;
  items: Item[];
};
type PaymentDraft = { paymentDate: string; description: string; amount: string; bank: string; method: string; notes: string };

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "dashboard", label: "Beranda", icon: Home },
  { id: "invoices", label: "Invoice", icon: FileText },
  { id: "payments", label: "Pembayaran", icon: WalletCards },
  { id: "receipts", label: "Kuitansi", icon: ReceiptText },
  { id: "settings", label: "Pengaturan", icon: Settings },
];

const emptyItem = (): Item => ({ description: "", flight: "", details: "", itemDate: today(), quantity: "1", price: "", amount: 0 });
const emptyDraft = (): InvoiceDraft => ({
  number: "",
  invoiceDate: today(),
  dueDate: today(),
  reference: "",
  customerType: "Perusahaan",
  customerName: "",
  customerWhatsapp: "",
  customerEmail: "",
  customerAddress: "",
  notes: "",
  includeText: "",
  discount: "0",
  additionalCost: "0",
  tax: "0",
  items: [emptyItem()],
});

function statusClass(status: string): string {
  return status.toLowerCase().replaceAll(" ", "-");
}

function draftFromInvoice(invoice: Invoice): InvoiceDraft {
  return {
    id: invoice.id,
    number: invoice.number,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    reference: invoice.reference ?? "",
    customerType: invoice.customerType,
    customerName: invoice.customerName,
    customerWhatsapp: invoice.customerWhatsapp ?? "",
    customerEmail: invoice.customerEmail ?? "",
    customerAddress: invoice.customerAddress ?? "",
    notes: invoice.notes ?? "",
    includeText: invoice.includeText ?? "",
    discount: String(invoice.discount),
    additionalCost: String(invoice.additionalCost),
    tax: String(invoice.tax),
    items: invoice.items.map((item) => ({ ...item, quantity: item.quantity ?? "", price: item.price ?? "", amount: item.amount })),
  };
}

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("nufatur");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLogin(result.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <div className="login-art">
        <div className="login-mark">N</div>
        <p className="eyebrow">INTERNAL OPERATIONS</p>
        <h1>Kelola perjalanan dengan lebih tertib.</h1>
        <p>Invoice, pembayaran, dan kuitansi NUFATUR tersimpan rapi dalam satu ruang kerja.</p>
        <div className="login-art-footer"><ShieldCheck size={16} /> Data internal perusahaan</div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="brand-lockup"><div className="brand-symbol">N</div><div><strong>NUFATUR</strong><span>Invoice App</span></div></div>
        <div className="login-heading"><p className="eyebrow">SELAMAT DATANG</p><h2>Masuk ke ruang kerja</h2><p>Gunakan akun internal yang sudah terdaftar.</p></div>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus /></label>
        {error && <div className="alert error"><CircleAlert size={16} />{error}</div>}
        <button className="button primary full" disabled={busy}>{busy ? "Memeriksa..." : "Masuk"}</button>
        <p className="login-note">Akses ini hanya untuk tim NUFATUR.</p>
      </form>
    </main>
  );
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? "wide" : ""}`}><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button></div>{children}</section>
  </div>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: User }>("/api/auth/session").then((result) => setUser(result.user)).catch(() => undefined).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (booting) return <div className="loading-screen"><div className="spinner" /><span>Menyiapkan ruang kerja...</span></div>;
  if (!user) return <LoginScreen onLogin={setUser} />;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }
  function navigate(nextView: View) {
    setView(nextView);
    setSidebarOpen(false);
    setError("");
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="sidebar-top">
        <div className="brand-lockup light"><div className="brand-symbol">N</div><div><strong>NUFATUR</strong><span>Invoice App</span></div></div>
        <button className="sidebar-close icon-button" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
      </div>
      <div className="workspace-label">RUANG KERJA</div>
      <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{view === id && <ChevronRight size={16} className="nav-arrow" />}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="user-chip"><div className="avatar">N</div><div><strong>{user.displayName}</strong><span>Owner</span></div></div>
        <button className="logout-button" onClick={logout}><LogOut size={17} />Keluar</button>
      </div>
    </aside>
    {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button><div><p className="topbar-kicker">PT NURUL FAJAR ABINAYA</p><h1>{navItems.find((item) => item.id === view)?.label}</h1></div><div className="topbar-meta"><span className="online-dot" />Sistem aktif</div></header>
      {notice && <div className="toast success"><Check size={17} />{notice}</div>}
      {error && <div className="toast error"><CircleAlert size={17} />{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
      <div className="page-content">
        {view === "dashboard" && <DashboardPage onNavigate={navigate} onNotice={setNotice} onError={setError} />}
        {view === "invoices" && <InvoicesPage onNotice={setNotice} onError={setError} />}
        {view === "payments" && <PaymentsPage onNotice={setNotice} onError={setError} />}
        {view === "receipts" && <ReceiptsPage onError={setError} />}
        {view === "settings" && <SettingsPage onNotice={setNotice} onError={setError} />}
      </div>
    </main>
  </div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function DashboardPage({ onNavigate, onNotice, onError }: { onNavigate: (view: View) => void; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { api<Dashboard>("/api/dashboard").then(setData).catch((error) => onError(error.message)); }, [onError]);
  if (!data) return <LoadingBlock />;
  return <>
    <PageIntro eyebrow="RINGKASAN HARI INI" title="Selamat datang di NUFATUR." description="Pantau tagihan dan pembayaran dari satu tempat." action={<button className="button primary" onClick={() => onNavigate("invoices")}><Plus size={18} />Buat invoice</button>} />
    <div className="stats-grid">
      <StatCard label="Total Invoice" value={data.counts.all} icon={<FileText />} tone="navy" />
      <StatCard label="Belum Lunas" value={data.counts.unpaid} icon={<WalletCards />} tone="amber" />
      <StatCard label="Jatuh Tempo" value={data.counts.overdue} icon={<CircleAlert />} tone="orange" />
      <StatCard label="Sudah Lunas" value={data.counts.paid} icon={<FileCheck2 />} tone="green" />
    </div>
    <div className="dashboard-grid">
      <section className="panel total-panel"><div className="panel-heading"><div><p className="eyebrow">KEUANGAN</p><h3>Ringkasan tagihan</h3></div><BarChart3 size={21} /></div><div className="financial-total">{money(data.totals.billed)}</div><div className="financial-lines"><div><span>Total terbayar</span><strong className="green-text">{money(data.totals.paid)}</strong></div><div><span>Total sisa</span><strong className="orange-text">{money(data.totals.remaining)}</strong></div></div><div className="progress"><span style={{ width: `${data.totals.billed ? Math.min(100, (data.totals.paid / data.totals.billed) * 100) : 0}%` }} /></div><p className="progress-caption">{data.totals.billed ? Math.round((data.totals.paid / data.totals.billed) * 100) : 0}% dari total tagihan sudah dibayar</p></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">AKSES CEPAT</p><h3>Mulai pekerjaan</h3></div><ClipboardList size={21} /></div><div className="quick-actions"><button onClick={() => onNavigate("invoices")}><div className="quick-icon blue"><FilePlus2 size={20} /></div><span><strong>Buat invoice baru</strong><small>Catat tagihan pelanggan</small></span><ChevronRight size={17} /></button><button onClick={() => onNavigate("payments")}><div className="quick-icon green"><Banknote size={20} /></div><span><strong>Catat pembayaran</strong><small>Perbarui status tagihan</small></span><ChevronRight size={17} /></button></div></section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">TERBARU</p><h3>Invoice terakhir</h3></div><button className="text-button" onClick={() => onNavigate("invoices")}>Lihat semua <ChevronRight size={16} /></button></div><InvoiceTable invoices={data.recent} compact /></section>
  </>;
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return <div className={`stat-card ${tone}`}><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function InvoicesPage({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Semua");
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<InvoiceDraft | null>(null);
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null);
  const load = () => api<{ invoices: Invoice[] }>(`/api/invoices?search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}`).then((result) => setInvoices(result.invoices)).catch((error) => onError(error.message));
  useEffect(() => { void load(); }, [search, filter]);
  async function remove(invoice: Invoice) {
    if (!window.confirm(`Hapus ${invoice.number}? Data pembayaran terkait juga akan dihapus.`)) return;
    try { await api(`/api/invoices/${invoice.id}`, { method: "DELETE" }); onNotice("Invoice berhasil dihapus."); void load(); if (detail?.id === invoice.id) setDetail(null); } catch (error) { onError(error instanceof Error ? error.message : "Gagal menghapus invoice."); }
  }
  return <>
    <PageIntro eyebrow="PENGELOLAAN TAGIHAN" title="Invoice" description="Buat, pantau, dan kelola seluruh tagihan NUFATUR." action={<div className="intro-actions"><a className="button secondary" href="/api/export/invoices.csv"><ArrowDownToLine size={17} />Export CSV</a><button className="button primary" onClick={() => { setEditing(emptyDraft()); setFormOpen(true); }}><Plus size={18} />Buat invoice</button></div>} />
    <div className="toolbar"><div className="search-box"><Search size={18} /><input placeholder="Cari nomor atau customer..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-tabs">{["Semua", "Belum Lunas", "Lunas", "Jatuh Tempo", "Draft"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
    <section className="panel table-panel"><InvoiceTable invoices={invoices} onOpen={setDetail} onEdit={(invoice) => { setEditing(draftFromInvoice(invoice)); setFormOpen(true); }} onDelete={remove} /></section>
    {formOpen && editing && <InvoiceForm initial={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); onNotice(editing.id ? "Invoice berhasil diperbarui." : "Invoice berhasil dibuat."); void load(); }} onError={onError} />}
    {detail && <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(draftFromInvoice(detail)); setFormOpen(true); setDetail(null); }} onDelete={() => void remove(detail)} onPayment={() => setPaymentFor(detail)} onRefresh={(updated) => { setDetail(updated); void load(); }} onNotice={onNotice} onError={onError} />}
    {paymentFor && <PaymentForm invoice={paymentFor} onClose={() => setPaymentFor(null)} onSaved={(updated) => { setPaymentFor(null); setDetail(updated); onNotice("Pembayaran berhasil dicatat."); void load(); }} onError={onError} />}
  </>;
}

function InvoiceTable({ invoices, compact = false, onOpen, onEdit, onDelete }: { invoices: Invoice[]; compact?: boolean; onOpen?: (invoice: Invoice) => void; onEdit?: (invoice: Invoice) => void; onDelete?: (invoice: Invoice) => void }) {
  if (invoices.length === 0) return <div className="empty-state"><FileText size={26} /><h3>Belum ada invoice</h3><p>Invoice baru yang dibuat akan muncul di sini.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Tanggal</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>{invoices.slice(0, compact ? 5 : undefined).map((invoice) => <tr key={invoice.id} onClick={() => onOpen?.(invoice)} className={onOpen ? "clickable" : ""}><td><strong className="table-primary">{invoice.number}</strong><small>{invoice.reference || "Tanpa referensi"}</small></td><td>{invoice.customerName}</td><td>{formatDate(invoice.invoiceDate)}</td><td><strong>{money(invoice.total)}</strong><small>Sisa {money(invoice.remaining)}</small></td><td><span className={`status ${statusClass(invoice.status)}`}>{invoice.status}</span></td><td>{(onEdit || onDelete) && <div className="row-actions"><button className="icon-button" title="Edit" onClick={(event) => { event.stopPropagation(); onEdit?.(invoice); }}><Pencil size={16} /></button><button className="icon-button danger-icon" title="Hapus" onClick={(event) => { event.stopPropagation(); onDelete?.(invoice); }}><Trash2 size={16} /></button></div>}</td></tr>)}</tbody></table></div>;
}

function InvoiceForm({ initial, onClose, onSaved, onError }: { initial: InvoiceDraft; onClose: () => void; onSaved: () => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const update = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const computedSubtotal = draft.items.reduce((sum, item) => sum + (Number(item.quantity) && Number(item.price) ? Number(item.quantity) * Number(item.price) : Number(item.amount) || 0), 0);
  const total = Math.max(0, computedSubtotal - Number(draft.discount || 0) + Number(draft.additionalCost || 0) + Number(draft.tax || 0));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.customerName.trim()) { onError("Nama customer wajib diisi."); return; }
    if (!draft.items.some((item) => item.description.trim())) { onError("Tambahkan minimal satu item invoice."); return; }
    setBusy(true);
    const payload = { ...draft, items: draft.items.map((item) => ({ ...item, amount: Number(item.quantity) && Number(item.price) ? Number(item.quantity) * Number(item.price) : Number(item.amount) || 0 })) };
    try { await api(draft.id ? `/api/invoices/${draft.id}` : "/api/invoices", { method: draft.id ? "PUT" : "POST", body: JSON.stringify(payload) }); onSaved(); } catch (error) { onError(error instanceof Error ? error.message : "Gagal menyimpan invoice."); } finally { setBusy(false); }
  }
  function updateItem(index: number, patch: Partial<Item>) {
    setDraft((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  return <Modal title={draft.id ? "Edit invoice" : "Buat invoice baru"} onClose={onClose} wide><form onSubmit={save} className="form-content">
    <div className="form-section"><div className="section-heading"><h3>Informasi invoice</h3><span>Semua tanggal menggunakan zona waktu lokal.</span></div><div className="form-grid four"><label>Nomor invoice<input value={draft.number} onChange={(event) => update("number", event.target.value)} placeholder="Kosongkan untuk nomor otomatis" /></label><label>Tanggal<input type="date" value={draft.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} /></label><label>Jatuh tempo<input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label><label>Jenis customer<select value={draft.customerType} onChange={(event) => update("customerType", event.target.value)}><option>Perusahaan</option><option>Instansi</option><option>Keluarga</option><option>Perorangan</option></select></label></div><div className="form-grid two"><label>Nama customer / perusahaan<input required value={draft.customerName} onChange={(event) => update("customerName", event.target.value)} /></label><label>Reference<input value={draft.reference} onChange={(event) => update("reference", event.target.value)} placeholder="Contoh: Paket wisata keluarga" /></label><label>WhatsApp<input value={draft.customerWhatsapp} onChange={(event) => update("customerWhatsapp", event.target.value)} /></label><label>Email<input type="email" value={draft.customerEmail} onChange={(event) => update("customerEmail", event.target.value)} /></label><label className="span-two">Alamat<textarea value={draft.customerAddress} onChange={(event) => update("customerAddress", event.target.value)} rows={2} /></label></div></div>
    <div className="form-section"><div className="section-heading"><h3>Detail invoice</h3><button type="button" className="button small secondary" onClick={() => setDraft((current) => ({ ...current, items: [...current.items, emptyItem()] }))}><Plus size={15} />Tambah item</button></div><div className="item-editor">{draft.items.map((item, index) => <div className="item-row" key={index}><div className="item-row-number">{index + 1}</div><label>Deskripsi<input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></label><label>Qty / Pax<input type="number" min="0" value={item.quantity ?? ""} onChange={(event) => updateItem(index, { quantity: event.target.value })} /></label><label>Harga<input type="number" min="0" value={item.price ?? ""} onChange={(event) => updateItem(index, { price: event.target.value })} /></label><label>Tanggal<input type="date" value={item.itemDate ?? ""} onChange={(event) => updateItem(index, { itemDate: event.target.value })} /></label><strong className="item-amount">{money(Number(item.quantity) && Number(item.price) ? Number(item.quantity) * Number(item.price) : Number(item.amount) || 0)}</strong><button type="button" className="icon-button danger-icon" disabled={draft.items.length === 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={16} /></button><label className="item-detail">Flight / keterangan<textarea value={item.details ?? ""} onChange={(event) => updateItem(index, { details: event.target.value })} rows={1} placeholder="Opsional" /></label></div>)}</div><div className="totals-editor"><div><span>Subtotal</span><strong>{money(computedSubtotal)}</strong></div><label>Discount<input type="number" min="0" value={draft.discount} onChange={(event) => update("discount", event.target.value)} /></label><label>Biaya tambahan<input type="number" min="0" value={draft.additionalCost} onChange={(event) => update("additionalCost", event.target.value)} /></label><label>Pajak<input type="number" min="0" value={draft.tax} onChange={(event) => update("tax", event.target.value)} /></label><div className="total-highlight"><span>Total invoice</span><strong>{money(total)}</strong></div></div></div>
    <div className="form-section"><div className="form-grid two"><label>Include PDF<textarea value={draft.includeText} onChange={(event) => update("includeText", event.target.value)} rows={4} placeholder={"Contoh:\n• Tiket Pesawat\n• Hotel\n• Transportasi"} /></label><label>Catatan invoice<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={4} placeholder="Catatan tambahan untuk customer atau tim..." /></label></div></div>
    <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? "Menyimpan..." : draft.id ? "Simpan perubahan" : "Simpan invoice"}</button></div>
  </form></Modal>;
}

function InvoiceDetail({ invoice, onClose, onEdit, onDelete, onPayment, onRefresh, onNotice, onError }: { invoice: Invoice; onClose: () => void; onEdit: () => void; onDelete: () => void; onPayment: () => void; onRefresh: (invoice: Invoice) => void; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const reload = () => api<{ invoice: Invoice }>(`/api/invoices/${invoice.id}`).then((result) => onRefresh(result.invoice)).catch((error) => onError(error.message));
  const pdfUrl = `/api/invoices/${invoice.id}/pdf?inline=1`;
  return <div className="modal-backdrop"><section className="modal detail-modal"><div className="modal-header"><div><p className="eyebrow">DETAIL INVOICE</p><h2>{invoice.number}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><div className="detail-body"><div className="detail-top"><div><span className={`status ${statusClass(invoice.status)}`}>{invoice.status}</span><h3>{invoice.customerName}</h3><p>{invoice.customerAddress || "Alamat belum diisi"}{invoice.reference && ` • ${invoice.reference}`}</p></div><div className="detail-actions"><a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer"><FileText size={16} />Preview</a><a className="button secondary" href={`/api/invoices/${invoice.id}/pdf`}><ArrowDownToLine size={16} />Download PDF</a><button className="button secondary" onClick={() => window.open(pdfUrl, "_blank")}><ClipboardList size={16} />Print</button><button className="button secondary" onClick={onEdit}><Pencil size={16} />Edit</button><button className="icon-button danger-icon" onClick={onDelete}><Trash2 size={17} /></button></div></div><div className="detail-metrics"><div><span>Total invoice</span><strong>{money(invoice.total)}</strong></div><div><span>Terbayar</span><strong className="green-text">{money(invoice.paid)}</strong></div><div><span>Sisa</span><strong className="orange-text">{money(invoice.remaining)}</strong></div><div><span>Jatuh tempo</span><strong>{formatDate(invoice.dueDate)}</strong></div></div><div className="detail-section"><div className="section-heading"><h3>Detail item</h3></div><div className="mini-table"><div className="mini-head"><span>Deskripsi</span><span>Qty</span><span>Harga</span><span>Jumlah</span></div>{invoice.items.map((item, index) => <div className="mini-row" key={item.id ?? index}><span><strong>{item.description}</strong><small>{item.details || ""}</small></span><span>{item.quantity || "-"}</span><span>{item.price ? money(item.price) : "-"}</span><strong>{money(item.amount)}</strong></div>)}</div></div><div className="detail-section"><div className="section-heading"><h3>Riwayat pembayaran</h3><button className="button small primary" onClick={onPayment}><Plus size={15} />Tambah pembayaran</button></div>{invoice.payments.length === 0 ? <p className="muted">Belum ada pembayaran.</p> : <div className="payment-list">{invoice.payments.map((payment) => <div className="payment-line" key={payment.id}><div className="payment-icon"><Banknote size={17} /></div><div><strong>{payment.description}</strong><small>{formatDate(payment.paymentDate)} • {payment.method}{payment.bank ? ` • ${payment.bank}` : ""}</small></div><strong className="green-text">{money(payment.amount)}</strong><button className="text-button" onClick={() => api<{ receipt: Receipt }>(`/api/payments/${payment.id}/receipt`, { method: "POST", body: JSON.stringify({}) }).then(() => onNotice("Kuitansi dibuat. Lihat di menu Kuitansi.")).catch((error) => onError(error.message))}>Kuitansi</button></div>)}</div>}</div></div><div className="modal-actions"><button className="button ghost" onClick={onClose}>Tutup</button><button className="button secondary" onClick={reload}>Muat ulang data</button></div></section></div>;
}

function PaymentForm({ invoice, onClose, onSaved, onError }: { invoice: Invoice; onClose: () => void; onSaved: (invoice: Invoice) => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<PaymentDraft>({ paymentDate: today(), description: "Pembayaran", amount: String(invoice.remaining), bank: "", method: "Transfer", notes: "" });
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { const result = await api<{ invoice: Invoice }>(`/api/invoices/${invoice.id}/payments`, { method: "POST", body: JSON.stringify(draft) }); onSaved(result.invoice); } catch (error) { onError(error instanceof Error ? error.message : "Gagal mencatat pembayaran."); } finally { setBusy(false); }
  }
  return <Modal title="Tambah pembayaran" onClose={onClose}><form className="form-content" onSubmit={save}><div className="payment-summary"><span>Sisa tagihan saat ini</span><strong>{money(invoice.remaining)}</strong></div><label>Tanggal<input required type="date" value={draft.paymentDate} onChange={(event) => setDraft({ ...draft, paymentDate: event.target.value })} /></label><label>Deskripsi<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Nominal<input required type="number" min="0" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label><div className="form-grid two"><label>Bank<input value={draft.bank} onChange={(event) => setDraft({ ...draft, bank: event.target.value })} placeholder="Contoh: BSI" /></label><label>Metode<select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}><option>Transfer</option><option>Cash</option><option>QRIS</option><option>Lainnya</option></select></label></div><label>Keterangan<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} /></label><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? "Menyimpan..." : "Simpan pembayaran"}</button></div></form></Modal>;
}

function PaymentsPage({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");
  const load = () => api<{ payments: Payment[] }>(`/api/payments?search=${encodeURIComponent(search)}`).then((result) => setPayments(result.payments)).catch((error) => onError(error.message));
  useEffect(() => { void load(); }, [search]);
  async function makeReceipt(payment: Payment) {
    try { await api(`/api/payments/${payment.id}/receipt`, { method: "POST", body: JSON.stringify({}) }); onNotice("Kuitansi berhasil dibuat."); } catch (error) { onError(error instanceof Error ? error.message : "Gagal membuat kuitansi."); }
  }
  return <><PageIntro eyebrow="ARUS KAS MASUK" title="Pembayaran" description="Riwayat pembayaran dari seluruh invoice." /><div className="toolbar"><div className="search-box"><Search size={18} /><input placeholder="Cari pembayaran, invoice, customer..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Customer</th><th>Invoice</th><th>Deskripsi</th><th>Bank / Metode</th><th>Nominal</th><th /></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paymentDate)}</td><td>{payment.invoice?.customerName ?? "-"}</td><td><strong>{payment.invoice?.number ?? "-"}</strong></td><td>{payment.description}</td><td>{payment.bank || payment.method}<small>{payment.bank ? payment.method : ""}</small></td><td><strong className="green-text">{money(payment.amount)}</strong></td><td><button className="button small secondary" onClick={() => void makeReceipt(payment)}><ReceiptText size={14} />Kuitansi</button></td></tr>)}</tbody></table>{payments.length === 0 && <div className="empty-state"><Banknote size={26} /><h3>Belum ada pembayaran</h3><p>Pembayaran yang dicatat dari detail invoice akan muncul di sini.</p></div>}</div></section></>;
}

function ReceiptsPage({ onError }: { onError: (message: string) => void }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => { api<{ receipts: Receipt[] }>("/api/receipts").then((result) => setReceipts(result.receipts)).catch((error) => onError(error.message)); }, [onError]);
  return <><PageIntro eyebrow="BUKTI PEMBAYARAN" title="Kuitansi" description="Kuitansi yang dibuat dari payment history invoice." /><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Tanggal</th><th>Telah diterima dari</th><th>Untuk pembayaran</th><th>Nominal</th><th /></tr></thead><tbody>{receipts.map((receipt) => { const previewUrl = `/api/receipts/${receipt.id}/pdf?inline=1`; return <tr key={receipt.id}><td><strong>{receipt.number}</strong></td><td>{formatDate(receipt.receiptDate)}</td><td>{receipt.receivedFrom}</td><td>{receipt.purpose}<small>{receipt.invoice?.number ?? ""}</small></td><td><strong>{money(receipt.amount)}</strong></td><td><div className="row-actions"><a className="button small secondary" href={previewUrl} target="_blank" rel="noreferrer"><FileText size={14} />Preview</a><a className="button small secondary" href={`/api/receipts/${receipt.id}/pdf`}><ArrowDownToLine size={14} />Download</a><button className="button small secondary" onClick={() => window.open(previewUrl, "_blank")}><ClipboardList size={14} />Print</button></div></td></tr>; })}</tbody></table>{receipts.length === 0 && <div className="empty-state"><ReceiptText size={26} /><h3>Belum ada kuitansi</h3><p>Buat kuitansi dari riwayat pembayaran invoice.</p></div>}</div></section></>;
}

function SettingsPage({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [saving, setSaving] = useState(false);
  const [newBank, setNewBank] = useState({ bankName: "", accountNumber: "", accountName: "", isPrimary: false });
  useEffect(() => {
    api<{ settings: CompanySettings; banks: Bank[] }>("/api/settings")
      .then((result) => { setSettings(result.settings); setBanks(result.banks); })
      .catch((error) => onError(error.message));
  }, [onError]);
  if (!settings) return <LoadingBlock />;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api<{ settings: CompanySettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(settings) });
      setSettings(result.settings);
      onNotice("Pengaturan berhasil disimpan.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }

  async function addBank(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ bank: Bank }>("/api/settings/banks", { method: "POST", body: JSON.stringify(newBank) });
      setBanks((current) => [...current, result.bank]);
      setNewBank({ bankName: "", accountNumber: "", accountName: "", isPrimary: false });
      onNotice("Rekening berhasil ditambahkan.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal menambah rekening.");
    }
  }

  async function uploadAsset(event: React.ChangeEvent<HTMLInputElement>, key: "logoDataUrl" | "signatureDataUrl") {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSettings((current) => current ? { ...current, [key]: String(reader.result) } : current);
    reader.readAsDataURL(file);
  }

  return <>
    <PageIntro eyebrow="KONFIGURASI" title="Pengaturan" description="Kelola identitas perusahaan, admin, rekening, dan tampilan dokumen." />
    <form onSubmit={save} className="settings-layout">
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">IDENTITAS PERUSAHAAN</p><h3>Data utama</h3></div><Settings size={20} /></div>
        <div className="asset-upload">
          <div className="asset-preview">{settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="Logo perusahaan" /> : <span>N</span>}</div>
          <label className="button small secondary">Unggah logo<input type="file" accept="image/*" onChange={(event) => void uploadAsset(event, "logoDataUrl")} hidden /></label>
          <small>PNG/JPG, digunakan sebagai logo dan cap digital PDF.</small>
        </div>
        <div className="form-grid two">
          <label>Nama perusahaan<input value={settings.companyName} onChange={(event) => setSettings({ ...settings, companyName: event.target.value })} /></label>
          <label>Nama brand<input value={settings.brandName} onChange={(event) => setSettings({ ...settings, brandName: event.target.value })} /></label>
          <label className="span-two">Alamat<textarea rows={3} value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} /></label>
          <label>WhatsApp<input value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} /></label>
          <label>Email<input type="email" value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} /></label>
          <label>Website<input value={settings.website} onChange={(event) => setSettings({ ...settings, website: event.target.value })} /></label>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">ADMIN & TANDA TANGAN</p><h3>Penanggung jawab dokumen</h3></div><ShieldCheck size={20} /></div>
        <div className="form-grid two">
          <label>Nama admin / penanggung jawab<input value={settings.adminName} onChange={(event) => setSettings({ ...settings, adminName: event.target.value })} /></label>
          <label>Jabatan admin<input value={settings.adminTitle} onChange={(event) => setSettings({ ...settings, adminTitle: event.target.value })} /></label>
        </div>
        <div className="asset-upload signature">
          <div className="signature-preview">{settings.signatureDataUrl ? <img src={settings.signatureDataUrl} alt="Tanda tangan" /> : <span>Tanda tangan belum diatur</span>}</div>
          <label className="button small secondary">Unggah tanda tangan<input type="file" accept="image/*" onChange={(event) => void uploadAsset(event, "signatureDataUrl")} hidden /></label>
          <small>Logo perusahaan digunakan sebagai cap digital di dekat tanda tangan.</small>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">DOKUMEN</p><h3>Template PDF</h3></div><FileText size={20} /></div>
        <div className="form-grid two">
          <label>Judul invoice<input value={settings.invoiceTitle} onChange={(event) => setSettings({ ...settings, invoiceTitle: event.target.value })} /></label>
          <label>Judul kuitansi<input value={settings.receiptTitle} onChange={(event) => setSettings({ ...settings, receiptTitle: event.target.value })} /></label>
          <label className="span-two">Include default PDF<textarea rows={4} value={settings.includeText} onChange={(event) => setSettings({ ...settings, includeText: event.target.value })} placeholder={"Contoh:\n• Tiket Pesawat\n• Hotel\n• Transportasi"} /></label>
          <label className="span-two">Catatan default PDF<textarea rows={8} value={settings.pdfNotes} onChange={(event) => setSettings({ ...settings, pdfNotes: event.target.value })} /></label>
          <label className="span-two">Footer PDF<textarea rows={3} value={settings.footer} onChange={(event) => setSettings({ ...settings, footer: event.target.value })} /></label>
          <label className="span-two">Instruksi pembayaran<textarea rows={3} value={settings.notes} onChange={(event) => setSettings({ ...settings, notes: event.target.value })} /></label>
        </div>
      </section>
      <section className="panel settings-card bank-settings">
        <div className="panel-heading"><div><p className="eyebrow">PEMBAYARAN</p><h3>Rekening bank</h3></div><Banknote size={20} /></div>
        {banks.map((bank) => <div className="bank-row" key={bank.id}><div className="bank-badge">{bank.bankName.slice(0, 2).toUpperCase()}</div><div><strong>{bank.bankName}</strong><span>{bank.accountNumber} • {bank.accountName}</span></div>{bank.isPrimary && <span className="primary-label">Utama</span>}</div>)}
        <div className="add-bank"><h4>Tambah rekening</h4><div className="form-grid three"><label>Bank<input value={newBank.bankName} onChange={(event) => setNewBank({ ...newBank, bankName: event.target.value })} /></label><label>Nomor rekening<input value={newBank.accountNumber} onChange={(event) => setNewBank({ ...newBank, accountNumber: event.target.value })} /></label><label>Nama rekening<input value={newBank.accountName} onChange={(event) => setNewBank({ ...newBank, accountName: event.target.value })} /></label></div><button type="button" className="button small secondary" onClick={(event) => void addBank(event as unknown as React.FormEvent)}><Plus size={15} />Tambah rekening</button></div>
      </section>
      <div className="settings-save"><button className="button primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan semua pengaturan"}</button></div>
    </form>
  </>;
}

function LoadingBlock() { return <div className="loading-block"><div className="spinner" /><span>Memuat data...</span></div>; }

export default App;