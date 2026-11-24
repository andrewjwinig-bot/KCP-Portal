// The New Accountant Handbook, as Drew wrote it. It carries EINs and bank
// account details, so it is served only to signed-in users who can open the
// orientation (authorizeRequest → /onboarding), never from /public — and it
// lives in protected storage (lib/secureFiles.ts), not the code repository.
import { readSecureFile, SECURE_FILES } from "@/lib/secureFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDBOOK_FILE = "Korman New Accountant Handbook.docx";

export async function GET() {
  try {
    const buf = await readSecureFile(SECURE_FILES.handbook);
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
