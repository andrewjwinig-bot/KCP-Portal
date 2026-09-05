# Workflow preferences

- After pushing a feature branch, always open a PR against `main` and merge it (squash) automatically without waiting for the user to do it. The user has standing approval for this.

# AvidXchange submissions — invoices/statements MUST be PDFs in the shared invoice format

Anything sent to AP for processing (`kormancommercial@avidbill.com`) as the billable **invoice/statement** MUST be a **PDF** and MUST follow the same look and formatting as the portal's other invoice PDFs — one consistent invoice template across every flow (Allocated Expense, Credit Card, Payroll, commissions). Never send a spreadsheet (or any non-PDF) to Avid *as the invoice*. When you add or change anything that emails Avid, the invoice attachment is a PDF built from the shared invoice look — do NOT hand-roll a new invoice layout; reuse/extend the existing invoice PDF builders so all Avid-bound invoices stay visually identical.

- **No zips, one invoice per email.** AvidXchange cannot open a ZIP and ingests one invoice per email, so NEVER send Avid a `.zip` (or multiple invoices in one file/email). Each invoice PDF goes to `kormancommercial@avidbill.com` as its OWN email with a single PDF attachment. The cc'd team (Marie/Drew/Harry) get ONE separate summary email instead of being copied on every invoice — that email carries the per-building summary + the xlsx references (and may include the full zip, which is fine for them since only Avid can't open it). Shared helper: `lib/invoicing/avidDelivery.ts` (`deliverInvoicesToAvid`) — all three flows (Allocated, Credit Card, Payroll) send through it.
- Supporting **xlsx workbooks** (allocation summary, GL Journal Entry, TOP SHEET) are internal references for the cc'd controller/Drew only — they are NOT the Avid invoice. They ride only on the team summary email, never as the thing Avid processes.
- Current invoice PDF builders: `lib/allocated-invoicer/invoice.ts` (`buildAllocInvoicePdf`), `lib/expenses/invoice.ts` (`buildInvoicePdf`), `lib/pdf/renderInvoicePdf.ts` (payroll), `lib/pdf/renderCommissionInvoicePdf.ts`. These should share one consistent look; if they drift, reconcile them rather than adding a fourth style.

# Known data gaps / accepted exceptions (do NOT re-flag as bugs)

- **Payroll allocation — Harry Feldman sums to ~94.86%, not 100%.** This is intentional and accepted, NOT a keying error. His allocation workbook row (`data/allocation.xlsx`) is: ~85% across the shopping centers, 5% Interstate/Bellmawr (`0800`), 5% Eastwick (the `Eastwick` column → "Eastwick JV"), and **5% Middletown**. Middletown is a land parcel Korman owns but the portal does NOT track (no property code, no allocation column), so that ~5.14% has nowhere to land and his tracked total reads 94.86%. The dashboard allocation-gap warning will keep flagging him — that's expected. Leave it as-is unless the user decides to add Middletown as a tracked land property (they'd supply its GL code, and Nancy would add a `Middletown` column with the 5% to the workbook).

# UI consistency — pills, badges, fonts, sizes

The user has flagged repeated drift in pill / chip / badge styling across new pages. Do NOT re-invent chip styles inline. Always use the shared primitives:

- `Pill` + `Badge` + `StatPill` components all live in `app/components/Pill.tsx`. Use `Pill` for colored status/priority chips, `Badge` for tab counters, and `StatPill` for any "label + big number" KPI tile (big number on top, small muted label below). The `.pill` / `.pills` CSS classes in `globals.css` back StatPill — use `<div className="pills">` to wrap a row of them.
- Tone palettes (`maintenanceStatusTone`, `priorityTone`, `reservationStatusTone`, `TONE_BLUE`, `TONE_NEUTRAL`, etc.) live in the same file.
- Canonical pill footprint: `11px / 700 weight`, `padding 2px 8px`, `borderRadius 999`. Canonical badge footprint: `padding 1px 7px`.
- Section labels use `11px / 700 / uppercase / 0.06em letter-spacing / var(--muted)`. Tile big-numbers use `22–28px / 800–900`.
- If a new semantic doesn't fit an existing tone, add a new exported tone helper in `Pill.tsx` — don't inline a new `{bg, fg, border}` tuple in a page.
- When adding a new admin page, reuse the existing tab + filter + table primitives from `/maintenance/page.tsx` or `/reservations/page.tsx` rather than starting from scratch.
- For date inputs, ALWAYS use `Calendar` from `app/components/Calendar.tsx` — never reach for `<input type="date">`. Pass `variant="card"` on admin pages and `variant="underline"` on public-facing tenant forms. Use `disableWeekends` and `minISO`/`maxISO` where the business rule warrants.

**Before building ANY new UI, look at how existing pages already do it and match them — the user has repeatedly flagged that new pages drift from the established look. Reuse the shared component, don't reinvent. Known shared primitives:**
- **Downloads/exports** → `DownloadMenu` from `app/components/DownloadMenu.tsx` (the "Download ▾" dropdown used by Operating Statements, Reprojections, Budgets). Items take `href` (link) or `onClick` (client-side Excel/PDF). Never hand-roll separate per-format download buttons.
- **Collapsible "accounts that didn't fit" lists** → `AccountListCard` from `app/components/AccountListCard.tsx` (collapsed by default, Account/Name/Amount table + total) — shared by Operating Statements ("Non-operating accounts") and the Cash Sheet ("Accounts not mapped to a bucket").
- When a section's purpose mirrors something on another page (a download menu, a hidden-accounts list, a KPI row, a tab+filter+table), copy that page's component/markup/spacing rather than approximating it inline.

**Hovers / tooltips — ALWAYS use the shared rich style, never a plain native `title=` or a tiny SVG `<title>`, whenever the hover conveys real data.** The user wants every data-bearing hover to feel considered: a styled card with a title, colored value rows, and an optional footer/delta line — not a small plain browser tooltip. This is the default for ALL future hovers where applicable; do not ship a plain `title=` tooltip for a value/breakdown and wait to be asked to upgrade it.
- **In an SVG chart** → `ChartTooltip` (+ `HoverBands`) from `app/components/ChartTooltip.tsx`. Track a hovered index in the chart, render `HoverBands` last (full-height hit bands + dashed guide line), enlarge the point(s) on the active index, and render `ChartTooltip` with pre-formatted string rows (title = the x label; one row per series with its color; footer = the delta/variance). Reference implementation: the Management Fees chart (`app/financials/management-fees/page.tsx`).
- **On an HTML element** (a table cell, a chip/pill, an inline callout) → `HoverCard` from `app/components/HoverCard.tsx` — same card look, portal-rendered so table/card overflow never clips it. Pass `title`, `rows`, optional `footer`.
- A bare `title=` is fine ONLY for a trivial action/label affordance (a "Close"/"Download"/"Open in new tab" icon button) — never for numbers, breakdowns, lease terms, variances, or any figure a user would want to read clearly.

# Excel exports — totals must be live formulas, never static numbers

The user wants downloaded workbooks to stay accurate and be easy to edit. **Any total, subtotal, or rollup row/column in an .xlsx export MUST be written as a live Excel formula (`=SUM(...)`, cross-references, etc.), NOT a value computed in JS and dropped in as a static number.** Line-item cells carry the source values; every cell that aggregates them is a formula that references the exact source cells above/beside it — so editing a line flows through and the numbers always tie. This applies to both export stacks:

- **ExcelJS** (server-side, styled — `statementExport.ts`, `reprojExport.ts`, `budgetDownload.ts`, `topSheet.ts`): `cell.value = { formula: "SUM(C5:C9)", result: <cachedValue> }`. Always cache the JS-computed `result` so the value shows before Excel recalcs.
- **SheetJS/xlsx** (mostly client-side AoA — `cash-sheet/export.ts`, `payroll/export.ts`, `allocation/export.ts`, `allocated-invoicer/export.ts`): after `aoa_to_sheet`, set `ws[addr] = { t: "n", f: "SUM(D5:D6)", v: <cachedValue> }` (or add `.f` to an existing numeric cell). Address cells with `XLSX.utils.encode_cell` / `encode_col`.

**Safety pattern (follow it):** when a total's relationship to its sources is anything beyond a trivial column sum (rollups, signed differences like `NOI = Rev − Opex`, favorability-signed variance), evaluate the formula's expected value in JS and compare it to the known total; **write the formula only if it reconciles (within ~$0.50), else fall back to a static number** so a displayed value is never wrong on an unusual data shape. See `formulaFor`/`totalMoney` in `statementExport.ts` and `buildSum`/`colSum`/`varFormula` in `reprojExport.ts` for the reference implementation — copy that approach, don't reinvent it.

Reference points already converted: single-period Operating Statement, Full-Year statement, Reprojection, Budget download (all tabs), Cash Sheet Portfolio Total, Payroll summary + GL offset (`=-SUM(...)` so column H nets to $0), Allocation template, allocated-invoicer. **Exceptions that legitimately have no total row:** the Skyline import (one row per GL, no footer) and the rent-roll trend workbook (its "Total" is a per-period column, and percentages can't be summed). If you build a NEW export, wire its totals as formulas from the start.

# Tenant monthly statements (open A/R) — sources of truth

The tenant portal's Statements tab carries TWO statements: the annual CAM/RET
reconciliation (unchanged) and the **monthly statement of account** — every open
charge Skyline is carrying for that tenant, aged, categorized, and paired with
how-to-pay instructions. Sources of truth:

- **The Skyline "Statement" report is the only input.** Parser:
  `lib/statements/parseSkylineStatements.ts`. Never hand-key a tenant's open
  balance anywhere.
- **A statement has THREE parts and the amount due is the sum of two of them:**
  the lines above `PREVIOUS MONTH ENDING BALANCE` (already outstanding), then
  `CURRENT CHARGES` … `TOTAL CURRENT` (newly billed this month). **Total Amount
  Due = PREVIOUS MONTH ENDING BALANCE + TOTAL CURRENT.** Reading the first
  subtotal as the amount due understates every tenant with current charges —
  that shipped once and put $1,164.90 in front of a tenant who owed $14,510.98.
  `reportedBalance` is the grand total; `priorBalance`/`currentTotal` are the
  halves; each charge carries its `section`. Each half reconciles to its OWN
  printed subtotal, and `tiesOut` requires both halves and the grand total.
  Two Crystal Reports quirks it also handles (don't "fix" them out): a tenant
  continued across a page break, and a detail group re-rendered 2–4× (deduped
  per section, only when the dedupe reconciles).
- **The Statement report is an OPEN-ITEMS report, and its sections are relative
  to WHEN it was run — not to the statement date.** Run after the 1st, that
  month's charges are already outstanding: they print above `PREVIOUS MONTH
  ENDING BALANCE` and `TOTAL CURRENT` is legitimately 0 for every tenant. A
  tenant who has paid simply has fewer open lines and a smaller balance. None of
  that indicates a bad export — do NOT add a check that refuses a file for
  having empty current-charge sections. That was tried and it blocked every
  real import: the evidence against it is that 53 of 67 tenants in the sample
  export carry September charges (194 rows) in the prior section. It also means
  the portal reflects the last import, so re-import to pick up payments.
- **Unit refs are stored in the app's canonical form** — Skyline's `-CU` charge
  suffix stripped (`2300-1817-CU` → `2300-1817`), matching the rent roll, the
  recon rosters and the portal token. `skylineUnitRef` keeps the raw value. If a
  portal lookup ever misses, check this first.
- **Storage**: one record per statement period (`lib/statements/store.ts`,
  prefix `tenant-statements`, keyed `YYYY-MM`). Uploading a second export into
  the same month (SC and BP run separately) MERGES by unit ref — it never
  replaces the month. A period is hidden from tenants until **published**;
  re-importing a published month keeps it published.
- **The tie-out is the publish gate** (`shouldAutoPublish` in `store.ts`): a
  month where EVERY tenant reconciles publishes itself on import; a single
  untied tenant holds the WHOLE month back, judged on the merged month so a
  later clean export can't publish over an earlier one's bad tenant. It never
  un-publishes — a tenant that stops reconciling is flagged "under review" on
  their own statement rather than retracting everyone else's. Staff can switch
  auto-publish off per browser (`kcp.stmt.autoPublish`). Because tying out is the
  norm, the roster has NO "ties out" column — only the exception is flagged, as a
  REVIEW pill on the tenant's own row plus a banner that filters to them.
- **Every derived number comes from `lib/statements/summary.ts`** (`summarize`,
  `agingOf`, `statementCharges`) — the portal, the PDF and the admin roster all
  call it, so they cannot disagree. Aging is by CALENDAR MONTH against the
  statement period (this month = Current, last month = 1–30, …), which is how a
  rent ledger actually ages.
- **Order mirrors the laser statement — do NOT re-sort it.** Tenants stay in the
  sequence Skyline printed (which is NOT alphabetical: `1100-34` precedes
  `1100-12330`), and charges stay in printed order (oldest first, the aggregate
  "Open Credits" row last). The store merge preserves that sequence, updating a
  re-imported tenant in place and appending a second export's new tenants after
  the first's. The admin roster defaults to "Statement order" so it reads down
  alongside the paper statements; "Largest balance first" is an opt-in sort.
  Statement order is already property-grouped, so the roster draws a subtotal
  band per property (open A/R, past due, tenant count) plus a clickable
  "Open A/R by property" strip that filters. A tenant's expanded charge list has
  sortable columns (date / description / type / amount) that always default —
  and return on a third click — to the printed order.
- **Payment instructions** (`lib/statements/payment.ts`) are editable data, not
  copy in a component: built-in defaults < the global override < a per-property
  override, edited on the Monthly Statements page. Do NOT hard-code remit-to or
  AR contact details into the portal or the PDF. Bank/routing numbers stay OUT
  of the portal — the ACH note points tenants at AR instead.
- **The PDF** (`lib/statements/monthlyStatementPdf.ts`) deliberately mirrors
  `lib/cam/retail/statementPdf.ts` — same letterhead, tinted section bars, zebra
  rows, boxed balance. If one drifts, reconcile them rather than adding a style.
- **The portal's Statements tab is ONE chronological index, not a toggle.**
  Everything on the account in one timeline, newest first, grouped by year: each
  month's statement of account, with that year's CAM/RET reconciliation sitting
  alongside its December as the document that closes the year. Selecting a row
  opens it below the index. A segmented control between "account balance" and
  "reconciliation" split one timeline into two views of the same account — don't
  reintroduce it.
- **Say "open charges only, as of <date>" wherever a balance appears.** The
  report lists unpaid items, so a tenant who has paid sees their rent drop off;
  without the caveat they read that as "you forgot to bill me". The as-of date
  is the import THIS tenant's figures came from (`statement.importedAt`), not the
  period — a later upload covering other buildings doesn't make their numbers
  newer.
- **The portal does NOT require a year-end reconciliation.** A tenant can have a
  monthly statement and never appear in a recon (5 of the 10 properties in the
  sample export have no recon fixture), so the shell's identity comes from
  `/api/portal/[token]` — unit ref, suite, and a name from the rent roll falling
  back to their latest statement — and the reconciliation is just one more
  document when it exists. Don't reintroduce a hard dependency on it. NOTE: the
  project's tsconfig is non-strict, so a null `data` (the recon) will NOT be
  caught for you — guard it.
- **Portal links are managed from Monthly Statements as well as the recon page.**
  Shared control `app/cam-recon/TenantShareLink.tsx` (mint / copy / email / PIN /
  revoke) — reuse it, don't build a second share flow. Its API authorizes on
  EITHER `/cam-recon` or `/tenant-statements` (the controller has the latter
  only). Roster status comes from the bulk endpoint
  `/api/tenant-statements/links?period=` so 67 rows don't fire 67 requests; the
  link's (year, kind) resolve as existing link → newest recon year → the
  statement's year, so a never-reconciled tenant still gets a working portal.
- **Payment declarations are a remittance advice, NOT a payment.** Nothing in
  `lib/statements/remittance.ts` moves money or marks a charge paid; it records
  which open charges a tenant says their cheque covers, so a partial payment
  isn't applied by guesswork. The tenant selects charges (everything ticked by
  default — paying in full is what we want), and on confirming gets a 6-character
  reference for the cheque memo; AR is emailed the application immediately and it
  shows on the roster. **The amount is always recomputed server-side from the
  stored statement** (`resolveSelection`) — a client-supplied total is ignored,
  because that figure is what a payment gets applied against. The reference
  alphabet excludes I/L/O/U so a handwritten memo line can't be misread.
- **The reverse flow — a payment we hold and can't apply.** Staff record the
  amount on the roster ("Record a payment") and the tenant is emailed a link to
  allocate it against their own open charges. Same selection UI, but the target
  is the amount RECEIVED rather than the whole balance, and it starts with
  nothing ticked so they build up to it. An exact match isn't required — a
  cheque often part-pays a charge — so the gap is recorded and shown to staff as
  "$X of the $Y received is still unapplied" rather than being reconciled away.
  Answering closes the request (`AllocationRequest` → `Remittance.requestId` +
  `receivedAmount`). The request is saved even when the email can't go, so a
  cheque is never lost because sending failed.
- Admin page `/tenant-statements`; portal view `app/portal/[token]/MonthlyStatements.tsx`;
  tenant APIs `/api/portal/[token]/monthly[/pdf]` (published periods only, scoped
  to the token's one unit).

# Investor K-1 delivery — sources of truth

Schedule K-1s carry taxpayer IDs, income allocations and capital accounts. This
is the most sensitive data in the app; the rules below are safety rules, not
preferences.

- **The owner roster is `lib/properties/ownership.ts`** (`PROPERTY_OWNERSHIP`).
  Nothing about who holds an interest is re-keyed for K-1s. `hasK1Distribution`
  marks the partnerships that actually distribute; 7010 Parkwood was added to
  that set (21 owners).
- **Matching a file to an owner only ever SUGGESTS** (`matchK1ToOwner` in
  `lib/investors/k1.ts`). Evidence in order: vendor code → trust/detailed name →
  plain name, and a plain name only counts when ONE owner bears it. Anything
  weaker returns no suggestion with the tied `candidates` listed. **6 of
  Parkwood's 21 owners share a name with another owner** (Alison Korman Feldman
  holds both a GST trust interest and a personal one), so a filename with only a
  name genuinely cannot resolve them — do NOT "improve" the matcher into
  guessing there.
- **The family surname is NOT noise.** Putting "Korman" in the matcher's
  stop-word list collapsed "Lawrence M. Korman" to "lawrence" and collided him
  with Lawrence Isard. Only property and form boilerplate belongs in `NOISE`.
- **A person confirms every file, and that is the publish gate**
  (`publishBlockers`): every document confirmed against a DISTINCT owner, or the
  year won't publish. Un-confirming a document also un-publishes it.
- **Access is its own gate — deliberately NOT the `/investors` prefix.** Alison
  can reach the ownership page and is herself a Parkwood owner, so inheriting
  that prefix would show her every co-owner's K-1. The page lives at
  `/investor-k1`, keyed `investor-k1`, granted to Drew and Harry only.
- **Investor links are domain-separated from tenant links** (`lib/investors/k1Link.ts`,
  HMAC prefixed `kcp.investor.k1.v1:`). Both fall back to `SITE_AUTH_SECRET`, so
  without that prefix a tenant token could open a K-1. Pinned by
  `k1Link.test.ts` — don't collapse the two signers into one.
- **The PIN is mandatory** (unlike the tenant portal, where it's optional), PDFs
  live in private blob storage and are streamed through an authorized route that
  re-checks `published && ownerId === link.ownerId`, and the share email carries
  a LINK, never the K-1 as an attachment. The portal deliberately shows only the
  documents — no percentages, no co-owners, no capital accounts.
- `/investor/[token]` is public (token+PIN gated), so it's excluded in
  `middleware.ts` and `AppShell`. NOTE the middleware exclusion is written
  `investor/` with the slash: bare `investor` also prefix-matches `/investors`
  and would make the whole ownership page public.

# CAM / RET reconciliation — sources of truth (do not duplicate data)

The user has repeatedly flagged data living in the wrong place / pages drifting. These are the canonical sources — read/write here, never re-key the same value somewhere else:

- **Per-tenant CAM methodology** (admin fee %, stipulated PRS per CAM/INS/RET category, expense-line exclusions, admin-fee exclusions, CAM cap, gross-lease flag) lives in `lib/cam/retailConfigSeed.ts` (`RETAIL_CONFIG_SEED`). This is what the **unit page** (`app/units/[unitRef]/CamConfigCard.tsx`, via `/api/cam-config/[unitRef]`) reads and edits, and what the reconciliation resolves. The unit page IS the source of truth. When a tenant's admin/PRS/exclusion is wrong or missing, fix it here — NEVER hard-code it on the roster.
- **Roster seeds** (`lib/cam/retail/seed/<code>.ts`) carry ONLY rent-roll facts: `sqft`, `camEscrow`/`insEscrow`/`retEscrow` (billed during the year), and partial-year `occPct`. Do NOT put `camPrs`/`insPrs`/`retPrs`/`adminFeePct`/exclusions on the roster — they belong in the config seed above.
- **A tenant on a reduced CAM pool** (e.g. a pad excluded from some expense lines) is modeled as real **expense-line exclusions** in the config seed (`excludedCamLines`), NOT a flat pool override. That way the excluded lines render struck-through on the statement, checked on the unit page, and listed in the Notes — and the effective pool falls out of the line math. Never back into a pool total with an override.
- **Reconciliation field precedence** (`lib/cam/retail/assemble.ts`): roster override → config stipulated/seed → computed-from-SF. Because methodology is in the config seed, the recon and the unit page always agree.
- **Property-wide insurance pool** is a single building figure (`RetailExpensePool.insAmount`). Recon-time corrections to it are PROPERTY-WIDE and live in `lib/cam/retail/poolStore.ts` (keyed by `<property>-<year>`), edited as the **Property Insurance row inside the Final Expense Summary** on the CAM Reconciliation page — NOT per tenant. Insurance is edited ONLY at the property level. The per-tenant `CamConfig.insAmountOverride` is no longer exposed on the unit page (the "Manual Insurance" UI was removed). **Wawa at Brookwood (`2300`) is a hardcoded special case** in `lib/cam/retail/assemble.ts`: its INS is billed on the building's **Liability Insurance** CAM line (~$40K), not the property INS pool (~$9K) — forced off the pool line so it holds regardless of saved config, and footnoted in the Tenant CAM Methodology table. Don't re-add a per-tenant insurance UI without revisiting this.
- **Retail Final Expense Summary** (the property-level editable expense table on the retail recon page, mirroring the office one): one card with every CAM operating-expense line, then **Property Insurance**, then **Real Estate Taxes**. CAM-line + RET FINAL overrides (CAM keyed by label, RET by key `"RET"`) live in `lib/cam/retail/finalStore.ts`; the insurance row is stored separately in `poolStore.ts` (key `insAmount`) but edited in the same card. All keyed by `<property>-<year>` and applied to the seeded pool in the retail GET so every tenant's CAM/INS/RET recomputes. The workbook seed (`seed/<code>.ts`) is the default; the stores only hold changed values. To the right of FINAL the card shows a **moving 3-year expense-history** trend (years before the recon year), separated by a vertical divider: retail from `lib/cam/retail/expenseHistory.ts` (code seed, per property), office from `lib/rentroll/baseYearExpenses.ts` (the same source as the Operating Expense History page). A **"Full Expense History →"** button deep-links to the property's full year-by-year page — both office and retail now live on the one **Operating Expense History** page `/rentroll/base-years?property=<code>` (office shows the base-year tools; retail shows a simple year-by-year table via `RetailHistoryCard`). `lib/cam/retail/expenseHistory.ts` holds only the **frozen prior years**; the **recon year column is pulled LIVE** from the reconciliation FINAL (effective pool + Final Expense Summary overrides) via the retail recon API, so it always reflects the actual finalized amount. When a recon year closes, move its finalized figures into `expenseHistory.ts` as the next frozen year.
- **Mixed-center expense allocation** (e.g. 7010 retail+office) has ONE source: `lib/cam/retail/allocation.ts` (`MixedCenter` / `MIXED_7010`). The retail pool, office pool, and the on-screen allocation breakdown are all DERIVED from it — add or change an expense line there once, never edit the derived pools directly.
- **Quarterly-billed tenants** (e.g. Wawa @ 9510) get their own dropdown entry **below the parent property** on the recon page (a pseudo-property keyed like `9510-WAWA-Q`), defined in `lib/cam/retail/quarterly.ts` (`QUARTERLY_BILLINGS`) and rendered by the `QuarterlyBilling` worksheet. Staff manually enter each quarter's eligible CAM expenses + RET; the lease share applies per quarter and the **YTD balance backs out billed/paid YTD** (`balance = due YTD − billed YTD`). Entered figures persist in `lib/cam/retail/quarterlyStore.ts` (`cam-retail-quarterly`, keyed `<key>-<year>`) via `/api/cam-recon/quarterly`. Their quarterly payments are NOT escrow (the annual recon roster keeps escrow 0). Eventually feed the eligible expenses from the monthly operating statements + link to the task tracker.
- **Office recon** config/expenses come from the office seeds + `/api/cam-recon/office`; same principle — one source.
- **Tie-out tests** (`lib/cam/retail/compute.*.test.ts`) are the guardrail. After any seeding/mapping change, run them; they must stay green (per-tenant balances tie to the workbook within a few dollars).

# CAM / RET reconciliation — page consistency

Office and retail recon pages + the per-tenant statement must look/behave the same. Reuse, don't reinvent:

- Shared building blocks already exist — use them: `OccCallout` (occupancy callout + hover lease term), `PortionPill` (RETAIL/OFFICE tag), `ImportInstructions` (`app/components/ImportInstructions.tsx`, Skyline steps; `stop` adds the double-charge warning), `BalanceRow` + `FinalBalanceRow` (statement waterfall + boxed balance), `CARD_TITLE` (large card titles).
- **Occupancy**: assume 100%; only flag tenants < 100% with the amber `(NN% occ)` callout (hover shows lease term). Tenant statements ALWAYS show the `× Occupancy` step so every calc to the amount due is visible.
- **Building Summary is always the top content card.**
- **Tenant statements**: one card with side-by-side columns (CAM/INS/RET for retail, CAM/RET for office), colored section labels, `BalanceRow` rows, `FinalBalanceRow` boxed balance — no per-block bordered cards. For retail, each column stacks its expense schedule (`ColumnSchedule` — Acct/Expense/Actual) above its reconciliation, so the single-line INS/RET pools sit beside the longer CAM schedule rather than each taking a near-empty full-width card.
- **Schedules + allocation tables** lead with an `Acct` (GL account) column on the far left.
- **Year-end**: exactly two compiled exports — "SC Year-End Adjustments" (shopping centers) and "BP Year-End Adjustments" (business parks) — as header buttons next to "All Tenant PDFs", with an ⓘ popover for the import steps. No per-building year-end. Posting date is fixed at 4/30 of the following year (no date picker).
- **Estimates** live on the dedicated `/cam-recon/estimates` page with the full import steps incl. the STOP-current-charges warning.
- Unit refs render as a `<code>` element (12px, default monospace) matching the Rent Roll. Building summary tables use whole dollars (`money0`); detail statements use cents (`money`). Gross-lease rows are dimmed (opacity) with a `(Gross)` marker. The recon page remembers the last-viewed property/year via `localStorage`.

When the user reports a value mismatch between pages, trace it to the shared source above and fix it there once — don't patch the symptom on one page.

# CAM / RET reconciliation — planned capabilities (roadmap / TODO)

Not built yet — captured so we build to them. The recon engine is a pure
function (pool + tenant inputs → CAM/INS/RET result) and fixtures are keyed
`byYear`, so these layer on top rather than requiring a rewrite. Near-term
sequence the user is following: finish the **9510** CAM/RET rec → the **condo
budget** → then stand up **monthly operating statements**. Long-term vision:
this program eventually replaces **Skyline** (the accounting system); until
then the user imports Skyline reports, so keep ingestion paths import-friendly.

- **Annual new-year reconciliations (all properties).** A 2026 rec runs early
  2027 (and so on each year). Add `byYear[<year>]` per fixture; methodology
  (PRS/admin/exclusions/cap/discount/gross lease) carries forward from the
  unit-page config automatically. The new-year work is sourcing that year's
  **final expenses** + **tenancy** (below).
- **Final expenses ← monthly operating statements.** Once operating statements
  exist, pull each year's CAM/INS/RET expense actuals from them (YTD during the
  year, finalized at year-end) instead of hand-seeding `seed/<code>.ts`; the
  Final Expense Summary becomes the reconcile-and-finalize step. Also drives a
  real-time **budget vs. actual** comparison.
- **Full-year tenancy roster (don't drop mid-year vacates).** Build the roster
  from the **whole year's** rent-roll snapshots + move-out/leasing data, NOT
  just the December rent roll — a tenant who vacated mid-year must still be
  reconciled for their occupied time. The engine already prorates partial years
  via `occPct` / `rcd` / `vacatedISO`.
- **On-demand YTD move-out reconciliation.** Close out a departing tenant on
  command (don't wait for the annual run): feed the engine YTD expense pools
  (from operating statements), the tenant's YTD escrow billed, and occupancy
  through the move-out date → `balance = YTD due − YTD escrow`. An interim/
  move-out statement layered on the existing per-tenant compute + PDF.
- **Per-year methodology snapshot.** Retail methodology is currently "current
  state" (the unit page), shared across years. For correct multi-year + mid-year
  close-outs, freeze each recon year's methodology when it closes (like office
  base years) so later edits don't retroactively change a closed year.
