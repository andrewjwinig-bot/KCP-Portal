import * as XLSX from "xlsx";

export type TopSheetTx = {
  date: string;
  cardMember: string;
  description: string;
  codedDescription: string;
  amount: number;
  originalAmount?: number;
  category: string;
  propertyId: string;
  propertyName: string;
  suite: string;
};

export type BuildTopSheetArgs = {
  statementPeriodText: string;
  statementMonth: string;
  tx: TopSheetTx[];
  propertyOrder: { id: string; name: string }[];
  categoryOrder: string[]; // preferred column order for the Summary sheet
};

export function buildTopSheetXlsx(args: BuildTopSheetArgs): Blob {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Charges ──────────────────────────────────────────────────────
  // All individual coded charges, sorted by date then property.

  const sortedTx = [...args.tx].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.propertyId.localeCompare(b.propertyId)
  );

  const chargesAoa: (string | number | null)[][] = [
    ["Date", "Card Member", "Description", "Invoice Description", "Category", "Property", "Property Name", "Suite", "Original Amount", "Amount"],
    ...sortedTx.map((t) => [
      t.date,
      t.cardMember,
      t.description,
      t.codedDescription,
      t.category,
      t.propertyId,
      t.propertyName,
      t.suite || "",
      t.originalAmount !== undefined ? t.originalAmount : t.amount,
      t.amount,
    ]),
  ];

  const chargesSheet = XLSX.utils.aoa_to_sheet(chargesAoa);
  chargesSheet["!cols"] = [
    { wch: 12 }, // Date
    { wch: 18 }, // Card Member
    { wch: 42 }, // Description
    { wch: 42 }, // Invoice Description
    { wch: 16 }, // Category
    { wch: 10 }, // Property
    { wch: 30 }, // Property Name
    { wch: 8  }, // Suite
    { wch: 15 }, // Original Amount
    { wch: 12 }, // Amount
  ];
  XLSX.utils.book_append_sheet(wb, chargesSheet, "Charges");

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  // Property × Category matrix with row totals.
  // Columns follow categoryOrder, then any extra categories found in the data.

  const allCatSet = new Set(args.tx.map((t) => t.category).filter(Boolean));
  const orderedCats = [
    ...args.categoryOrder.filter((c) => allCatSet.has(c)),
    ...[...allCatSet].filter((c) => !args.categoryOrder.includes(c)),
  ];

  // Build totals map
  const totalsByPropCat = new Map<string, Map<string, number>>();
  for (const t of args.tx) {
    if (!t.propertyId || !t.category) continue;
    const m = totalsByPropCat.get(t.propertyId) ?? new Map<string, number>();
    m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
    totalsByPropCat.set(t.propertyId, m);
  }

  const activeProps = args.propertyOrder.filter((p) => totalsByPropCat.has(p.id));

  const summaryHeader = ["Property", "Property Name", ...orderedCats, "TOTAL"];

  const summaryRows = activeProps.map((p) => {
    const m = totalsByPropCat.get(p.id)!;
    const catAmounts = orderedCats.map((c) => {
      const v = m.get(c) ?? 0;
      return v === 0 ? null : v;
    });
    const rowTotal = orderedCats.reduce((a, c) => a + (m.get(c) ?? 0), 0);
    return [p.id, p.name, ...catAmounts, rowTotal];
  });

  const catTotals = orderedCats.map((c) =>
    activeProps.reduce((a, p) => a + (totalsByPropCat.get(p.id)?.get(c) ?? 0), 0)
  );
  const grandTotal = catTotals.reduce((a, v) => a + v, 0);
  const totalsRow = ["TOTAL", "", ...catTotals.map((v) => (v === 0 ? null : v)), grandTotal];

  const summaryAoa = [summaryHeader, ...summaryRows, totalsRow];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  summarySheet["!cols"] = [
    { wch: 10 },
    { wch: 30 },
    ...orderedCats.map(() => ({ wch: 14 })),
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
