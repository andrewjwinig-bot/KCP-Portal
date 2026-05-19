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
