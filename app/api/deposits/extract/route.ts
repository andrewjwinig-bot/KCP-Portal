import { NextRequest, NextResponse } from "next/server";
import type { ExtractedCheck } from "@/lib/deposits/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claude vision can read these; anything else can't be OCR'd here.
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const EMPTY: ExtractedCheck = { checkNumber: "", amount: null, checkDate: "" };

// POST — multipart "file" field. Best-effort OCR of a check image into
// { checkNumber, amount, checkDate }. Does not persist anything. Returns
// empty fields (with a note) when OCR isn't configured or possible.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ...EMPTY,
      note: "Automatic extraction isn't configured — enter the check details manually.",
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No file in 'file' field" }, { status: 400 });
  }
  if (!VISION_TYPES.has(file.type)) {
    return NextResponse.json({
      ...EMPTY,
      note: "This file type can't be read automatically — enter the check details manually.",
    });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const prompt =
    "This is a photo of a bank check. Read it and return ONLY a JSON object " +
    'with keys "checkNumber" (string), "amount" (number, dollars, no symbols or ' +
    'commas) and "checkDate" (string, ISO YYYY-MM-DD). Use an empty string or ' +
    "null for anything you cannot read. Return nothing but the JSON.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ ...EMPTY, note: "Extraction failed — enter the details manually." });
    }
    const j = await res.json();
    const text: string = (j?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ ...EMPTY, note: "Couldn't read the check — enter the details manually." });
    }
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const amountRaw = parsed.amount;
    const amountNum = typeof amountRaw === "number"
      ? amountRaw
      : Number(String(amountRaw ?? "").replace(/[$,]/g, ""));
    const dateStr = String(parsed.checkDate ?? "");
    const result: ExtractedCheck = {
      checkNumber: String(parsed.checkNumber ?? "").trim().slice(0, 40),
      amount: Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null,
      checkDate: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : "",
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ...EMPTY, note: "Extraction failed — enter the details manually." });
  }
}
