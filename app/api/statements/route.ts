import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const STATEMENTS_DIR = process.env.NODE_ENV === "production"
  ? "/tmp/statements"
  : path.join(process.cwd(), "data", "statements");

async function ensureDir() {
  if (!existsSync(STATEMENTS_DIR)) {
    await mkdir(STATEMENTS_DIR, { recursive: true });
  }
}

export async function GET() {
  try {
    await ensureDir();
    const files = await readdir(STATEMENTS_DIR);
    const items = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await readFile(path.join(STATEMENTS_DIR, f), "utf-8");
          const d = JSON.parse(raw);
          return {
            id: d.id,
            savedAt: d.savedAt,
            periodText: d.periodText,
            statementMonth: d.statementMonth,
            txCount: (d.tx ?? []).length,
            total: (d.tx ?? []).reduce((a: number, t: any) => a + (t.amount ?? 0), 0),
          };
        })
    );
    items.sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to list statements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDir();
    const body = await req.json();
    const { periodText, statementMonth, tx } = body;
    if (!tx || !Array.isArray(tx)) {
      return NextResponse.json({ error: "tx array is required" }, { status: 400 });
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const statement = { id, savedAt: new Date().toISOString(), periodText: periodText ?? "", statementMonth: statementMonth ?? "", tx };
    await writeFile(path.join(STATEMENTS_DIR, `${id}.json`), JSON.stringify(statement), "utf-8");
    return NextResponse.json({ id, savedAt: statement.savedAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
