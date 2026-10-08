import { NextRequest, NextResponse } from "next/server";
import {
  getOrEmptySuiteContacts,
  saveSuiteContacts,
} from "@/lib/suites/contactsStorage";
import { sanitizeContacts } from "@/lib/suites/contacts";

// Admin-only — site auth middleware covers everything outside the public
// /submit and /reserve paths.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unitRefOf(params: { unitRef: string }): string {
  return decodeURIComponent(params.unitRef).trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
  const contacts = await getOrEmptySuiteContacts(unitRef);
  return NextResponse.json({ contacts });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const list = sanitizeContacts(body);
  const contacts = await saveSuiteContacts(unitRef, list);
  return NextResponse.json({ contacts });
}
