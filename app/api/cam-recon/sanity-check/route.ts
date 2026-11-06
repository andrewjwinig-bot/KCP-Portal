import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST { kind, meta, result } — an AI "does this look right?" pass on a computed
 * CAM/RET (interim or year-end) tenant statement, BEFORE it's sent. The numbers
 * are already computed; the AI only flags things that look inconsistent or off
 * (pro-rata that doesn't tie, escrow vs due mismatch, an expense that looks
 * wrong, a share out of range). Returns short findings — never new numbers.
 */
export async function POST(req: Request) {
  let body: { kind?: string; meta?: unknown; result?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!body.result || !body.meta) return NextResponse.json({ error: "meta + result required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const prompt =
    `You are a commercial-real-estate accountant reviewing a tenant's ${body.kind ?? ""} CAM/RET reconciliation statement BEFORE it is sent to the tenant. ` +
    `The numbers are already computed and correct arithmetically — your job is to catch things that look OFF or inconsistent, so a bad statement doesn't go out.\n\n` +
    `Check for: a pro-rata share that's implausible (0% where it should have a share, or > 100%); billed escrow that's wildly different from the amount due (possible wrong escrow); an expense pool or share that looks out of line with the tenant's size; a balance that seems too large to be right; occupied-months / as-of inconsistencies; INS or RET that's zero where you'd expect a charge. ` +
    `Do NOT restate the numbers or recompute — only flag concerns and say what to verify.\n\n` +
    `Return ONLY JSON: {"ok": boolean, "findings": [{"severity": "warn"|"info", "note": "short concern + what to check"}]}. ` +
    `ok=true with an empty findings array means it looks reasonable. Keep each note under ~25 words.\n\n` +
    `STATEMENT DATA:\n${JSON.stringify({ meta: body.meta, result: body.result }, null, 1).slice(0, 12000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return NextResponse.json({ error: `Sanity check failed (${res.status}).` }, { status: 502 });
    const j = await res.json();
    const text: string = (j?.content ?? []).filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ ok: true, findings: [] });
    const parsed = JSON.parse(match[0]) as { ok?: boolean; findings?: { severity?: string; note?: string }[] };
    const findings = (parsed.findings ?? []).filter((f) => f && typeof f.note === "string").slice(0, 8);
    return NextResponse.json({ ok: parsed.ok !== false && findings.length === 0, findings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sanity check failed" }, { status: 500 });
  }
}
