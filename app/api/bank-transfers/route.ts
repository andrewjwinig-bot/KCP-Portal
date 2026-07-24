import { NextResponse } from "next/server";
import {
  listBankTransfers,
  saveBankTransfer,
  removeBankTransfer,
  setShareFolderUrl,
  newBankTransferId,
  type BankTransfer,
} from "@/lib/bankTransfers/storage";
import { sendMail } from "@/lib/mail";

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

function buildTransferEmail(t: BankTransfer): { subject: string; textBody: string } {
  const lines = [
    `A new bank transfer was logged in the KCP Portal.`,
    ``,
    `Date:        ${prettyDate(t.date)}`,
    `Bank:        ${t.bankName || "—"}`,
    `From:        ${t.fromLabel}`,
    `To:          ${t.toLabel}`,
    `Amount:      ${fmtMoney(t.amount)}`,
    `PDF saved:   ${t.pdfSaved ? "Yes" : "Not yet"}`,
  ];
  if (t.description?.trim()) {
    lines.push("", "Details:", t.description.trim());
  }
  return {
    subject: "New Bank Transfer",
    textBody: lines.join("\n"),
  };
}

export async function GET() {
  try {
    const data = await listBankTransfers();
    return NextResponse.json(data);
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
    const t: BankTransfer = {
      id: isNew ? newBankTransferId() : body.id,
      date: String(body.date ?? "").trim(),
      bankName: String(body.bankName ?? "").trim(),
      fromLabel: String(body.fromLabel ?? "").trim(),
      toLabel: String(body.toLabel ?? "").trim(),
      amount: Math.max(0, Number(body.amount ?? 0) || 0),
      pdfSaved: Boolean(body.pdfSaved),
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
    // false silently if Postmark isn't configured.
    if (isNew) {
      const { subject, textBody } = buildTransferEmail(t);
      sendMail({ to: NEW_TRANSFER_NOTIFY, subject, textBody }).catch(() => { /* swallow */ });
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
