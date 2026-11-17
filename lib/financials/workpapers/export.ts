// The workpapers as a workbook — the accountants' layout, cleaned up.
//
// Theirs: COA, GL, Trial Balance, then one tab per group of accounts, each
// account a block of "Beginning Balance / entries / Total / Per Trial Balance
// / Difference / TRUE". Kept, because it is what the firm reads. Changed:
//   - a SUMMARY first: every account, its balance, what proves it and its
//     status in one word, then what to check — the review starts there;
//   - each block's Total is a live =SUM and its Difference a live formula, so
//     an edit flows through;
//   - findings sit under the block they belong to, in words, not in a margin
//     note ("Were these billed?").
// No COA / raw GL tabs: the GL is in the portal, and each block lists the
// entries that matter.

import "server-only";
import ExcelJS from "exceljs";
import { newWorkbook, titleBlock, headerBand, sectionBar, totalEmphasis, footNote, freezeAbove, liveSum, liveFormula, COLOR, FMT, FONT_NAME, PRINT_TALL } from "@/lib/excel/theme";
import { KIND_INFO, SECTION_ORDER, type Workpapers, type WpSchedule } from "./compute";
import type { WpMeta } from "./load";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const asOfLabel = (wp: Workpapers) => `${MONTHS[wp.asOfMonth - 1]} ${new Date(Date.UTC(wp.year, wp.asOfMonth, 0)).getUTCDate()}, ${wp.year}`;
const STATUS_WORD: Record<WpSchedule["status"], string> = { ok: "Ties", review: "Review", fix: "Fix" };
const STATUS_COLOR: Record<WpSchedule["status"], string> = { ok: COLOR.positive, review: COLOR.warn, fix: COLOR.negative };
const BASIS = "Prepared by the portal from the partnership's general ledger. Each balance is its opening plus every entry through the quarter end; the independent checks (bank rec, lender schedule, deposit register) are named on each account. Unaudited.";

const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT_NAME, size: 10, ...o });
const ymd = (iso: string | null) => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : iso ?? "";
};

export async function workpapersXlsx(wp: Workpapers, meta: WpMeta): Promise<Buffer> {
  const wb = newWorkbook();
  const asOf = `As of ${asOfLabel(wp)} · Q${wp.quarter} ${wp.year}`;
  const letter = (ws: ExcelJS.Worksheet, document: string, width: number) =>
    titleBlock(ws, { entity: meta.entityName, document, subtitle: meta.name, asOf, meta: [meta.ein ? `EIN ${meta.ein}` : null, `Prepared ${new Date().toLocaleDateString("en-US")}`], width });

  // ── Summary ────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }], pageSetup: { ...PRINT_TALL, orientation: "landscape" } });
    ws.columns = [{ width: 12 }, { width: 32 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 36 }, { width: 10 }, { width: 70 }];
    let r = letter(ws, "Quarterly Workpapers — Summary", 8) + 1;
    const tb = wp.trialBalance;
    ws.getCell(r, 1).value = `${wp.counts.accounts} accounts · ${wp.counts.ok} tie · ${wp.counts.review} to review · ${wp.counts.fix} to fix · Trial balance ${tb.balances ? "balances" : "is OUT"}`;
    ws.getCell(r, 1).font = font({ bold: true, color: { argb: wp.counts.fix ? COLOR.negative : COLOR.text } });
    r += 2;
    headerBand(ws, r, ["Account", "Name", "Opening", "Activity", "Ending", "Proven by", "Status", "What to check"]);
    ws.getCell(r, 6).alignment = { horizontal: "left" }; ws.getCell(r, 7).alignment = { horizontal: "left" }; ws.getCell(r, 8).alignment = { horizontal: "left" };
    freezeAbove(ws, r + 1);
    r++;
    for (const section of SECTION_ORDER) {
      const rows = wp.schedules.filter((s) => s.section === section);
      if (!rows.length) continue;
      sectionBar(ws, r++, section, 8, { strong: false });
      for (const s of rows) {
        const vals: ExcelJS.CellValue[] = [s.code, s.name, s.opening, s.activity, s.ending, s.support?.label ?? KIND_INFO[s.kind].support, STATUS_WORD[s.status], s.flags.map((f) => f.text).join("\n")];
        vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = font(); if (i >= 2 && i <= 4) c.numFmt = FMT.money; });
        ws.getCell(r, 7).font = font({ bold: true, color: { argb: STATUS_COLOR[s.status] } });
        ws.getCell(r, 8).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(r, 6).alignment = { wrapText: true, vertical: "top" };
        if (s.flags.length) ws.getRow(r).height = Math.min(90, 15 * Math.max(1, s.flags.length * 2));
        r++;
      }
    }
    r++;
    footNote(ws, r, BASIS, 8);
  }

  // ── Trial balance ──────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Trial Balance", { views: [{ showGridLines: false }], pageSetup: { ...PRINT_TALL } });
    ws.columns = [{ width: 12 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
    let r = letter(ws, "Trial Balance Detail", 6) + 1;
    headerBand(ws, r, ["Account", "Description", "Beginning", "Debits", "Credits", "Ending"]);
    freezeAbove(ws, r + 1);
    const first = ++r;
    for (const t of wp.tbRows) {
      ws.getCell(r, 1).value = t.code; ws.getCell(r, 2).value = t.name;
      ws.getCell(r, 3).value = t.opening; ws.getCell(r, 4).value = t.debits; ws.getCell(r, 5).value = t.credits;
      ws.getCell(r, 6).value = liveFormula(`C${r}+D${r}-E${r}`, t.ending, t.opening + t.debits - t.credits, 0.01);
      for (let c = 1; c <= 6; c++) { ws.getCell(r, c).font = font(); if (c >= 3) ws.getCell(r, c).numFmt = FMT.moneyCents; }
      r++;
    }
    const last = r - 1;
    ws.getCell(r, 2).value = "Totals";
    const col = (c: string, k: "opening" | "debits" | "credits" | "ending", i: number) => {
      const cell = ws.getCell(r, i);
      cell.value = liveSum(`${c}${first}:${c}${last}`, wp.tbRows.reduce((a, t) => a + t[k], 0), wp.tbRows.map((t) => t[k]));
      cell.numFmt = FMT.moneyCents; totalEmphasis(cell, { grand: true });
    };
    col("C", "opening", 3); col("D", "debits", 4); col("E", "credits", 5); col("F", "ending", 6);
    totalEmphasis(ws.getCell(r, 2), { grand: true });
    r += 2;
    ws.getCell(r, 2).value = wp.trialBalance.balances ? "Debits equal credits — the trial balance proves." : "Debits and credits are NOT equal — the General Ledger is incomplete.";
    ws.getCell(r, 2).font = font({ italic: true, color: { argb: wp.trialBalance.balances ? COLOR.positive : COLOR.negative } });
  }

  // ── One tab per section: an account block each ────────────────────────
  for (const section of SECTION_ORDER) {
    const rows = wp.schedules.filter((s) => s.section === section);
    if (!rows.length) continue;
    const ws = wb.addWorksheet(section.replace(/[&']/g, "and").slice(0, 31), { views: [{ showGridLines: false }], pageSetup: { ...PRINT_TALL } });
    ws.columns = [{ width: 12 }, { width: 58 }, { width: 16 }, { width: 16 }];
    let r = letter(ws, section, 4) + 1;
    for (const s of rows) {
      sectionBar(ws, r++, `${s.code}  ${s.name}`, 4);
      ws.getCell(r, 1).value = `Proven by: ${s.support?.label ?? KIND_INFO[s.kind].support}${s.support?.note ? ` — ${s.support.note}` : ""}`;
      ws.getCell(r, 1).font = font({ italic: true, size: 9, color: { argb: COLOR.muted } });
      ws.mergeCells(r, 1, r, 4);
      r++;
      headerBand(ws, r++, ["Date", "Description", "Ref", "Amount"]);
      ws.getCell(r, 2).value = "Beginning balance"; ws.getCell(r, 4).value = s.opening; ws.getCell(r, 4).numFmt = FMT.moneyCents;
      ws.getCell(r, 2).font = font({ bold: true }); ws.getCell(r, 4).font = font({ bold: true });
      const first = r++;
      if (s.detail === "none") {
        ws.getCell(r, 2).value = "Activity (monthly totals only — no entry detail imported)"; ws.getCell(r, 4).value = s.activity; ws.getCell(r, 4).numFmt = FMT.moneyCents;
        ws.getCell(r, 2).font = font({ italic: true }); r++;
      }
      for (const l of s.lines) {
        ws.getCell(r, 1).value = ymd(l.date); ws.getCell(r, 1).numFmt = FMT.date;
        ws.getCell(r, 2).value = l.description; ws.getCell(r, 3).value = l.ref || null;
        ws.getCell(r, 4).value = l.amount; ws.getCell(r, 4).numFmt = FMT.moneyCents;
        for (let c = 1; c <= 4; c++) ws.getCell(r, c).font = font();
        r++;
      }
      const last = r - 1;
      const sources = [s.opening, ...(s.detail === "none" ? [s.activity] : s.lines.map((l) => l.amount))];
      const totalVal = sources.reduce((a, b) => a + b, 0);
      ws.getCell(r, 2).value = "Total"; ws.getCell(r, 4).value = liveSum(`D${first}:D${last}`, Math.round(totalVal * 100) / 100, sources);
      ws.getCell(r, 4).numFmt = FMT.moneyCents; totalEmphasis(ws.getCell(r, 4)); totalEmphasis(ws.getCell(r, 2));
      const totalRow = r++;
      ws.getCell(r, 2).value = "Per trial balance"; ws.getCell(r, 4).value = s.ending; ws.getCell(r, 4).numFmt = FMT.moneyCents;
      ws.getCell(r, 2).font = font(); ws.getCell(r, 4).font = font();
      const tbRow = r++;
      ws.getCell(r, 2).value = "Difference";
      ws.getCell(r, 4).value = liveFormula(`D${totalRow}-D${tbRow}`, Math.round((totalVal - s.ending) * 100) / 100, totalVal - s.ending, 0.01);
      ws.getCell(r, 4).numFmt = FMT.moneyCents;
      ws.getCell(r, 2).font = font({ bold: true }); ws.getCell(r, 4).font = font({ bold: true });
      r++;
      ws.getCell(r, 2).value = STATUS_WORD[s.status];
      ws.getCell(r, 2).font = font({ bold: true, color: { argb: STATUS_COLOR[s.status] } });
      r++;
      for (const f of s.flags) {
        ws.getCell(r, 2).value = f.text;
        ws.getCell(r, 2).font = font({ italic: true, size: 9, color: { argb: f.level === "red" ? COLOR.negative : f.level === "amber" ? COLOR.warn : COLOR.muted } });
        ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
        ws.mergeCells(r, 2, r, 4);
        ws.getRow(r).height = 28;
        r++;
      }
      r++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
