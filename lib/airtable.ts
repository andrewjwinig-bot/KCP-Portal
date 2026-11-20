// Minimal Airtable REST client for the Property Information base.
//
// Auth: a Personal Access Token (PAT) in env var AIRTABLE_TOKEN with read
// access to base appu2QwzsaWb4Qw2X. Without it, callers should surface a
// configuration error to the user.

export const AIRTABLE_BASE_ID = "appu2QwzsaWb4Qw2X";

export const AIRTABLE_TABLES = {
  properties: "tblH3oKk1EdHlaiUg",
  suites: "tblY0SMjrs6IZ0fpR",
  requests: "tblXlp2JXxyN6f4Qf",
  tenants: "tblZTSFGulO8uCT3U",
  emails: "tbl1LX0CHdXclMkDE",
} as const;

export type AirtableRecord<F = Record<string, unknown>> = {
  id: string;
  fields: F;
  createdTime: string;
};

type ListOpts = {
  fields?: string[];
  filterByFormula?: string;
  pageSize?: number;
  maxRecords?: number;
  sort?: { field: string; direction?: "asc" | "desc" }[];
  view?: string;
};

export class AirtableConfigError extends Error {
  constructor() {
    super("AIRTABLE_TOKEN env var is not set; cannot reach Airtable.");
    this.name = "AirtableConfigError";
  }
}

function getToken(): string {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new AirtableConfigError();
  return t;
}

export async function listRecords<F = Record<string, unknown>>(
  tableId: string,
  opts: ListOpts = {},
): Promise<AirtableRecord<F>[]> {
  const token = getToken();
  const out: AirtableRecord<F>[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`,
    );
    if (opts.fields) for (const f of opts.fields) url.searchParams.append("fields[]", f);
    if (opts.filterByFormula) url.searchParams.set("filterByFormula", opts.filterByFormula);
    if (opts.pageSize) url.searchParams.set("pageSize", String(opts.pageSize));
    if (opts.maxRecords) url.searchParams.set("maxRecords", String(opts.maxRecords));
    if (opts.view) url.searchParams.set("view", opts.view);
    if (opts.sort) {
      opts.sort.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        if (s.direction) url.searchParams.set(`sort[${i}][direction]`, s.direction);
      });
    }
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Airtable ${tableId} ${res.status}: ${body.slice(0, 300)}`);
    }
    const j = (await res.json()) as { records: AirtableRecord<F>[]; offset?: string };
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}
