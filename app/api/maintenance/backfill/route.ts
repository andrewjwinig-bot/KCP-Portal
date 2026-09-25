import { NextRequest, NextResponse } from "next/server";
import {
  AIRTABLE_TABLES,
  AirtableConfigError,
  listRecords,
} from "@/lib/airtable";
import {
  emptyRequest,
  type MaintenanceRequest,
  type RequestPriority,
  type RequestStatus,
  type RequestCategory,
  REQUEST_CATEGORIES,
} from "@/lib/maintenance/requests";
import { getRequest, saveRequest } from "@/lib/maintenance/requestsStorage";

export const dynamic = "force-dynamic";

// One-shot import of Airtable's Requests table into portal storage. Idempotent —
// existing records with the same id are skipped unless ?overwrite=1.
// POST /api/maintenance/backfill[?overwrite=1]

type RequestFields = {
  "Request Subject"?: string;
  "Status"?: string;
  "Priority"?: string;
  "Submitted Date"?: string;
  "Completed Date"?: string;
  "Property"?: string[];
  "Linked Contact"?: string[];
  "Assigned To"?: string[];
  "Request Category (Non-AI)"?: string[];
  "Request Summary (AI)"?: string | { value?: string; state?: string };
  "Internal Notes"?: string;
  "Linked Email"?: string[];
};

type PropertyFields = { "Property Name"?: string };
type TenantFields = { "Name"?: string; "Email"?: string };

const VALID_STATUS: RequestStatus[] = ["New", "In Progress", "Complete"];
const VALID_PRIORITY: RequestPriority[] = ["Low", "Medium", "High"];

function aiTextValue(v: RequestFields["Request Summary (AI)"]): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.value ?? "";
}

function asStatus(s: string | undefined): RequestStatus {
  return VALID_STATUS.find((v) => v === s) ?? "New";
}

function asPriority(s: string | undefined): RequestPriority | "" {
  return VALID_PRIORITY.find((v) => v === s) ?? "";
}

function asCategories(arr: string[] | undefined): RequestCategory[] {
  if (!arr) return [];
  const set = new Set<string>(REQUEST_CATEGORIES);
  return arr.filter((c): c is RequestCategory => set.has(c));
}

export async function POST(req: NextRequest) {
  const overwrite = req.nextUrl.searchParams.get("overwrite") === "1";
  try {
    const [requests, properties, tenants] = await Promise.all([
      listRecords<RequestFields>(AIRTABLE_TABLES.requests),
      listRecords<PropertyFields>(AIRTABLE_TABLES.properties, {
        fields: ["Property Name"],
      }),
      listRecords<TenantFields>(AIRTABLE_TABLES.tenants, {
        fields: ["Name", "Email"],
      }),
    ]);

    const propName = new Map(
      properties.map((p) => [p.id, p.fields["Property Name"] ?? ""]),
    );
    const tenantInfo = new Map(
      tenants.map((t) => [
        t.id,
        { name: t.fields["Name"] ?? "", email: t.fields["Email"] ?? "" },
      ]),
    );

    let imported = 0;
    let skipped = 0;
    for (const r of requests) {
      if (!overwrite && (await getRequest(r.id))) {
        skipped++;
        continue;
      }
      const f = r.fields;
      const propertyIds = f["Property"] ?? [];
      const contactIds = f["Linked Contact"] ?? [];
      const firstContact = contactIds[0] ? tenantInfo.get(contactIds[0]) : undefined;

      const submittedDate =
        f["Submitted Date"] ??
        r.createdTime ??
        new Date().toISOString();

      const next: MaintenanceRequest = emptyRequest({
        id: r.id,
        subject: f["Request Subject"] ?? "(no subject)",
        status: asStatus(f["Status"]),
        priority: asPriority(f["Priority"]),
        categories: asCategories(f["Request Category (Non-AI)"]),
        propertyCode: null,
        propertyName: propertyIds.map((id) => propName.get(id) ?? "").filter(Boolean).join(", "),
        tenantEmail: firstContact?.email ?? "",
        tenantName: firstContact?.name ?? "",
        assignedTo: null,                     // Re-assign in portal post-migration
        submittedDate,
        completedDate: f["Completed Date"] ?? null,
        notes: f["Internal Notes"]
          ? [{
              id: "note_migrated_" + r.id,
              author: "admin",
              authorName: "Migrated",
              text: f["Internal Notes"],
              createdAt: r.createdTime ?? submittedDate,
            }]
          : [],
        attachments: [],
        linkedEmailIds: f["Linked Email"] ?? [],
        aiSummary: aiTextValue(f["Request Summary (AI)"]),
        source: "airtable",
        createdAt: r.createdTime ?? submittedDate,
      });
      await saveRequest(next);
      imported++;
    }

    return NextResponse.json({ imported, skipped, total: requests.length });
  } catch (e) {
    if (e instanceof AirtableConfigError) {
      return NextResponse.json({ error: e.message, configError: true }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
