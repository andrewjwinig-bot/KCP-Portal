import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";
import { centerByCode } from "@/lib/centers/registry";

// Server-side image upload for a public shopping-center photo (hero, site plan,
// neighborhood). Used for normal-sized images (≤ ~4 MB) because it's simple and
// reliable — the file is streamed to Vercel Blob with put() and the public URL
// is returned directly, with none of the client-token / CORS / completion
// handshake that the direct browser→Blob path (./upload) needs. Larger files
// still use the client upload path to bypass the 4.5 MB serverless body limit.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep clear of Vercel's ~4.5 MB serverless request-body limit.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"];

async function signedIn(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id as UserId);
}

export async function POST(req: Request, { params }: { params: { code: string } }): Promise<Response> {
  if (!centerByCode(params.code)) return NextResponse.json({ error: "Unknown center" }, { status: 404 });
  if (!(await signedIn())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const key = String(form.get("key") ?? "img").replace(/[^a-zA-Z0-9._-]/g, "_") || "img";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large for direct upload — please use an image under 4 MB." }, { status: 413 });
  }

  try {
    // The Blob store is PRIVATE, so images are stored with private access and
    // served to the public marketing page through the /api/center-image proxy
    // (see centerImageSrc). A public put() is rejected by a private store.
    const safe = (file.name || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`centers/${params.code}/${key}-${safe}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
