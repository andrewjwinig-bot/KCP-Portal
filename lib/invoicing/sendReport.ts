// Client helper: email an invoicer's GL import + summary report to the
// controller when a run is processed. Best-effort — never blocks the download.
// Pairs with app/api/invoicer-report/route.ts.

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function emailInvoicerReport(args: {
  source: "credit-card" | "allocated";
  /** Period key — also dedupes resends (one email per period). */
  period: string;
  attachments: { name: string; blob: Blob; contentType: string }[];
}): Promise<void> {
  try {
    if (!args.period || !args.attachments.length) return;
    const attachments = await Promise.all(
      args.attachments.map(async (a) => ({
        name: a.name,
        contentType: a.contentType,
        contentBase64: await blobToBase64(a.blob),
      })),
    );
    await fetch("/api/invoicer-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: args.source, period: args.period, attachments }),
    });
  } catch {
    // best-effort: a failed report email must never break invoice generation
  }
}
