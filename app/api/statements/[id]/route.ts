import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const STATEMENTS_DIR = process.env.NODE_ENV === "production"
  ? "/tmp/statements"
  : path.join(process.cwd(), "data", "statements");

function safePath(id: string) {
  const clean = id.replace(/[^a-zA-Z0-9\-_]/g, "");
  return path.join(STATEMENTS_DIR, `${clean}.json`);
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
