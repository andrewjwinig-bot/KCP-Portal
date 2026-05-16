// Portal-owned Maintenance Request data model.
//
// Pure types + constants + tiny helpers — safe to import from client
// components. Server-only storage lives in ./requestsStorage.ts.

import type { StaffId } from "@/lib/maintenance/staff";

export const REQUEST_STATUSES = ["New", "In Progress", "Complete"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

// Canonical category list — consolidated from the original 20-item Airtable
// schedule. Dropped: Tenant Request, Inspection, Access Request, Interior
// Maintenance (all too vague or overlapped with neighbors). Merged:
// Trash / Waste into Cleaning / Trash. Old records persisted with dropped
// values continue to display them in the queue and Reports tab — only new
// submissions and the canonical chip group respect the trimmed list.
export const REQUEST_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "General Repairs",
  "Cleaning / Trash",
  "Lighting",
  "Doors / Locks",
  "Windows / Glass",
  "Pest Control",
  "Safety / Compliance",
  "Exterior Maintenance",
  "Move-In / Move-Out",
  "Noise Complaint",
  "Landscaping",
  "Other",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export type Note = {
  id: string;
  author: StaffId | "admin";
  authorName: string;
  text: string;
  createdAt: string;
};

export type Attachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type MaintenanceRequest = {
  id: string;
  subject: string;
  status: RequestStatus;
  priority: RequestPriority | "";
  categories: RequestCategory[];
  propertyCode: string | null;        // e.g. "3610" — matched against PROPERTY_DEFS
  propertyName: string;               // Free-text fallback when no code is matched
  tenantCompany: string;              // The leased company (rent-roll occupant)
  tenantResolved: boolean;            // false → typed name didn't match the rent roll; needs staff assignment
  tenantSuite: string;                // Suite(s) the tenant occupies (e.g. "5-101")
  tenantEmail: string;                // Contact person's email
  tenantName: string;                 // Contact person's name (individual, not the company)
  assignedTo: StaffId | null;
  submittedDate: string;              // ISO
  completedDate: string | null;       // ISO when Complete
  seenAt: string | null;              // ISO when first opened in the modal
  notes: Note[];
  attachments: Attachment[];
  linkedEmailIds: string[];
  aiSummary: string;                  // Filled by Phase 6 (Claude API on inbound)
  source: "portal" | "airtable" | "email";
  createdAt: string;
  updatedAt: string;
};

const PREFIX = "maintenance-requests";
export const REQUESTS_PREFIX = PREFIX;

// ── Helpers ────────────────────────────────────────────────────────────────

export function newRequestId(): string {
  return (
    "req_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export function newNoteId(): string {
  return "note_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyRequest(partial: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? newRequestId(),
    subject: "",
    status: "New",
    priority: "",
    categories: [],
    propertyCode: null,
    propertyName: "",
    tenantCompany: "",
    tenantResolved: true,
    tenantSuite: "",
    tenantEmail: "",
    tenantName: "",
    assignedTo: null,
    submittedDate: now,
    completedDate: null,
    seenAt: null,
    notes: [],
    attachments: [],
    linkedEmailIds: [],
    aiSummary: "",
    source: "portal",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Patch an existing request with the supplied fields. Maintains updatedAt
 *  and auto-stamps completedDate when status flips to/from "Complete". */
export function applyPatch(r: MaintenanceRequest, patch: Partial<MaintenanceRequest>): MaintenanceRequest {
  const next = { ...r, ...patch, updatedAt: new Date().toISOString() };
  if (patch.status === "Complete" && r.status !== "Complete") {
    next.completedDate = new Date().toISOString();
  } else if (patch.status && patch.status !== "Complete" && r.status === "Complete") {
    next.completedDate = null;
  }
  return next;
}
