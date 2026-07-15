# Tenant Portal — Roadmap

A direction to chip away at over time. The seed is the CAM backup work: once a
tenant can open a signed link to *their* CAM statement with drill-down into the
supporting invoices, that same authenticated tenant surface can grow into a full
tenant-facing portal onto the backend we're building.

Not all of this is needed today — it's the north star so each piece we build
lands in a coherent whole.

## Foundation (in progress)

- **CAM backup attachments** — invoices/statements attached to each property
  expense line (by GL account), kept with that year's numbers as permanent
  backup. Per-property downloadable package (Tax · Insurance · Operating).
  *(Phase 1 — shipping now.)*

## Phase 2 — the tenant CAM link  *(retail shipped)*

- ✅ A **signed, revocable, per-tenant link** (`lib/cam/tenantLink` — HMAC token
  + link store) opens a public page (`/statement/[token]`) showing **that
  tenant's CAM statement**, each expense line's backup clickable to view/
  download — only files flagged shareable (the CAM-backup "package" flag).
  Minted / copied / revoked from the tenant's statement on the CAM recon page.
- ✅ **Escrow detail** — month-by-month CAM/RET escrow from the rent rolls
  (`monthlyRentRollEscrow`), shown inline on the statement.
- ✅ Access logging (view count + last-viewed per link) and optional expiry.
- **TODO:** the **office** side (retail uses `loadRetailRecon`; office needs the
  same shared loader + `kind:"office"` in the public route), and consolidate the
  gated retail route onto `loadRetailRecon` to drop the duplicated compute.

## Phase 3+ — full tenant portal

Grow the tenant link into a durable per-tenant home:

- **Statements** — CAM/RET statements, interim/move-out statements, history.
- **Open balances / ledger** — current AR, what's due, payment history (ties to
  the AR sub-ledger from the system-of-record roadmap).
- **Lease documents** — the tenant's lease, amendments, COIs, notices (reuse the
  attachment pattern, scoped to the unit).
- **Communication** — a shared thread for landlord↔tenant messages; notices.
- **Calendar of important dates** — statement-due / payment dates, and
  community events (e.g. food trucks at the business parks). A shared property
  calendar the tenant sees on their portal home.
- **Self-service** — submit **maintenance requests** and **conference-room
  reservations** from the portal (both already exist as public flows — wire them
  to the authenticated tenant identity).

## Design principles

- **One tenant identity** (by unitRef) threads every surface; a link scopes to
  exactly that tenant and never leaks other tenants' data.
- **Reuse, don't rebuild** — statements, escrow, maintenance, reservations, and
  share-links all exist; the portal is assembly + a tenant auth surface.
- **Signed links first, accounts later** — start with unguessable revocable
  links (no tenant login); graduate to real tenant logins if/when it's worth the
  friction.
- Every document a tenant sees is **explicitly flagged shareable** — never
  expose backup or ledger detail that wasn't marked for tenant view.
