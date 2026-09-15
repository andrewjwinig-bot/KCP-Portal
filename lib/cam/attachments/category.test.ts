import { describe, it, expect } from "vitest";
import { backupCategory, safeSegment } from "./category";

describe("CAM backup categorization", () => {
  it("buckets RET accounts (6410*) as Real Estate Taxes", () => {
    expect(backupCategory("6410-8501", "Real Estate Taxes")).toBe("Real Estate Taxes");
    expect(backupCategory("6410-0000", "")).toBe("Real Estate Taxes");
  });
  it("buckets insurance-labelled lines as Insurance", () => {
    expect(backupCategory("6300-8501", "Liability Insurance")).toBe("Insurance");
    expect(backupCategory("6305-8501", "Property Insurance")).toBe("Insurance");
  });
  it("everything else is Operating Expenses", () => {
    expect(backupCategory("6220-8501", "Landscaping")).toBe("Operating Expenses");
    expect(backupCategory("6120-8501", "Electric (Common)")).toBe("Operating Expenses");
  });
  it("safeSegment strips path-hostile characters", () => {
    expect(safeSegment("Water / Sewer")).toBe("Water - Sewer");
    expect(safeSegment("")).toBe("Unfiled");
  });
});
