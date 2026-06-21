:root {
  --primary: #2f6bff; /* blue */
  --secondary: #16c098; /* green */
  --accent: #ff6b5c; /* coral pop — Log / Share */
  --ink: #1e2430;
  --page: #eff5ff;
  --card: #ffffff;
  --muted: #7c8398;
  --hairline: #e4eaf6;
  --shadow: 0 6px 22px rgba(30, 36, 48, 0.08);
  --shadow-sm: 0 2px 8px rgba(30, 36, 48, 0.07);
  --nav-h: 64px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--page);
  color: var(--ink);
  font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, -apple-system,
    BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

input,
textarea,
select {
  font-family: inherit;
}

/* ---- Layout shell -------------------------------------------------------- */

.app {
  max-width: 520px;
  margin: 0 auto;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.screen {
  flex: 1;
  padding: 16px 16px calc(var(--nav-h) + 28px);
}

.app-header {
  padding: 22px 18px 8px;
}
.app-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.app-header .sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

/* ---- Cards --------------------------------------------------------------- */

.card {
  background: var(--card);
  border-radius: 20px;
  box-shadow: var(--shadow-sm);
  padding: 16px;
}
.card + .card {
  margin-top: 14px;
}

/* ---- Pills / chips ------------------------------------------------------- */

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  padding: 5px 12px;
  border-radius: 999px;
  letter-spacing: -0.01em;
}

.badge-c {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  background: var(--ink);
  color: #fff;
}

.tag {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ---- Stat tiles ---------------------------------------------------------- */

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.stat {
  background: var(--card);
  border-radius: 18px;
  box-shadow: var(--shadow-sm);
  padding: 14px 12px;
  text-align: center;
}
.stat .num {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1;
}
.stat .lab {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.progress {
  height: 10px;
  border-radius: 999px;
  background: var(--hairline);
  overflow: hidden;
  margin-top: 12px;
}
.progress > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
  transition: width 0.4s ease;
}

/* ---- Segmented filter ---------------------------------------------------- */

.segmented {
  display: flex;
  background: #e3ebfc;
  border-radius: 14px;
  padding: 4px;
  gap: 4px;
}
.segmented button {
  flex: 1;
  font-size: 13px;
  font-weight: 800;
  padding: 9px 0;
  border-radius: 11px;
  color: var(--muted);
}
.segmented button[data-active="true"] {
  background: #fff;
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

/* ---- Hand rows ----------------------------------------------------------- */

.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 2px 10px;
}
.cat-head .count {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.hand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}
.hand + .hand {
  margin-top: 8px;
}
.hand.won {
  outline: 2px solid transparent;
}
.hand .notation {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  word-break: break-word;
}
.hand .meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.hand .pts {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
}

.counter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.counter .val {
  min-width: 22px;
  text-align: center;
  font-size: 16px;
  font-weight: 900;
}
.round-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  font-size: 20px;
  font-weight: 800;
  display: grid;
  place-items: center;
  color: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform 0.08s ease;
}
.round-btn:active {
  transform: scale(0.92);
}
.round-btn.ghost {
  background: #f0f3f2;
  color: var(--ink);
}
.round-btn:disabled {
  opacity: 0.4;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: #f4f7f6;
  font-size: 15px;
}

/* ---- Buttons ------------------------------------------------------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  padding: 13px 18px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
  width: 100%;
}
.btn.coral,
.btn.accent {
  background: var(--accent);
}
.btn.green {
  background: var(--secondary);
}
.btn.ghost {
  background: #eef3f1;
  color: var(--ink);
  box-shadow: none;
}
.btn:active {
  transform: translateY(1px);
}
.btn:disabled {
  opacity: 0.5;
}

/* ---- Inputs -------------------------------------------------------------- */

.field {
  width: 100%;
  border: 1.5px solid var(--hairline);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 15px;
  font-weight: 600;
  background: #fff;
  color: var(--ink);
}
.field:focus {
  outline: none;
  border-color: var(--primary);
}
label.lbl {
  display: block;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin: 0 0 6px 2px;
}

/* ---- Wins feed ----------------------------------------------------------- */

.win {
  background: var(--card);
  border-radius: 20px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.win + .win {
  margin-top: 14px;
}
.win img.photo {
  width: 100%;
  display: block;
  max-height: 320px;
  object-fit: cover;
  background: #eef3f1;
}
.win .body {
  padding: 14px 16px;
}
.win .when {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
.win .note {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}
.win .actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.win .actions .btn {
  width: auto;
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 42px 20px;
  font-weight: 700;
}
.empty .big {
  font-size: 40px;
  margin-bottom: 10px;
}

/* ---- Learn accordion ----------------------------------------------------- */

.acc {
  background: var(--card);
  border-radius: 18px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.acc + .acc {
  margin-top: 12px;
}
.acc > button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-size: 16px;
  font-weight: 800;
  text-align: left;
}
.acc .chev {
  color: var(--muted);
  transition: transform 0.2s ease;
  font-size: 14px;
}
.acc[data-open="true"] .chev {
  transform: rotate(90deg);
}
.acc .acc-body {
  padding: 0 16px 16px;
  font-size: 14.5px;
  line-height: 1.5;
  color: #4a4954;
  font-weight: 500;
}
.acc .acc-body p {
  margin: 0 0 10px;
}
.acc .acc-body ul {
  margin: 0;
  padding-left: 18px;
}
.acc .acc-body li {
  margin-bottom: 6px;
}

/* ---- Bottom nav ---------------------------------------------------------- */

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(1.4) blur(12px);
  border-top: 1px solid var(--hairline);
  display: flex;
  z-index: 50;
}
.bottom-nav .inner {
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
  display: flex;
}
.bottom-nav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  height: var(--nav-h);
}
.bottom-nav button[data-active="true"] {
  color: var(--primary);
}
.bottom-nav .glyph {
  font-size: 22px;
  line-height: 1;
}

/* ---- Modal --------------------------------------------------------------- */

.modal-scrim {
  position: fixed;
  inset: 0;
  background: rgba(43, 42, 51, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
  padding: 0;
}
.sheet {
  background: var(--page);
  width: 100%;
  max-width: 520px;
  border-radius: 24px 24px 0 0;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
  max-height: 92dvh;
  overflow-y: auto;
}
.sheet h2 {
  margin: 4px 0 14px;
  font-size: 20px;
  font-weight: 900;
}
.sheet .grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: #d6e2dd;
  margin: 0 auto 12px;
}
.row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.row .btn {
  flex: 1;
}
