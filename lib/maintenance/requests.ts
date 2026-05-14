// Portal-owned Maintenance Request data model.
//
// Pure types + constants + tiny helpers — safe to import from client
// components. Server-only storage lives in ./requestsStorage.ts.

import type { StaffId } from "@/lib/maintenance/staff";

export const REQUEST_STATUSES = ["New", "In Progress", "Complete"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

// Same set of categories used in the Airtable "Request Category (Non-AI)"
// field, in the same order Greg's team is used to seeing them.
export const REQUEST_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "General Repairs",
  "Cleaning / Janitorial",
  "Lighting",
  "Doors / Locks",
  "Windows / Glass",
  "Pest Control",
  "Safety / Compliance",
  "Exterior Maintenance",
  "Interior Maintenance",
  "Access Request",
  "Tenant Request",
  "Move-In / Move-Out",
  "Noise Complaint",
  "Landscaping",
  "Trash / Waste",
  "Inspection",
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
  tenantEmail: string;
  tenantName: string;
  assignedTo: StaffId | null;
  submittedDate: string;              // ISO
  completedDate: string | null;       // ISO when Complete
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
    tenantEmail: "",
    tenantName: "",
    assignedTo: null,
    submittedDate: now,
    completedDate: null,
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
