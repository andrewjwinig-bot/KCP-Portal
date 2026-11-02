import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import { sendMailDetailed, VERIFIED_FROM } from "@/lib/mail";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import {
  QUARTERLY_BILLINGS, QUARTERS, isAutoQuarter, quarterLastMonth, quarterPosted, quarterSpikes, quarterlyEmail,
  type Quarter, type QuarterSpike,
} from "./quarterly";
import { loadQuarterly } from "./quarterlyLoad";
import { buildQuarterlyPdf, quarterFigures } from "./quarterlyPdf";

// Sending a quarter-billed tenant's quarterly CAM and tax statement (Wawa @
// 9510) — and doing it ON ITS OWN (owner: "once we get the last month of the
// quarter's GL imported, similarly to allocated expenses that should trigger
// this … basically a fully automated process"). The GL import of the quarter's
// last month (March / June / September / December) calls `autoSendQuarterly`;
// the daily cron (`/api/cron/quarterly-cam`) retries anything still unsent.
// It goes FROM Drew to Wawa in his own wording (`quarterlyEmail`), the PDF
// attached, Bcc Drew — that copy IS the confirmation he never had. A quarter
// whose cost lines jumped (`quarterSpikes`) is HELD and Drew is emailed what
// to look at, as an Allocated split that doesn't tie is held; the page's Send
// button releases it.

/** Who the email is from and signed by (owner: "you can have it send from me"). */
const SIGNER = "Drew Winig";
const FROM = `${SIGNER} <${VERIFIED_FROM}>`;
/** Drew's own copy — the record that it went, and the hold notices. */
const COPY_TO = (process.env.WAWA_CAM_COPY_TO ?? VERIFIED_FROM).trim();
/** The Task Tracker's quarterly task it satisfies. */
const TASK_ID = "q-lhscwawa";
const PORTAL = (process.env.PORTAL_ORIGIN ?? "https://portal.kormancommercial.com").replace(/\/$/, "");

export type QuarterSendRecord = {
  status: "sent" | "held" | "sending";
  /** When it went (null for a quarter emailed by hand before the portal sent). */
  sentAt?: string | null;
  sentBy?: string | null;
  to?: string;
  subject?: string;
  total?: number;
  messageId?: string | null;
  testMode?: boolean;
  /** Sent by the GL import / cron rather than the page's button. */
  auto?: boolean;
  /** Emailed by hand, outside the portal. */
  outside?: boolean;
  heldReasons?: string[];
  heldAt?: string;
  /** The reasons Drew was last emailed about, so a hold is announced once. */
  heldNotified?: string;
  startedAt?: string;
  lastError?: string;
};

const store = createMapStore<QuarterSendRecord>({ prefix: "cam-retail-quarterly-sends" });
const recKey = (key: string, year: number, q: Quarter) => `${key}-${year}-${q}`;

/** Quarters emailed by hand before the portal sent them (owner, 11/2026). */
const SENT_OUTSIDE: Record<string, QuarterSendRecord> = {
  "9510-WAWA-Q-2026-Q1": { status: "sent", outside: true, sentAt: null, to: "santiago.betancourt@wawa.com" },
  "9510-WAWA-Q-2026-Q2": { status: "sent", outside: true, sentAt: null, to: "santiago.betancourt@wawa.com" },
};

export async function getSendRecord(key: string, year: number, q: Quarter): Promise<QuarterSendRecord | null> {
  return (await store.get(recKey(key, year, q))) ?? SENT_OUTSIDE[recKey(key, year, q)] ?? null;
}

export async function sendRecordsFor(key: string, year: number): Promise<Partial<Record<Quarter, QuarterSendRecord>>> {
  const out: Partial<Record<Quarter, QuarterSendRecord>> = {};
  for (const q of QUARTERS) { const r = await getSendRecord(key, year, q); if (r) out[q] = r; }
  return out;
}

const spikeText = (s: QuarterSpike) =>
  `${s.label} $${s.amount.toLocaleString("en-US")} — ${s.basis === "last year" ? "same quarter last year" : "the year's other quarters average"} $${s.typical.toLocaleString("en-US")}`;

/** Everything the confirm shows, built by the same calls the send makes. */
export async function previewQuarter(key: string, year: number, q: Quarter) {
  const loaded = await loadQuarterly(key, year);
  if (!loaded) return null;
  const { def, effective, computed, gl } = loaded;
  const prior = await loadQuarterly(key, year - 1);
  const posted = QUARTERS.filter((x) => quarterPosted(x, gl.maxPosted));
  const spikes = quarterSpikes(def, effective, q, prior?.gl.hasGl ? prior.effective : null, posted);
  const email = quarterlyEmail(def, q, year, SIGNER);
  const figures = quarterFigures(def, effective, computed, q);
  return {
    key, year, quarter: q,
    to: def.sendTo, from: FROM, bcc: COPY_TO,
    subject: email.subject, body: email.textBody, attachmentName: email.attachmentName,
    figures,
    ready: quarterPosted(q, gl.maxPosted),
    maxPosted: gl.maxPosted,
    lastMonth: quarterLastMonth(q),
    auto: isAutoQuarter(def, year, q),
    spikes: spikes.map(spikeText),
    record: await getSendRecord(key, year, q),
    loaded,
  };
}

export type QuarterSendResult = {
  ok: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  held?: string[];
  error?: string;
  record?: QuarterSendRecord | null;
};

/** The task's occurrence: the month after the quarter closes. */
function taskOccurrence(year: number, q: Quarter) {
  const m0 = quarterLastMonth(q); // 0-based month after the quarter = its last month (1-based)
  return m0 === 12 ? { year: year + 1, month0: 0 } : { year, month0: m0 };
}

/** Send one quarter. `force` re-sends a quarter already sent, or sends one
 *  whose last month is not posted yet. A spike never blocks THIS — the page's
 *  button is how a held quarter is released. */
export async function sendQuarter(
  key: string, year: number, q: Quarter,
  opts: { by: string | null; auto?: boolean; force?: boolean },
): Promise<QuarterSendResult> {
  const p = await previewQuarter(key, year, q);
  if (!p) return { ok: false, error: `No quarterly billing for ${key}` };
  const k = recKey(key, year, q);
  const prev = p.record;
  if (prev?.status === "sent" && !opts.force) return { ok: true, alreadySent: true, record: prev };
  if (prev?.status === "sending" && prev.startedAt && Date.now() - Date.parse(prev.startedAt) < 10 * 60_000) {
    return { ok: false, error: "This quarter is being sent right now." };
  }
  if (!p.ready && !opts.force) {
    return { ok: false, error: `The ${p.loaded.def.parentProperty} GL is posted through month ${p.maxPosted}; ${q} needs month ${p.lastMonth}.` };
  }

  await store.set(k, { ...(prev ?? {}), status: "sending", startedAt: new Date().toISOString() });
  const { def, effective, computed } = p.loaded;
  let res;
  try {
    const pdf = buildQuarterlyPdf(def, effective, computed, q, year);
    res = await sendMailDetailed({
      from: FROM,
      to: def.sendTo,
      bcc: COPY_TO,
      subject: p.subject,
      textBody: p.body,
      attachments: [{ name: p.attachmentName, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    res = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const back: QuarterSendRecord = prev && prev.status !== "sending" ? { ...prev, lastError: res.error } : { status: "held", heldReasons: [], lastError: res.error };
    await store.set(k, back);
    return { ok: false, error: res.error ?? "The email could not be sent.", record: back };
  }
  const rec: QuarterSendRecord = {
    status: "sent",
    sentAt: new Date().toISOString(),
    sentBy: opts.by,
    to: def.sendTo,
    subject: p.subject,
    total: Math.round(p.figures.total),
    messageId: (res as { messageId?: string }).messageId ?? null,
    testMode: (res as { testMode?: boolean }).testMode ?? false,
    auto: !!opts.auto,
  };
  await store.set(k, rec);
  try {
    const occ = taskOccurrence(year, q);
    await markTaskComplete(occ.year, occ.month0, TASK_ID, { at: rec.sentAt!, by: opts.by ?? "auto", source: "wawa-quarterly" });
  } catch { /* best-effort — the send stands */ }
  return { ok: true, sent: true, record: rec };
}

/** The automatic run: every quarter-billed tenant (of `parent`, when a GL
 *  import names one) whose quarter is posted, on or after its first automatic
 *  quarter, and not yet sent — sent, or held with Drew told why. Idempotent. */
export async function autoSendQuarterly(parent: string | null, by: string | null) {
  const results: { key: string; year: number; quarter: Quarter; sent?: boolean; held?: string[]; error?: string }[] = [];
  const thisYear = new Date().getFullYear();
  for (const def of Object.values(QUARTERLY_BILLINGS)) {
    if (parent && def.parentProperty.toUpperCase() !== parent.toUpperCase()) continue;
    // Last year too — December's GL is imported in January.
    for (const year of [thisYear - 1, thisYear]) {
      if (!def.years.includes(year) && year !== thisYear) continue;
      for (const q of QUARTERS) {
        if (!isAutoQuarter(def, year, q)) continue;
        const rec = await getSendRecord(def.key, year, q);
        if (rec?.status === "sent") continue;
        const p = await previewQuarter(def.key, year, q);
        if (!p || !p.ready) continue;
        const reasons = [...p.spikes];
        if (p.figures.total <= 0) reasons.push(`The quarter totals ${p.figures.total < 0 ? "a credit of " : ""}$${Math.abs(Math.round(p.figures.total)).toLocaleString("en-US")}`);
        if (reasons.length) {
          await holdQuarter(def.key, year, q, reasons, rec);
          results.push({ key: def.key, year, quarter: q, held: reasons });
          continue;
        }
        const r = await sendQuarter(def.key, year, q, { by, auto: true });
        results.push({ key: def.key, year, quarter: q, sent: !!r.sent, error: r.error });
      }
    }
  }
  return results;
}

async function holdQuarter(key: string, year: number, q: Quarter, reasons: string[], prev: QuarterSendRecord | null) {
  const def = QUARTERLY_BILLINGS[key];
  const sig = reasons.join(" | ");
  const rec: QuarterSendRecord = { ...(prev ?? {}), status: "held", heldReasons: reasons, heldAt: prev?.heldAt ?? new Date().toISOString() };
  if (prev?.heldNotified !== sig) {
    const link = `${PORTAL}/cam-recon?property=${encodeURIComponent(key)}&year=${year}`;
    const r = await sendMailDetailed({
      from: VERIFIED_FROM,
      to: COPY_TO,
      subject: `${def.name} ${q} ${year} CAM held for review — not sent`,
      textBody: [
        `The ${q} ${year} quarterly CAM and tax for ${def.storeName} is ready but was NOT sent to ${def.sendTo}, because:`,
        "",
        ...reasons.map((x) => `• ${x}`),
        "",
        "If it belongs (or once the line is corrected on the worksheet), send it from the page:",
        link,
      ].join("\n"),
    }).catch(() => ({ ok: false }));
    if (r.ok) rec.heldNotified = sig;
  }
  await store.set(recKey(key, year, q), rec);
}
