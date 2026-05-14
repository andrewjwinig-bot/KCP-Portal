import { NextResponse } from "next/server";
import {
  AIRTABLE_TABLES,
  AirtableConfigError,
  listRecords,
  type AirtableRecord,
} from "@/lib/airtable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestFields = {
  "Request Subject"?: string;
  "Status"?: string;
  "Priority"?: string;
  "Submitted Date"?: string;
  "Completed Date"?: string;
  "Property"?: string[];
  "Linked Contact"?: string[];
  "Assigned To"?: string[];
  "Units"?: string[];
  "Common Areas"?: string[];
  "Request Category (Non-AI)"?: string[];
  "Request Summary (AI)"?: string | { value?: string; state?: string };
  "Internal Notes"?: string;
  "Attachments"?: { id: string; url: string; filename: string; type: string }[];
};

type PropertyFields = { "Property Name"?: string };
type TenantFields = { "Name"?: string; "Email"?: string };

export type MaintenanceRequest = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  submittedDate: string | null;
  completedDate: string | null;
  propertyIds: string[];
  propertyNames: string[];
  contactIds: string[];
  contactNames: string[];
  assignedTo: string[];
  units: string[];
  commonAreas: string[];
  categories: string[];
  aiSummary: string;
  internalNotes: string;
  attachmentCount: number;
  createdTime: string;
};

function aiTextValue(v: RequestFields["Request Summary (AI)"]): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.value ?? "";
}

export async function GET() {
  try {
    const [requests, properties, tenants] = await Promise.all([
      listRecords<RequestFields>(AIRTABLE_TABLES.requests, {
        sort: [{ field: "Submitted Date", direction: "desc" }],
      }),
      listRecords<PropertyFields>(AIRTABLE_TABLES.properties, {
        fields: ["Property Name"],
      }),
      listRecords<TenantFields>(AIRTABLE_TABLES.tenants, {
        fields: ["Name", "Email"],
      }),
    ]);

    const propName = new Map(
      properties.map((p) => [p.id, p.fields["Property Name"] ?? p.id]),
    );
    const tenantName = new Map(
      tenants.map((t) => [t.id, t.fields["Name"] ?? t.fields["Email"] ?? t.id]),
    );

    const out: MaintenanceRequest[] = requests.map(
      (r: AirtableRecord<RequestFields>) => {
        const propertyIds = r.fields["Property"] ?? [];
        const contactIds = r.fields["Linked Contact"] ?? [];
        return {
          id: r.id,
          subject: r.fields["Request Subject"] ?? "(no subject)",
          status: r.fields["Status"] ?? "",
          priority: r.fields["Priority"] ?? "",
          submittedDate: r.fields["Submitted Date"] ?? null,
          completedDate: r.fields["Completed Date"] ?? null,
          propertyIds,
          propertyNames: propertyIds.map((id) => propName.get(id) ?? id),
          contactIds,
          contactNames: contactIds.map((id) => tenantName.get(id) ?? id),
          assignedTo: r.fields["Assigned To"] ?? [],
          units: r.fields["Units"] ?? [],
          commonAreas: r.fields["Common Areas"] ?? [],
          categories: r.fields["Request Category (Non-AI)"] ?? [],
          aiSummary: aiTextValue(r.fields["Request Summary (AI)"]),
          internalNotes: r.fields["Internal Notes"] ?? "",
          attachmentCount: r.fields["Attachments"]?.length ?? 0,
          createdTime: r.createdTime,
        };
      },
    );

    return NextResponse.json({ requests: out });
  } catch (e) {
    if (e instanceof AirtableConfigError) {
      return NextResponse.json(
        { error: e.message, configError: true },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load Airtable" },
      { status: 502 },
    );
  }
}
