import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  applyPatch,
  emptyRequest,
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  type Attachment,
  type MaintenanceRequest,
  type RequestCategory,
  type RequestPriority,
} from "@/lib/maintenance/requests";
import { saveRequest } from "@/lib/maintenance/requestsStorage";
import { sendMail } from "@/lib/mail";
import { upsertContact } from "@/lib/maintenance/tenants";
import { classify } from "@/lib/maintenance/triage";
import { summarize } from "@/lib/maintenance/summarize";
import { companiesForProperty } from "@/lib/tenants/companies";
import { bestTenantMatch } from "@/lib/tenants/match";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public tenant submission endpoint — no site auth. Middleware exempts
// this path. Protected by:
//   1. Honeypot field (`website`) that bots fill and humans don't see.
//   2. Per-IP rate limit (5/hour).
//   3. File size + count caps on photo uploads.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB each (Vercel body cap is ~4.5 MB total)
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function asPriority(s: string | null): RequestPriority | "" {
  return REQUEST_PRIORITIES.find((p) => p === s) ?? "";
}

function asCategories(arr: string[]): RequestCategory[] {
  const allowed = new Set<string>(REQUEST_CATEGORIES);
  return arr.filter((c): c is RequestCategory => allowed.has(c));
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json(
      { error: "Too many submissions from this address. Try again later." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  // Honeypot — silently accept-and-ignore so bots don't learn they were caught.
  if (String(form.get("website") ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const subject = String(form.get("subject") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const propertyCode = String(form.get("propertyCode") ?? "").trim();
  const propertyName = String(form.get("propertyName") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const tenantSuite = String(form.get("tenantSuite") ?? "").trim();
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const tenantEmail = String(form.get("tenantEmail") ?? "").trim();
  const tenantPhone = String(form.get("tenantPhone") ?? "").trim();
  let priority = asPriority(String(form.get("priority") ?? "") || null);
  let categories = asCategories(form.getAll("category").map(String));

  // Auto-triage from the description when the form didn't pre-pick. The
  // public form never sends category/priority today, so the rule schedule
  // (lib/maintenance/triage) is what fills them in. Greg can override on
  // the request modal.
  if (description) {
    const triage = classify(`${subject}\n${description}`);
    if (categories.length === 0) categories = triage.categories;
    if (!priority) priority = triage.priority;
  }
  // Every new request gets a priority — Medium is the floor so nothing
  // sneaks into the queue as "no priority set".
  if (!priority) priority = "Medium";

  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });
  if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 });
  if (!tenantEmail) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!tenantPhone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!propertyName) return NextResponse.json({ error: "Property is required" }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Company is required" }, { status: 400 });

  const tenantName = `${firstName} ${lastName}`.trim();

  // Auto-resolve the free-text company name to a canonical rent-roll
  // tenant so staff don't have to. When nothing matches confidently, keep
  // the typed name and flag the request so the queue highlights it as
  // needing manual assignment.
  let resolvedCompany = company;
  let resolvedSuite = tenantSuite;
  let tenantResolved = false;
  // PBS is our cleaning vendor — they aren't on the rent roll but
  // legitimately submit service requests against any office property
  // we manage, so treat them as a resolved submitter on every property.
  const isPbsVendor = /^\s*pbs\s*$/i.test(company);
  if (isPbsVendor) {
    resolvedCompany = "PBS";
    tenantResolved = true;
  } else if (propertyCode) {
    const companies = await companiesForProperty(propertyCode);
    const match = bestTenantMatch(company, companies.map((c) => c.name));
    if (match) {
      const pick = companies.find((c) => c.name === match.name)!;
      resolvedCompany = pick.name;
      tenantResolved = true;
      if (!resolvedSuite) {
        resolvedSuite = pick.units.map((u) => u.unitRef).join(", ");
      }
    }
  }

  // Subject = summarized description for the queue table + modal title.
  // Falls back to the form-supplied subject (none today, future-proofing)
  // and then a generic label if the description didn't yield anything.
  const summary = summarize(description);
  const derivedSubject = subject
    || summary
    || `${company || tenantName}: maintenance request`;

  // Build the new request before handling photos so we have an id for blob paths.
  const r: MaintenanceRequest = applyPatch(emptyRequest({
    subject: derivedSubject,
    propertyCode: propertyCode || null,
    propertyName,
    tenantCompany: resolvedCompany,
    tenantResolved,
    tenantSuite: resolvedSuite,
    tenantEmail,
    tenantName,
    priority,
    categories,
    source: "portal",
  }), {});

  // Compose the initial note with the whole submission context.
  const noteLines: string[] = [description];
  const contextLines: string[] = [];
  if (company) contextLines.push(`Tenant: ${company}`);
  if (tenantPhone) contextLines.push(`Phone: ${tenantPhone}`);
  if (contextLines.length) {
    noteLines.push("", ...contextLines);
  }
  r.notes.push({
    id: "note_" + r.id + "_submit",
    author: "admin",
    authorName: "Tenant Submission",
    text: noteLines.join("\n"),
    createdAt: r.createdAt,
  });

  // Photo uploads.
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Too many photos. Limit ${MAX_PHOTOS}.` },
      { status: 400 },
    );
  }

  if (photos.length > 0) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Photo uploads are not configured on the server. Try submitting without photos." },
        { status: 503 },
      );
    }
    for (const file of photos) {
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { error: `Photo "${file.name}" is too large (max ${MAX_PHOTO_BYTES / 1024 / 1024} MB).` },
          { status: 400 },
        );
      }
      if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Photo "${file.name}" must be an image (JPEG/PNG/GIF/WebP/HEIC).` },
          { status: 400 },
        );
      }
      const result = await put(`maintenance/${r.id}/${file.name}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type || undefined,
      });
      const attachment: Attachment = {
        id: "att_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name: file.name,
        url: result.url,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      r.attachments.push(attachment);
    }
  }

  try {
    await saveRequest(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save request" },
      { status: 500 },
    );
  }

  // Best-effort tenant directory upsert — if it fails, the request still
  // saved, so don't 500 the submission.
  try {
    await upsertContact({
      firstName,
      lastName,
      email: tenantEmail,
      phone: tenantPhone,
      company,
      propertyCode: propertyCode || null,
    });
  } catch { /* ignore */ }

  // Best-effort confirmation email. Same Postmark setup that powers the
  // inbound auto-reply. If POSTMARK_SERVER_TOKEN / MAINTENANCE_REPLY_FROM
  // aren't set the call is a no-op and the submission still succeeds.
  if (tenantEmail) {
    try {
      await sendMail({
        to: tenantEmail,
        subject: `Maintenance request received — ${propertyName || "KCP"}`,
        textBody: confirmationBody({
          firstName,
          propertyName,
          tenantSuite,
          description,
          requestId: r.id,
        }),
        isAutoReply: true,
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

function confirmationBody(args: {
  firstName: string;
  propertyName: string;
  tenantSuite: string;
  description: string;
  requestId: string;
}): string {
  const greet = args.firstName ? `Hi ${args.firstName},` : "Hi,";
  const where = [args.propertyName, args.tenantSuite].filter(Boolean).join(" · ");
  const lines = [
    greet,
    "",
    "Thanks for submitting a maintenance request to Korman Commercial Properties. We've received it and the maintenance team has been notified.",
    "",
    where ? `Property: ${where}` : null,
    `Reference ID: ${args.requestId}`,
    "",
    "Your description:",
    args.description.split("\n").map((l) => `  ${l}`).join("\n"),
    "",
    "Someone from the team will follow up shortly. For after-hours emergencies (active leak, fire, security), please call your property's emergency line.",
    "",
    "— KCP Maintenance",
  ].filter((l) => l !== null) as string[];
  return lines.join("\n");
}
