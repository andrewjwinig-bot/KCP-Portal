# Workflow preferences

- After pushing a feature branch, always open a PR against `main` and merge it (squash) automatically without waiting for the user to do it. The user has standing approval for this.

# UI consistency — pills, badges, fonts, sizes

The user has flagged repeated drift in pill / chip / badge styling across new pages. Do NOT re-invent chip styles inline. Always use the shared primitives:

- `Pill` + `Badge` + `StatPill` components all live in `app/components/Pill.tsx`. Use `Pill` for colored status/priority chips, `Badge` for tab counters, and `StatPill` for any "label + big number" KPI tile (big number on top, small muted label below). The `.pill` / `.pills` CSS classes in `globals.css` back StatPill — use `<div className="pills">` to wrap a row of them.
- Tone palettes (`maintenanceStatusTone`, `priorityTone`, `reservationStatusTone`, `TONE_BLUE`, `TONE_NEUTRAL`, etc.) live in the same file.
- Canonical pill footprint: `11px / 700 weight`, `padding 2px 8px`, `borderRadius 999`. Canonical badge footprint: `padding 1px 7px`.
- Section labels use `11px / 700 / uppercase / 0.06em letter-spacing / var(--muted)`. Tile big-numbers use `22–28px / 800–900`.
- If a new semantic doesn't fit an existing tone, add a new exported tone helper in `Pill.tsx` — don't inline a new `{bg, fg, border}` tuple in a page.
- When adding a new admin page, reuse the existing tab + filter + table primitives from `/maintenance/page.tsx` or `/reservations/page.tsx` rather than starting from scratch.
- For date inputs, ALWAYS use `Calendar` from `app/components/Calendar.tsx` — never reach for `<input type="date">`. Pass `variant="card"` on admin pages and `variant="underline"` on public-facing tenant forms. Use `disableWeekends` and `minISO`/`maxISO` where the business rule warrants.

# CAM / RET reconciliation — sources of truth (do not duplicate data)

The user has repeatedly flagged data living in the wrong place / pages drifting. These are the canonical sources — read/write here, never re-key the same value somewhere else:

- **Per-tenant CAM methodology** (admin fee %, stipulated PRS per CAM/INS/RET category, expense-line exclusions, admin-fee exclusions, CAM cap, gross-lease flag) lives in `lib/cam/retailConfigSeed.ts` (`RETAIL_CONFIG_SEED`). This is what the rent-roll **unit page** (`app/rentroll/units/[unitRef]/CamConfigCard.tsx`, via `/api/cam-config/[unitRef]`) reads and edits, and what the reconciliation resolves. The unit page IS the source of truth. When a tenant's admin/PRS/exclusion is wrong or missing, fix it here — NEVER hard-code it on the roster.
- **Roster seeds** (`lib/cam/retail/seed/<code>.ts`) carry ONLY rent-roll facts: `sqft`, `camEscrow`/`insEscrow`/`retEscrow` (billed during the year), and partial-year `occPct`. Do NOT put `camPrs`/`insPrs`/`retPrs`/`adminFeePct`/exclusions on the roster — they belong in the config seed above.
- **A tenant on a reduced CAM pool** (e.g. a pad excluded from some expense lines) is modeled as real **expense-line exclusions** in the config seed (`excludedCamLines`), NOT a flat pool override. That way the excluded lines render struck-through on the statement, checked on the unit page, and listed in the Notes — and the effective pool falls out of the line math. Never back into a pool total with an override.
- **Reconciliation field precedence** (`lib/cam/retail/assemble.ts`): roster override → config stipulated/seed → computed-from-SF. Because methodology is in the config seed, the recon and the unit page always agree.
- **Mixed-center expense allocation** (e.g. 7010 retail+office) has ONE source: `lib/cam/retail/allocation.ts` (`MixedCenter` / `MIXED_7010`). The retail pool, office pool, and the on-screen allocation breakdown are all DERIVED from it — add or change an expense line there once, never edit the derived pools directly.
- **Office recon** config/expenses come from the office seeds + `/api/cam-recon/office`; same principle — one source.
- **Tie-out tests** (`lib/cam/retail/compute.*.test.ts`) are the guardrail. After any seeding/mapping change, run them; they must stay green (per-tenant balances tie to the workbook within a few dollars).

# CAM / RET reconciliation — page consistency

Office and retail recon pages + the per-tenant statement must look/behave the same. Reuse, don't reinvent:

- Shared building blocks already exist — use them: `OccCallout` (occupancy callout + hover lease term), `PortionPill` (RETAIL/OFFICE tag), `ImportInstructions` (`app/components/ImportInstructions.tsx`, Skyline steps; `stop` adds the double-charge warning), `BalanceRow` + `FinalBalanceRow` (statement waterfall + boxed balance), `CARD_TITLE` (large card titles).
- **Occupancy**: assume 100%; only flag tenants < 100% with the amber `(NN% occ)` callout (hover shows lease term). Tenant statements ALWAYS show the `× Occupancy` step so every calc to the amount due is visible.
- **Building Summary is always the top content card.**
- **Tenant statements**: one card with side-by-side columns (CAM/INS/RET for retail, CAM/RET for office), colored section labels, `BalanceRow` rows, `FinalBalanceRow` boxed balance — no per-block bordered cards.
- **Schedules + allocation tables** lead with an `Acct` (GL account) column on the far left.
- **Year-end**: exactly two compiled exports — "SC Year-End Adjustments" (shopping centers) and "BP Year-End Adjustments" (business parks) — as header buttons next to "All Tenant PDFs", with an ⓘ popover for the import steps. No per-building year-end. Posting date is fixed at 4/30 of the following year (no date picker).
- **Estimates** live on the dedicated `/cam-recon/estimates` page with the full import steps incl. the STOP-current-charges warning.
- Unit refs render as a `<code>` element (12px, default monospace) matching the Rent Roll. Building summary tables use whole dollars (`money0`); detail statements use cents (`money`). Gross-lease rows are dimmed (opacity) with a `(Gross)` marker. The recon page remembers the last-viewed property/year via `localStorage`.

When the user reports a value mismatch between pages, trace it to the shared source above and fix it there once — don't patch the symptom on one page.
