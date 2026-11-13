import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canSwitchUsers, USERS, type UserId } from "@/lib/users";
import { MODULES, CHECKLIST, ONBOARDING_LEARNERS } from "@/lib/onboarding/modules";
import { getProgress, updateProgress } from "@/lib/onboarding/progressStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const isLearner = (u: string) => (ONBOARDING_LEARNERS as readonly string[]).includes(u);

/** Whose record this request reads or writes: a learner their own; Drew and
 *  admin (the profile switchers) any learner's, defaulting to the first. */
function subject(me: UserId, asked: string | null): string | null {
  if (isLearner(me)) return me;
  if (!canSwitchUsers(me)) return null;
  return asked && isLearner(asked) ? asked : ONBOARDING_LEARNERS[0];
}

export async function GET(req: Request) {
  const me = await budgetUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const who = subject(me, new URL(req.url).searchParams.get("user"));
  if (!who) return NextResponse.json({ error: "Not available." }, { status: 403 });
  try {
    return NextResponse.json({ user: who, name: USERS[who as UserId]?.label ?? who, progress: await getProgress(who) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 503 });
  }
}

// POST { user?, module, score, of } — a module finished (or { module, undo: true })
// POST { user?, item, done }        — a 90-day checklist item ticked / unticked
export async function POST(req: Request) {
  const me = await budgetUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const who = subject(me, typeof b?.user === "string" ? b.user : null);
  if (!who) return NextResponse.json({ error: "Not available." }, { status: 403 });
  const by = USERS[me]?.label ?? me;
  try {
    if (typeof b?.module === "string") {
      const mod = MODULES.find((m) => m.id === b.module);
      if (!mod) return NextResponse.json({ error: "Unknown module." }, { status: 400 });
      const progress = await updateProgress(who, (p) => {
        if (b.undo) delete p.modules[mod.id];
        else p.modules[mod.id] = { doneAt: new Date().toISOString(), score: Math.max(0, Math.min(Number(b.score) || 0, mod.quiz.length)), of: mod.quiz.length };
      });
      return NextResponse.json({ ok: true, progress });
    }
    if (typeof b?.item === "string") {
      if (!CHECKLIST.some((g) => g.items.some((i) => i.id === b.item))) return NextResponse.json({ error: "Unknown item." }, { status: 400 });
      const progress = await updateProgress(who, (p) => {
        if (b.done) p.checklist[b.item] = { doneAt: new Date().toISOString(), by };
        else delete p.checklist[b.item];
      });
      return NextResponse.json({ ok: true, progress });
    }
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
