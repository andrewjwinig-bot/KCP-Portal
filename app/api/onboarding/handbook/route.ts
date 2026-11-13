// The New Accountant Handbook, as Drew wrote it. It carries EINs and bank
// account details, so it is served only to signed-in users who can open the
// orientation (authorizeRequest → /onboarding), never from /public.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDBOOK_FILE = "Korman New Accountant Handbook.docx";

export async function GET() {
  try {
    const buf = await readFile(path.join(process.cwd(), "data", "onboarding", HANDBOOK_FILE));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${HANDBOOK_FILE}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Handbook not found.", { status: 404 });
  }
}
