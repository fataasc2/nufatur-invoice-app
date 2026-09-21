---
name: PDFKit bundle assets
description: Runtime requirement for PDFKit when the Express server is bundled with esbuild.
---

PDFKit standard fonts are loaded from AFM files at runtime. When the server is bundled with esbuild, those files are not embedded automatically and must be copied into the deployed server bundle.

**Why:** Without the copied AFM data, the first invoice or receipt PDF request fails with a missing `Helvetica.afm` file even though the TypeScript build succeeds.

**How to apply:** Any future change to the PDF generator or server bundle must preserve the build step that copies PDFKit's `js/data` directory into the server distribution.