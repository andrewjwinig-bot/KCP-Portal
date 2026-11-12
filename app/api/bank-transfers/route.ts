import { NextResponse } from "next/server";
import {
  listBankTransfers,
  saveBankTransfer,
  removeBankTransfer,
  setShareFolderUrl,
  newBankTransferId,
  type BankTransfer,
} from "@/lib/bankTransfers/storage";
import { sendMail, type MailAttachment } from "@/lib/mail";
import { get } from "@vercel/blob";
import { portalEmail, titleCase } from "@/lib/email/portalEmail";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NEW_TRANSFER_NOTIFY = "mjaster@kormancommercial.com";

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function buildTransferEmail(t: BankTransfer, by: string | null) {
  const confirmation = t.pdfUrl ? "Attached" : t.pdfSaved ? "In the shared folder" : "Not yet uploaded";
  return portalEmail({
    subject: `Bank transfer — ${fmtMoney(t.amount)} · ${t.fromLabel} to ${t.toLabel}`,
    eyebrow: "Bank Transfer",
    title: "New bank transfer",
    figure: { value: fmtMoney(t.amount), label: prettyDate(t.date) },
    rows: [
      { label: "Bank", value: t.bankName },
      { label: "From", value: t.fromLabel },
      { label: "To", value: t.toLabel },
      { label: "Confirmation", value: confirmation, tone: t.pdfUrl || t.pdfSaved ? "good" : "warn" },
    ],
    note: t.description?.trim() ? { label: "Details", text: t.description.trim() } : undefined,
    footer: by ? `Logged by ${by}` : undefined,
  });
}

/** Fetch a private Blob's bytes for emailing as an attachment. Best-effort. */
async function fetchBlobBytes(url: string): Promise<Uint8Array | null> {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const result = await get(url, { access: "private" });
    if (!result) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const data = await listBankTransfers();
    return NextResponse.json({ ...data, blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const isNew = !(typeof body.id === "string" && body.id);
    const pdfUrl = typeof body.pdfUrl === "string" && body.pdfUrl.trim() ? body.pdfUrl.trim() : undefined;
    const pdfName = typeof body.pdfName === "string" && body.pdfName.trim() ? body.pdfName.trim() : undefined;
    const t: BankTransfer = {
      id: isNew ? newBankTransferId() : body.id,
      date: String(body.date ?? "").trim(),
      bankName: String(body.bankName ?? "").trim(),
      fromLabel: String(body.fromLabel ?? "").trim(),
      toLabel: String(body.toLabel ?? "").trim(),
      amount: Math.max(0, Number(body.amount ?? 0) || 0),
      // A confirmation exists if a PDF was uploaded or the legacy "in folder" flag is set.
      pdfSaved: Boolean(pdfUrl) || Boolean(body.pdfSaved),
      pdfUrl,
      pdfName,
      description: String(body.description ?? ""),
      createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
      return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
    }
    if (!t.fromLabel || !t.toLabel) {
      return NextResponse.json({ error: "From and To are required" }, { status: 400 });
    }
    await saveBankTransfer(t);

    // Best-effort notification — never blocks the save. sendMail returns
    // false silently if Postmark isn't configured. When a confirmation PDF was
    // uploaded, attach it so the confirmation lands in the same email.
    if (isNew) {
      const who = await budgetUser();
      const { subject, html, text: textBody } = buildTransferEmail(t, who ? titleCase(USERS[who]?.label ?? who) : null);
      const attachments: MailAttachment[] = [];
      if (t.pdfUrl) {
        const bytes = await fetchBlobBytes(t.pdfUrl);
        if (bytes) attachments.push({ name: t.pdfName || `Transfer ${t.date}.pdf`, content: bytes, contentType: "application/pdf" });
      }
      sendMail({ to: NEW_TRANSFER_NOTIFY, subject, textBody, htmlBody: html, attachments: attachments.length ? attachments : undefined }).catch(() => { /* swallow */ });
    }

    return NextResponse.json({ transfer: t });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.shareFolderUrl !== "string") {
      return NextResponse.json({ error: "shareFolderUrl required" }, { status: 400 });
    }
    const url = await setShareFolderUrl(body.shareFolderUrl);
    return NextResponse.json({ shareFolderUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await removeBankTransfer(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}
