import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Use /tmp in Lambda/Vercel (process.cwd() is read-only /var/task there)
const PERIODS_DIR = process.env.NODE_ENV === "production"
  ? "/tmp/payroll-periods"
  : path.join(process.cwd(), "data", "periods");

function safePath(id: string) {
  // Sanitize to prevent path traversal
  const clean = id.replace(/[^a-zA-Z0-9\-_]/g, "");
  return path.join(PERIODS_DIR, `${clean}.json`);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const filePath = safePath(params.id);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const raw = await readFile(filePath, "utf-8");
  return NextResponse.json(JSON.parse(raw));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const filePath = safePath(params.id);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await unlink(filePath);
  return NextResponse.json({ deleted: true });
}
