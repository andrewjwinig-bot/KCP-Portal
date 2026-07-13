import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";
import { todosFor } from "@/lib/todos/store";
import type { Todo } from "@/lib/todos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The signed-in user from the site cookie (authoritative — not client-supplied). */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce a client-supplied due value to a valid "YYYY-MM-DD" or null. */
function cleanDue(v: unknown): string | null {
  return typeof v === "string" && DUE_RE.test(v) ? v : null;
}
function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 500) : "";
}
function cleanNote(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim().slice(0, 1000) : "";
  return s || undefined;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const todos = await todosFor(user).all();
    return NextResponse.json({ todos });
  } catch (err: any) {
    console.error("[GET /api/todos]", err?.message ?? err);
    return NextResponse.json({ todos: [] });
  }
}

/** Create a todo. Body: { text, due?, note? }. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const body = await req.json();
    const text = cleanText(body?.text);
    if (!text) return NextResponse.json({ error: "Task text is required" }, { status: 400 });
    const todo: Todo = {
      id: crypto.randomUUID(),
      text,
      note: cleanNote(body?.note),
      due: cleanDue(body?.due),
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    await todosFor(user).set(todo.id, todo);
    return NextResponse.json({ todo });
  } catch (err: any) {
    console.error("[POST /api/todos]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** Update a todo. Body: { id, text?, due?, note?, done? }. Only sent fields change. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const store = todosFor(user);
    const existing = await store.get(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const next: Todo = { ...existing };
    if ("text" in body) {
      const text = cleanText(body.text);
      if (!text) return NextResponse.json({ error: "Task text is required" }, { status: 400 });
      next.text = text;
    }
    if ("note" in body) next.note = cleanNote(body.note);
    if ("due" in body) next.due = cleanDue(body.due);
    if ("done" in body) {
      const done = body.done === true;
      next.done = done;
      next.completedAt = done ? (existing.done ? existing.completedAt ?? new Date().toISOString() : new Date().toISOString()) : null;
    }
    await store.set(id, next);
    return NextResponse.json({ todo: next });
  } catch (err: any) {
    console.error("[PATCH /api/todos]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** Delete a todo. Body: { id }. */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await todosFor(user).remove(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE /api/todos]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
