---
name: Full-stack artifact preview
description: Preview routing rule for a single Express server that serves both the web UI and API.
---

When one Express service serves both the React UI and `/api` routes, the registered artifact preview must target `/` and route the service from `/`. An API-only preview prefix can make the proxy request `/api/` and show `Cannot GET /api/` even while the server and health endpoint are running.

**Why:** The preview proxy follows the artifact manifest's preview path; it does not automatically infer that an API artifact also serves a web shell.

**How to apply:** Keep the server bound to `0.0.0.0` using the Replit-provided `PORT`, and validate manifest edits through `verifyAndReplaceArtifactToml` rather than editing artifact metadata directly.