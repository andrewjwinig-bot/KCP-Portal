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
- **Sharing a private link** → `ShareLinkCard` from `app/components/ShareLinkCard.tsx` — a centred MODAL (portal-rendered, since the trigger usually sits in a scrolling table cell that would crop a popover): a link box with Copy, the access PIN with its own Copy, view count, an email action behind a deliberate confirm step, and Revoke. Used by the CAM statement (`TenantShareLink`) and the K-1 roster; a third share flow should use it too rather than growing its own. The component owns the look and interaction; each caller passes its own actions, because a tenant link and a K-1 link are different objects (`pinOptional={false}` for a K-1, whose PIN is mandatory). **Always offer both ways out**: copy the link and send it yourself, or have the app email it — copying mutates nothing, which is how you demo or test a link without touching an investor's stored data.
- **Sending a link to a tenant or investor is ALWAYS behind a confirm that
  names every recipient**, one address per line, and says how the PIN travels
  (for a K-1, as its own separate email). Copying a link and mailing it are one
  click apart in the same dialog, so the send cannot be a click you make by
  accident. **The confirm shows the MESSAGE, not just the recipients**
  (`loadDraft` on `ShareLinkCard`): subject and body as they will send, editable
  in place, plus a read-only preview of the follow-up. A send is irreversible —
  you cannot unsend an investor their tax document — so the wording is read
  before, not found in a reply afterwards. `lib/investors/k1ShareEmail.ts`
  composes it and **the send and the preview call the same function**, so a
  preview cannot drift from what goes out; an edit that drops the signed link
  gets it appended back, and the audit line records `· edited wording`. **Minting a link
  and emailing it must never be the same call**: `useK1`'s investor `send`
  takes an explicit flag, because for a while the By Investor card's "Create
  link" posted `send: true` and emailed the investor with no confirmation at
  all.
- **Dropdowns and text inputs are styled ON THE ELEMENT, in `globals.css`.**
  Not per page, and not by a wrapper component — styling a native control page
  by page never held: an audit found **68 of the app's 78 `<select>`s, across 34
  files, rendering as raw OS dropdowns** next to brand-styled buttons, because
  the next bare `<select>` is always one edit away. So `select`, the text-ish
  `input` types and `textarea` carry the look themselves and nothing has to opt
  in. **Never restyle a control inline**; if one looks wrong, the baseline is
  wrong. Two deliberate tiers:
  - the **quiet neutral pill** is the DEFAULT, so a row of eight filters reads
    as one calm strip rather than eight blue claims on the eye;
  - **`.select-brand`** (or `Select` from `app/components/YearSelect.tsx`, which
    applies it) is the brand-outlined pill for the ONE control a page is driven
    by — the year, the property, the owner. `YearSelect` is the year helper;
    `.select-sm` / `small` is the compact variant for a card header or a row.
  Everything is a pill (`999`), matching `.btn` and the tab controls, so a
  toolbar of buttons, dropdowns and search boxes shares one shape. Gotchas:
  never set `background` (the shorthand) on a select — it paints over the
  chevron the baseline draws; use `background-color`. The chevron is the
  `--select-chevron` / `--select-chevron-brand` token so the dark theme swaps
  its stroke. Controls inside a `td`/`th` are pulled back to dense padding, so
  the baseline can't blow a table row's height open.
- **Roster table cells** → `th` / `td` / `thL` / `tdL` from
  `app/components/tableStyles.ts` (`thDetail` / `tdDetail` for a table nested
  inside an expanded row). Ten pages had each re-typed their own, at four
  different paddings, on top of the `globals.css` table base — so two rosters
  side by side never matched. Right-aligned is the DEFAULT because most columns
  here are money; the `L` variants are for the identifying columns that lead a
  row. Investor Info's three tabs all use them, which is what makes By
  Property, By Investor and Statement of Values read as one page.
- **A stored document in a table row** → `DocChip` from `app/components/DocChip.tsx` — a status/year pill plus a document icon, the whole thing a link opening the file in a new tab, wrapped in the shared `HoverCard`. **Never render the filename in the cell**: names range from `k1.pdf` to `2025 Parkwood SC K1P V1 FINAL SIGNED.pdf`, so a cell either truncates to nothing useful or makes every row a different shape. The name is the hover's title, where it can be read whole. The chip has a `minWidth` and pins its icon to the right edge so the icon (and any button after it) lines up down the column whatever the label says. Used by the K-1 cell on Investor Info and the per-investor document list.
- **A roster of things, grouped, each expanding to its detail** → ONE card
  holding ONE table, with a tinted **band row** opening each group (the group's
  label plus its subtotals) and a row that expands in place into a detail row
  (`<td colSpan>`). Reference: the Monthly Statements roster
  (`app/tenant-statements/page.tsx` — `th`/`td`/`thL`/`tdL`, the property band,
  `TenantRows`); Investor Info's By Property list follows it. **Do NOT render a
  card per item.** Investor Info did, with a coloured top rail on each; fifteen
  of them read as a stack of banners, cost a screen of scrolling, and matched
  nothing else in the portal. A band carries only figures that are true of the
  group — a per-item count like "owners" must be left blank there rather than
  summed, since a person holding two stakes would be counted twice.
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

# Shared links — the host they are built on

**Every emailed link is built by `linkOrigin(req)` (`lib/linkOrigin.ts`), never
from the request's `Host` header directly.** Five routes each derived it
themselves — CAM tenant links (mint + send), monthly statement links, payment
allocation requests, investor K-1 shares — so a link minted from a preview
deployment carried that preview's hostname forever, and one minted before a
custom domain was attached carried `kcp-portal.vercel.app` forever. A link is
emailed and then lives for months; the host baked into it matters more than the
one that happened to serve the request.

- Set **`PORTAL_ORIGIN`** in the Vercel project (e.g.
  `https://portal.kormancommercial.com`). Unset, it falls back to the request
  host, so nothing breaks before the domain exists.
- **This is a deliverability control, not tidiness.** Mail already goes out from
  `@kormancommercial.com` through Postmark, so a link pointing at a `vercel.app`
  host puts the sending domain and the link domain in different organisational
  domains — a heuristic spam filters score against directly, and a recipient
  reads the same way.
- **Changing the host later is safe, with one condition**: the signed token
  carries no hostname, so an old link keeps working as long as the old hostname
  stays attached to the project. Never detach a hostname that has been emailed
  — point it at the app and let it redirect.

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

# 1099 Register — sources of truth

A worksheet for the accountants, NOT a filing. `/financials/ten99`, gated with
the other statement pages (`financials-statements` → Drew, Alison, admin).

- **It reads CASH accounts, never expense accounts** (`lib/financials/ten99/register.ts`).
  A 1099 reports what was PAID in the calendar year, so an accrued-but-unpaid
  invoice must not appear and a prior-year invoice paid this year must. Money out
  of the cash account is that figure by construction, and reading the one side
  also means a check split across five expense lines counts once. Payments are
  cash rows with a NEGATIVE amount; deposits are ignored. `isCashAccount` lives in
  `lib/financials/cashAccounts.ts` — ONE definition shared with the bank-rec book
  side, so a payment can't reconcile on one page and be invisible on the other.
- **Vendors total per FILING ENTITY (EIN), not per property.** `filingEntityFor`
  maps a GL key → entity via `PROPERTY_DEFS.ein`; fund shells (PJV3 / PNIPLX)
  resolve through their member buildings, which is where the EIN lives. This is
  the whole point of the page: the eight Neshaminy Interplex buildings are one
  filer, so a vendor paid $250 by each of four of them is $1,000 to the filer and
  reportable — invisible if you look building by building. Equally, one vendor
  paid by two different EINs is two sub-threshold vendors, NOT one reportable
  one. Don't "helpfully" sum across entities.
- **Vendor grouping is an EXACT match after case/punctuation folding
  (`foldVendor`) — never fuzzy.** "ABC Landscaping" and "ABC Landscaping LLC"
  stay two rows. They may well be one vendor, but merging is a guess, and a guess
  here silently moves money onto the wrong person's form. Two rows the accountant
  can combine beats one row nobody can take apart. (Same reasoning as the K-1
  matcher that was removed.)
- **Payments with no vendor name are counted and surfaced, never dropped** — they
  land in the entity's `unnamed` bucket and a banner says so, because a silently
  discarded payment is how a vendor goes missing from the register.
- **Exclusions are global and permanent, not per-year** (`exclusionStore.ts`,
  keyed by the folded name): a utility is a corporation in every year and for
  every building that pays it, so the expensive first pass is meant to carry
  forward. Marking records a REASON, it does not make a determination — the
  corporation exemption is the accountant's call and the page says so. An
  excluded vendor still counts in `scannedTotal`; the exclusion is about
  reportability, not about pretending the payment didn't happen.
- **`scannedTotal` is the sanity check.** If it reads $0 the GL is missing or was
  imported as monthly totals only (no transaction detail) — the page says which
  rather than showing a confident empty list.
- **The export is two sheets** (`export.ts`): the register by entity, and every
  payment behind it so a figure traces to a check. Per the Excel rule, subtotals
  are `=SUM()` over their own vendor rows and the grand total sums the SUBTOTALS
  (not the rows again, which would double-count). Payment Detail's total must
  equal the register's grand total — if it ever doesn't, a payment is being
  counted in one place and not the other.
- **Deliberately out of scope: TINs, W-9s, addresses, box classification, and
  e-filing.** No taxpayer IDs are stored anywhere in this feature. If that
  changes it is a security decision on the order of the K-1s (encrypted at rest,
  its own access key), not an incremental feature.

# Investor K-1 delivery — sources of truth

Schedule K-1s carry taxpayer IDs, income allocations and capital accounts. This
is the most sensitive data in the app; the rules below are safety rules, not
preferences.

- **The two ownership maps are at DIFFERENT LEVELS OF THE CHAIN. Never derive
  one from the other.** `PROPERTY_OWNERSHIP` (`ownership.ts`) is the **legal
  partner** list — who receives a K-1. `BENEFICIARY_STAKES`
  (`beneficiaries.ts`) is a **look-through** map: it resolves each partnership
  down to the ultimate human/trust beneficiaries, which is what a Statement of
  Values needs and what a K-1 is NOT. Corporate partners are dissolved on the
  way through and appear nowhere in it — 2300's legal partners are Hyman Korman
  Co. (47.5%) and The Korman Co (52.5%), and neither name occurs in its 30
  beneficiary rows; same for GRAYS FERRY SC ASSOC. INC at 4500. Both maps sum to
  100% of the same property, which is exactly why one looks like a substitute
  for the other. **It is not.** This was tried: 0800's 38 beneficiary rows were
  rolled into a 32-owner "partner" roster that totalled a convincing 100.0000%
  and was wrong — Hyman Korman Co. holds a real 0800 interest and gets a real
  K-1, and it was absent, because the map had already fragmented it out to the
  end investors. It shipped and was reverted. A missing property's K-1 roster
  can only come from the partnership's own K-1 set or partnership agreement,
  hand-keyed like every other entry.
- **A property's ownership table SECTIONS when a partner is itself a
  partnership** (`app/investors/ownerSections.ts`, pinned by its own test).
  The entity heads a band carrying its share of the property — and its own K-1
  cell, because 0800 issues one to Hyman Korman Co. as much as to the fourteen
  trusts — with its investors alphabetically beneath it; then the partners who
  hold the property directly follow under an "Other investors" band carrying
  their combined share. That is how the K-1 schedule prints, and a corporate
  partner read in alphabetical order between two individuals loses the fact
  that twenty-four people sit behind it. Where every partner is a person, the
  table stays one flat list — nothing else changed.
  **Two layout traps, both hit while building this:** the detail `<td>` needs
  `maxWidth: 0` or a wide inner table stretches the roster above it off the
  card instead of scrolling in its own wrapper; and the sections render is the
  `<tbody>`'s contents, not a `<tbody>` — nesting a second one makes the
  browser hoist the rows out and the whole column model collapses (the select
  column went to 779px).
- **Ownership is TIERED, and the roster models both tiers.** A partner can
  itself be a partnership: `PropertyOwner.subOwners` carries that entity's own
  partners, and **their `ownerPct` is a share of THAT OWNER, not of the
  property** — an investor's effective interest is `sub.ownerPct ×
  owner.ownerPct`. 0800 is the worked example: Hyman Korman Co. holds 80% and
  has 24 partners of its own; fourteen trusts hold the other 20% directly. On
  By Property the entity is the row, with a "N investors in <entity>" control
  that opens the tier beneath it — each sub-row showing its effective % of the
  property and the resulting $ (the net individual value), plus its share of
  the entity as context. **Sub-owners are NOT K-1 upload targets**: their K-1
  is issued by the entity above, not by the property, and the row says so. Only
  the property's own partners (HKC + the 14) can take an upload — 15 rows, not
  38.
- **`PROPERTY_OWNERSHIP` does not cover the whole portfolio, which is why a
  property can be missing from Investor Info.** A property in the beneficiary
  map but not the partner roster renders on Statement of Values and is invisible
  to By Property / By Investor, so it can take no K-1 uploads. Still
  partner-roster-less: 0900, 1500, 2040, 2080, 3600, 4000, 4900, 5610, 9200,
  CWD, LAND, WHIT. **Key each from the property's own K-1 schedule** — the
  two-column "partner / beneficiary / % / $" sheet Drew has per property. Its
  entity subtotals (e.g. "TOTAL HYMAN KORMAN COMPANY: 100.000%") are the tier
  boundary: rows under a heading are that entity's `subOwners`, and rows under
  "OTHER INVESTORS" are direct partners of the property.
- **The owner roster is `lib/properties/ownership.ts`** (`PROPERTY_OWNERSHIP`).
  Nothing about who holds an interest is re-keyed for K-1s. `hasK1Distribution`
  marks the partnerships that actually distribute; 7010 Parkwood was added to
  that set (21 owners).
- **ONE table, not two.** The K-1 columns live in the property card's existing
  ownership table (`app/investors/page.tsx`), which already carries owner,
  vendor code, held-as and share — a separate "Schedule K-1s" roster underneath
  repeated all of it and made the card enormous. `K1Panel.tsx` now exports the
  pieces that render inside that table (`K1Header` band, `K1SelectCell`,
  `K1Cell`, `K1PortalCell`, `K1ShareResults`); don't reintroduce a second table.
  K-1 state is held by `useK1Registry` (`useK1.ts`) ONE level up, because the
  table is built inside a `.map` where a hook can't be called; it loads lazily
  per open card. **By Investor works the same way** — `investorSlice` /
  `K1InvestorCells` add the same two columns to that table (uploads happen on
  the property since a batch arrives per partnership, but a re-send belongs
  there, because "Carol called, she can't find hers" starts from her name). On a person holding several stakes the roll-up row shows
  "N separate K-1s" and carries no cell — the interest rows below do, because
  those are separate documents.
- **A K-1 is uploaded ONTO an owner — nothing reads the filename.** The roster
  IS the workflow: one row per owner on the property card, drop that owner's PDF
  on their row (`POST /api/investor-k1` takes an `ownerId`). Choosing the row is
  the assignment, so there is no matching step and no confirm step. **Do NOT
  reintroduce filename matching.** An earlier version scored vendor code → trust
  name → plain name and it could not resolve the case that actually matters: **6
  of Parkwood's 21 owners share a name with another owner** (Alison Korman
  Feldman holds both a GST trust interest and a personal one), so the file most
  in need of routing was exactly the one it refused. Picking the row is faster
  than confirming a guess and cannot be wrong in a way nobody notices.
- **ONE LINK PER INVESTOR — across every partnership, not per property.** An
  investor in four partnerships holds ONE link and ONE PIN; the portal lists
  every K-1 they have, each row led by its PROPERTY (without it, four K-1s read
  identically). `personGroup` therefore matches by name across ALL of
  `PROPERTY_OWNERSHIP`, the same identity the By Investor view has always used.
  **The link is DURABLE**: a send reuses the person's existing live link and
  widens its `ownerIds`, so releasing a second partnership never invalidates the
  link (or PIN) they already have. Only Revoke kills a link. **But a SEND
  releases only the partnership it was sent from**, for that year — otherwise
  releasing a finished 7010 K-1 would also expose an unfinalised 9510 draft.
  Later releases simply appear on the same link, with no re-send.
- **A link's coverage is resolved through the PERSON at read time**
  (`lib/investors/linkCoverage.ts`, `coveredOwnerIds`), never from the
  `ownerIds` snapshot alone. `ownerIds` is written once at mint from
  `personGroup`, so a link minted before an interest existed does not list it:
  when 0800 was keyed in, every link already issued silently stopped covering
  its holders' new 0800 rows — the roster read "no link" for people who hold
  one, and the portal would have omitted a K-1 they should see. It applies the
  SAME rule as `personGroup` (normalised name across the roster), just later,
  so it widens only to interests the mint would have included had they existed
  and never groups people the mint would have kept apart. Used by the roster,
  the portal, the file route and the share route's existing-link lookup — they
  must agree, or a link shows in one place and not another. **Widening coverage
  does not widen what is readable**: a document is visible only once PUBLISHED,
  and publishing is per owner per year as part of a deliberate send.
- **`InvestorLink.propertyCode` is PROVENANCE — where the link happened to be
  minted — and nothing user-facing may be derived from it.** The link belongs
  to the investor: the portal lists every published K-1 across every
  partnership they hold, the roster indexes a link under every covered owner
  id, and `shareOne` widens an existing link to cover interests added since. So
  the portal's header describes its DOCUMENTS, never `link.propertyCode` —
  which it used to, and which labelled a lone K-1 with the wrong partnership
  whenever an investor's only document came from somewhere other than where
  their link was first created.
- **The group is always derived server-side** in `personGroup()`, never from a
  client-supplied set, or a caller could mint a link onto a co-owner's K-1. Each
  document is labelled with its `heldAs` too, since a trust interest and a
  personal one in the same partnership are separate K-1s. A batch collapses to
  one entry per person (two ticked interests would otherwise mint a link then
  immediately revoke it), and `linkOwnerIds()` covers links minted before
  `ownerIds` existed. Index links under every covered id — keying on `ownerId`
  alone made the person row read "NO LINK" for a link it owned.
- **The share control is the SAME card everywhere** — `ShareLinkCard`
  (`app/components/ShareLinkCard.tsx`), extracted from the tenant statement
  share flow so a link is minted, copied, emailed and revoked identically on
  both. It sits on the property card's Portal column AND on the By Investor
  card header (`K1InvestorShare`), because one link per investor means the
  person's own row is the natural place to reach for it. The email address
  lives INSIDE the card under "Sends to" (`recipientSlot`) rather than as a
  table column — it is only relevant where you send from. There is no "NO LINK"
  pill: the button already reads `Share` when there is no link and `Link` when
  there is.
- **`/investor/preview` renders a page with no side effects** — `?owner=<id>`
  shows what a REAL investor would see (staff-only, `canManageK1`), minting
  nothing, publishing nothing and recording no view, so you can check a link
  before anyone gets one. Bare `/investor/preview` shows a fictional investor
  with a generated PDF (`lib/investors/k1Preview.ts`).
- **An investor's contact details live in ONE place: the contact card on their
  own row in By Investor** (`app/investors/InvestorContactCard.tsx`, stored in
  `ownerContactsStore`). Email, additional recipients, phone, mailing address,
  notes. Statement of Values renders the SAME component, so there is one editor
  and one store — do not add a second contact form. They had grown into three
  (an address on the SoV tab, a K-1 email inside the share popover, a trustee
  directory nobody thought of as contact info) and there was no phone field at
  all.
- **`alsoEmail` is a list of ADDITIONAL RECIPIENTS — an accountant, a manager,
  a trustee — and every one of them receives the investor's K-1 link.** That is
  the point (investors ask for it), and it means adding an address here lets
  that person open this investor's K-1. So it is edited one row at a time
  rather than as a comma-separated field, `sentTo` records the full list, and
  the results panel names everyone who was mailed. The per-owner-id override
  deliberately does NOT carry extra recipients: it exists to redirect one
  interest's mail, not to widen who can see it.
- **The contact map and the ownership roster use DIFFERENT NAMING SYSTEMS**, and
  `ownerContact()` bridges them. `ownerContacts.ts` is keyed by the
  Statement-of-Values beneficiary name ("CAROLYN JACOBS"); the roster — and so
  Investor Info — uses the fuller legal name ("Carolyn Korman Jacobs"). Without
  the bridge the hub offered "+ Add contact info" for people whose details were
  already on file. The reduction (first + last word, single letters dropped) is
  indexed once and a short key reached by TWO contacts is dropped rather than
  resolved to either. `ownerContactExact()` is the un-reduced lookup, used
  where the answer must be REPORTED: `resolveOwnerEmail` labels an exact hit
  "Owner contacts" and a reduced one "Matched on name — check it".
- **Emails come from `resolveOwnerEmail`**, which reads the beneficiary contacts
  AND the trustee directory and takes a per-OWNER-ID override on top
  (`ownerEmailStore`). Keyed by owner id, the override needs no name matching at
  all. The relaxed name match counts ONLY where it resolves to exactly one
  address across both sources, and a relaxed hit is surfaced as "Matched on
  name — check it": a wrong address here mails one investor's K-1 link to
  another investor. Never make this fuzzier. On the roster, **By Property shows
  EMAIL** (nothing is physically mailed from there) and **By Investor shows
  ADDRESS**.
- **Where two rows share a name, "Held as" is the disambiguator** — it renders
  "Held personally" rather than a dash on those rows, plus a SHARED NAME pill
  whose hover shows the trust name and vendor code. Keep that; a dash there
  makes two rows look identical.
- **One K-1 per owner per year, enforced on upload.** A second upload onto the
  same owner is refused (409) rather than silently replacing — delete the
  existing one first, so a document is never swapped out from under a link
  that's already shared.
- **SENDING is what publishes. There is no separate publish step** — do not
  reintroduce one. It was the second half of a two-step check whose first half
  (confirming a filename match) no longer exists, and the link is the real gate:
  nothing is reachable without a signed token AND a PIN. `shareOne` publishes
  that owner's K-1 for the year as part of minting the link, which also makes
  publishing PER OWNER rather than the old all-or-nothing per year. The thing
  this protects is real though: an investor holding a live link from a prior
  year would otherwise see a new upload the instant it landed, including one
  dropped on the wrong row — so an upload stays invisible until someone
  deliberately sends it. The PATCH publish/unpublish endpoint remains as the
  retraction path; it is just not a step in the normal flow.
- **A send is RECORDED ON THE LINK, and the Portal pill reports it.**
  `InvestorLink.sentAt` / `sentTo` / `pinSentAt` / `sendCount` are written by
  `shareOne` after the email actually goes. Before this, a link EXISTING and a
  link having been EMAILED were the same pill ("SHARED"), and the only places
  that knew the difference were the results panel that disappears, `/audit`
  (behind a second admin password), and Postmark — so "did this investor's K-1
  go out?" was unanswerable from the roster. The pill now reads `SENT <date>`
  (green) / `OPENED n×` (green) / `LINK ONLY` (amber, created but never
  emailed), and the hover carries the full stamp — `Sep 9, 2026 at 3:47 PM
  EDT` — plus recipients and whether the PIN email went, because a send is a
  thing you quote back to an investor on the phone.
  **`sendCount` null means UNKNOWN, not never** — links minted before tracking
  carry no record, and claiming "never emailed" for a K-1 that was emailed is
  the worse error, so those read a neutral `SHARED`. New links are minted with
  `sendCount: 0` explicitly so "known never sent" is distinguishable from
  "predates the record". The three states live in `app/investors/sendState.ts`
  and are pinned by `sendState.test.ts`; By Property and By Investor render the
  SAME `SendPill`, since two views disagreeing about whether a K-1 was sent
  would be worse than either alone.
- **The K-1 cell says whether the FILE is there, not whether it was sent** —
  green `VIEW` (opens it) or red `MISSING` (which is also the drop target).
  Sent-ness is the Portal column's job (`NO LINK` / `SHARED` / `OPENED n×`);
  carrying it in both columns was redundant.
- **Access is its own gate — deliberately NOT the `/investors` prefix.** Alison
  can reach the ownership page and is herself a Parkwood owner, so inheriting
  that prefix would show her every co-owner's K-1. The K-1 UI lives INSIDE
  `/investors` (`K1Panel` on the property card, `K1InvestorDocs` on the By
  Investor card) but is gated on `canManageK1` — the `investor-k1` capability
  key, granted to Drew and Harry only — never on `canEditOwnership`, which
  includes Alison. The API enforces the same rule server-side. `/investor-k1` is
  no longer a page; the key outlived it.
- **The tax tracker's K-1 ticks sync from actual sends.**
  `/api/investor-k1/sent?year=` returns booleans keyed by owner id — no names,
  no filenames — and `isTaskEffectivelyDone(task, checked, sent)` merges them
  over the manual localStorage ticks. **Additive only**: a K-1 handed over on
  paper or emailed outside the portal still counts, so this never un-ticks what
  a person set. A portal-sent investor's box is disabled with a SENT badge —
  revoking their link is the way to undo it, and doing so reverts the task,
  because "sent" means a published K-1 AND a live link. NOTE the year offset:
  the tracker's year is the DEADLINE year, so a task due March 2026 asks for
  tax year **2025** — fetch `viewYear - 1`.
- **K-1 tasks derive from `hasK1Distribution`.** The hand-written list in
  `tax-data.ts` stays (its `entity` strings key `PARCEL_INFO` through
  `baseEntityName`), but any flagged partnership without one gets a task
  appended automatically. 7010 was missing entirely — 21 owners, actively being
  distributed, invisible to the tracker. Flag a partnership in `ownership.ts`
  and its task appears.
- **Investor links are domain-separated from tenant links** (`lib/investors/k1Link.ts`,
  HMAC prefixed `kcp.investor.k1.v1:`). Both fall back to `SITE_AUTH_SECRET`, so
  without that prefix a tenant token could open a K-1. Pinned by
  `k1Link.test.ts` — don't collapse the two signers into one.
- **Bulk send goes through the SAME per-owner function.** `POST
  /api/investor-k1/share` takes `ownerId` (single, unchanged shape) or
  `ownerIds[]`; both call `shareOne`, so the checks that matter — a published
  K-1 exists, any earlier link for that owner is revoked first, a fresh PIN per
  owner, the email carries a LINK not the K-1 — cannot drift between the two
  paths. Never add a second implementation for the batch. Ids are de-duplicated
  (a repeat would revoke the link just minted and email twice), the batch is
  capped at 50, it runs sequentially because the link store is
  read-modify-write, and one owner failing (no published K-1, no email on file)
  is reported on that owner's row rather than aborting the rest. Only owners
  with a PUBLISHED K-1 are selectable in the UI.
- **`/investor/preview` is the demo, not a test send.** `lib/investors/k1Preview.ts`
  fabricates a two-document payload (a trust interest and a personal one, which
  is the case worth showing) and a minimal real PDF, rendered by the ACTUAL
  portal page so it cannot drift from what investors see. Gated on
  `canManageK1`, checked BEFORE any token logic in all three
  `/api/investor/[token]*` routes — it must never become a path to real
  documents — and carries a banner saying nothing on it is real. Testing by
  emailing yourself works too, but it publishes a K-1, mints a live link and
  ticks the tax tracker; the preview does none of that.
- **Every linked row has a Revoke.** It is how you undo a test send or a link
  that went to the wrong address: the link dies immediately, the K-1 stops being
  readable, and because "sent" means a published K-1 AND a live link, the tax
  tracker reverts too. The endpoint existed from the start but had no control.
- **The PIN is emailed automatically, as its OWN message** — a second email
  sent right after the link email, to the same recipient list. It used to be a
  manual hand-off ("send the PIN separately — a text or a call"), and a
  delivery step that depends on someone remembering is a step that gets missed:
  the investor is left holding a link they cannot open. **The two messages are
  DISJOINT and `k1ShareEmail.test.ts` pins that** — the link email carries no
  PIN, the PIN email carries no link. That is the whole value of the split now
  that both go to one mailbox: a forwarded link email does not hand over
  access, and neither message alone opens the document. **Do not "simplify"
  this into one email.** It was considered and rejected: a K-1 carries taxpayer
  IDs and capital accounts, and one message holding both makes the PIN
  decoration. The genuinely separate channel is SMS to the contact card's phone
  — `composeK1PinEmail` is the function that would be replaced if a provider is
  ever added. The PIN email goes to `alsoEmail` too, because an additional
  recipient who cannot open the document is not an additional recipient.
- **The additional recipients are Cc'd by default, and that is addressing
  only.** A checkbox in the confirm switches between the investor on To with
  their accountant visibly Cc'd (the default — it is how that relationship
  actually works) and everyone addressed together on To. **It never changes WHO
  receives the mail**, and `lib/investors/recipients.test.ts` pins exactly that:
  `addressRecipients` must reach the same set under both settings. Both the link
  email and the PIN email are addressed identically — a PIN arriving To when the
  link arrived Cc reads as a different conversation. With no primary address on
  file nobody is Cc'd onto a mail with no addressee; whoever we have is
  addressed directly. The confirm tags each recipient TO / CC, because the
  header is a detail but the LIST is the thing the confirm exists to state.
- **Both emails are BLIND-copied to the team** (`shareCopyTo()` in the share
  route → `sendMail`'s `bcc`, default `dwinig@kormancommercial.com`, overridden
  or switched off with `K1_SHARE_COPY_TO` and no deploy). It is the record that
  both halves actually left Postmark — copying only the link email would
  confirm the half that was never in doubt. **Blind, not a visible Cc**: a Cc
  puts an internal address on an investor's tax-document email and invites a
  reply-all onto it. The confirm names who is copied, because a copy the UI
  never mentions is what surprises someone later. `lib/mail.test.ts` pins the
  Bcc reaching the Postmark payload — without it the copies would stop
  arriving with nothing going red.
- **The PIN is still shown to staff, and a failed PIN send is shouted about.**
  The results panel lists one row per investor with their own PIN and the
  interest label (`heldAs`) beneath the name — without it two rows reading
  "Alison Korman Feldman" carry different PINs and staff can't tell which is
  which. Each row says `EMAILED` / `NOT EMAILED`, and a link that went out
  without its PIN gets its own red banner naming those investors: that is the
  one outcome that leaves someone holding an unopenable link. The heading
  reflects what actually happened (`Links created` when mail isn't configured),
  not what was requested.
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
