# NUFATUR Invoice App

Aplikasi internal NUFATUR untuk mengelola invoice, pembayaran, kuitansi, dan PDF dokumen perusahaan.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/nufatur.ts` — API autentikasi, invoice, payment, receipt, settings, export, dan PDF.
- `artifacts/api-server/src/lib/pdf.ts` — generator PDF A4 invoice/kuitansi.
- `artifacts/nufatur-web/src/App.tsx` — UI utama responsive dan alur form.
- `artifacts/nufatur-web/src/styles.css` — tema visual NUFATUR.
- `lib/db/src/schema/index.ts` — schema PostgreSQL relasional.
- `artifacts/nufatur-web/public/` — manifest, service worker, dan ikon PWA.

## Architecture decisions

- UI dibuild dengan Vite lalu disalin ke bundle Express agar preview dan deployment memakai satu origin serta satu workflow.
- Sesi login memakai cookie HttpOnly bertanda tangan HMAC; password awal hanya disimpan sebagai hash scrypt.
- Status invoice dihitung dari total pembayaran dan due date di server, bukan dari tombol manual.
- Data dummy dibuat sekali saat schema pertama kali dipakai; penanda `seeded_at` mencegah data muncul kembali setelah dihapus.
- PDF dibuat sebagai dokumen A4 server-side dengan PDFKit, bukan screenshot halaman web.

## Product

Login internal, dashboard ringkas, CRUD invoice dengan item dinamis, status otomatis, payment history, kuitansi dari pembayaran, PDF A4, export CSV, pengaturan identitas/rekening/template, dan PWA responsive.

## User preferences

- Prioritas produk: fungsi, stabilitas, kemudahan untuk pengguna senior, dan output PDF; hindari UI ramai atau over-engineering.

## Gotchas

- Workflow utama harus menjalankan `PORT=5000 pnpm --filter @workspace/api-server run dev`.
- Setelah dependency atau schema berubah, jalankan `pnpm install`, `pnpm --filter @workspace/db run push`, lalu restart `Start application`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
