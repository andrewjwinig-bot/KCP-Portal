# Workflow preferences

- After pushing a feature branch, always open a PR against `main` and merge it (squash) automatically without waiting for the user to do it. The user has standing approval for this.

# UI consistency — pills, badges, fonts, sizes

The user has flagged repeated drift in pill / chip / badge styling across new pages. Do NOT re-invent chip styles inline. Always use the shared primitives:

- `Pill` + `Badge` components live in `app/components/Pill.tsx`.
- Tone palettes (`maintenanceStatusTone`, `priorityTone`, `reservationStatusTone`, `TONE_BLUE`, `TONE_NEUTRAL`, etc.) live in the same file.
- Canonical pill footprint: `11px / 700 weight`, `padding 2px 8px`, `borderRadius 999`. Canonical badge footprint: `padding 1px 7px`.
- Section labels use `11px / 700 / uppercase / 0.06em letter-spacing / var(--muted)`. Tile big-numbers use `22–28px / 800–900`.
- If a new semantic doesn't fit an existing tone, add a new exported tone helper in `Pill.tsx` — don't inline a new `{bg, fg, border}` tuple in a page.
- When adding a new admin page, reuse the existing tab + filter + table primitives from `/maintenance/page.tsx` or `/reservations/page.tsx` rather than starting from scratch.
