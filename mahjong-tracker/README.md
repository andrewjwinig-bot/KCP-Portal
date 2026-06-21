# 🀄 Mahjong Tracker

A bright, social-flavored **American Mahjong hand tracker** — log the hands you
win at your real-life game, race to clear all ~70 on the year's card, and see
how your group stacks up. Think *Strava for your Tuesday game*.

Built as an installable **PWA** (Next.js App Router) so it works offline and
adds to your home screen with no app store. **v1 is fully on-device** — no
accounts, no server — so it can launch and be validated for almost nothing.

## What's in here

A working prototype of the **whole experience**:

| Tab | What it does |
|-----|--------------|
| **🀄 Card** | All 70 hands grouped by category (2026, 2468, Quints, Consecutive Run, 13579, Winds + Dragons, 369, Singles + Pairs…). Tap `+` to log a win; per-hand counts; **cleared / total wins / points** stats; **All / Remaining / Won** filter; editable notation (✎). |
| **🏆 Wins** | A photo + note journal. Log a win, attach a downscaled photo, and generate a downloadable/native-shareable **share card** image. |
| **👥 Group** | A group **leaderboard** (ranked by hands cleared, then points) and a shared **feed** of wins, with a copyable invite code and a report/hide path. *Demo group-mates are simulated on-device.* |
| **💡 Learn** | How to play, reading the notation, tips, FAQ, fun facts. |

### Design system
Bright / bold / rounded, tuned for social sharing. Tokens live in one place:
- CSS variables in `app/globals.css`, mirrored in `app/lib/theme.ts`.
- Palette: **blue `#2F6BFF`** (primary) · **green `#16C098`** (secondary) ·
  **coral `#FF6B5C`** (the Log / Share pop) · ink `#1E2430` · page `#EFF5FF`.
- Rotating per-category accent themes; colored category pills; soft white cards;
  bottom tab bar; rounded UI font (`ui-rounded` / SF Pro Rounded on iOS).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run icons    # regenerate PWA icons (dependency-free generator)
```

Deploy: push to Vercel (framework auto-detected; `vercel.json` sets the SW
headers). If this folder lives inside a larger repo, set the Vercel project's
**Root Directory** to `mahjong-tracker`.

## Architecture & the v2 swap

Everything is structured so the **local prototype upgrades to a real backend
without a rewrite**:

- **Card + hands are data, not UI** (`app/lib/cardData.ts`) — card-agnostic by
  design. A future version loads a licensed NMJL card or a user-entered/
  photographed one with no app-code change.
- **One storage layer** (`app/lib/storage.ts`, IndexedDB) backs the tracker,
  wins, and analytics. **The social layer** (`app/lib/social.ts`) reads/writes
  through the same abstraction. Swapping these for **Supabase** (Auth + Postgres
  + Storage) is the v2 step — the UI stays identical.
- **Analytics** (`app/lib/analytics.ts`) already records the core-loop signals
  (win logged, win **shared**, feed viewed, invite copied) locally; point them
  at a real sink in v2.

> ⚠️ **Card content:** the bundled card is a **sample** with original,
> illustrative notations — **not** the official National Mah Jongg League card.
> Using the official card is a licensing question to resolve with the NMJL
> before shipping the cloud/social version. The card-agnostic design keeps that
> path open.

### Roadmap
**v1 (this):** local solo tracker + share + simulated group → validate.
**v2:** Supabase accounts, real cross-device groups/feed/leaderboard, photo
upload, push, moderation, optional paid tier. Resolve NMJL licensing first.
