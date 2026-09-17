// A question the assistant asks BEFORE doing the work, instead of guessing.
//
// The expensive requests are the ones worth asking about: "a table of all
// properties' non-reimbursable management salaries as a % of NOI going back as
// far as we have" is two minutes of work and at least two readings — which
// years, and which GL lines count as "management salaries". Guessing wrong
// costs the user another two minutes and a re-typed prompt; asking costs one
// click.
//
// So this is deliberately NARROW. It is not a conversational tic: the model is
// told to ask only when the readings would produce materially different numbers
// AND the work is expensive, and never more than once in a conversation. The
// options are rendered as chips, and the client always appends its own "you
// decide" escape so the question can never become a wall the user can't get
// past.
//
// It is also EXCLUSIVE — a turn that asks does not also answer. A half-answer
// beside a question is the worst of both: the user reads the number, and the
// number was computed under the assumption the question exists to resolve.

export type ClarifySpec = { question: string; options: string[] };

const MAX_OPTIONS = 4;

export function validateClarify(raw: unknown): ClarifySpec | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const question = String(c.question ?? "").trim().slice(0, 200);
  if (question.length < 5) return null;

  const options: string[] = [];
  const seen = new Set<string>();
  for (const o of (Array.isArray(c.options) ? c.options : [])) {
    const label = String(o ?? "").trim().slice(0, 70);
    // Two chips reading the same thing are one chip and a dead click.
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    options.push(label);
    if (options.length === MAX_OPTIONS) break;
  }
  // One option is not a choice, it is a statement — and a question with nothing
  // to click is a dead end, since the user's only move is to retype.
  if (options.length < 2) return null;

  return { question, options };
}
