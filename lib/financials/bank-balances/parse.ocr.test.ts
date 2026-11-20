import { describe, it, expect } from "vitest";
import { normalizeOcrText, parseBankBalances } from "./parse";

// OCR text — an "Adobe PDF" printout read off its page images in the browser.
// SYNTHETIC: the shapes tesseract produces from the real pages (chevrons,
// trailing "⋯" debris, a wrapped name's figures above its account number,
// Liberty's labels AFTER their figures) with made-up accounts and figures, and
// the misreads OCR makes ("S" / "§" for "$", "." for ",", "X" for "x", "l" / "O"
// in an account number). The real exports carry bank data — never commit them.

const CHASE_OCR = `CHASE © ror BUSINESS'
Printed from Chase for Business
Bank accounts Total available balance $3,333,444.40
Available Present balance Account type
Account balance C ¢ °C
1111 Sample OP (...1111) > $1,000,000.00 $1,000,100.00 Checking IT
TEST HK Co (..2222) > S2.000.000,00 $2,000,000.00 Checking nen
4444 Other OP (...44l4) > §333,444.40 $333,444.40 Checking nee

5555 KH LONG $0.00 $12.34 Checking nes

NAME (...5O55) >
Pending approvals (0)`;

const LIBERTY_OCR = `Liberty Bank will be closed on Thursday
Total Balances
Deposits $1,111,000.15
Total Current Balance
Account Summary
Edit Accounts View
SD Account - Sample $1,000,000.00
X1212 Available Balance
$1,000,000.10
Current Balance
Second Account $111,000.00
x3434 Available Balance

$111,000.05

Current Balance
Quick Links`;

describe("OCR text (Adobe PDF printouts, read by OCR in the browser)", () => {
  it("Chase: tolerates chevrons, $ misread as S / §, swapped separators, wrapped names, look-alike digits", () => {
    const r = parseBankBalances(CHASE_OCR, { ocr: true })!;
    expect(r.bank).toBe("JPM-Chase");
    expect(r.accounts.map((a) => [a.last4, a.balance, a.available])).toEqual([
      ["x1111", 1000100, 1000000], ["x2222", 2000000, 2000000], ["x4414", 333444.4, 333444.4], ["x5055", 12.34, 0],
    ]);
    expect(r.accounts[3].name).toBe("5555 KH LONG NAME");
    // The accounts' AVAILABLE figures add up to the total Chase printed.
    expect(r.totalCheck).toMatchObject({ ties: true, printed: 3333444.4 });
  });

  it("Liberty: the figure BEFORE the account number is available, the one after it is current", () => {
    const r = parseBankBalances(LIBERTY_OCR, { ocr: true })!;
    expect(r.bank).toBe("Liberty Bank");
    expect(r.accounts.map((a) => [a.last4, a.balance, a.available, a.name])).toEqual([
      ["x1212", 1000000.1, 1000000, "SD Account - Sample"],
      ["x3434", 111000.05, 111000, "Second Account"],
    ]);
    expect(r.totalCheck).toMatchObject({ ties: true, printed: 1111000.15 });
  });

  it("a misread digit breaks the tie to the printed total", () => {
    const r = parseBankBalances(LIBERTY_OCR.replace("$111,000.05", "$111,000.85"), { ocr: true })!;
    expect(r.totalCheck?.ties).toBe(false);
  });

  it("normalizes figures and account numbers, and leaves bare digit runs alone", () => {
    expect(normalizeOcrText("Total S1.234.567,89 and §12,00")).toBe("Total $1,234,567.89 and $12.00");
    expect(normalizeOcrText("PARTNERS 1,000.00")).toBe("PARTNERS 1,000.00");
    expect(normalizeOcrText("10/09/2026 OFFICE 9857593777 51.806,56")).toBe("10/09/2026 OFFICE 9857593777 51,806.56");
    expect(normalizeOcrText("Name (…12O4) › $1.00")).toBe("Name (...1204) $1.00");
  });

  it("a real-text export is read as strictly as before — OCR tolerance is opt-in", () => {
    const strict = parseBankBalances(CHASE_OCR)!;
    expect(strict.accounts.map((a) => a.last4)).toEqual([]);
    expect(strict.totalCheck).toBeUndefined();
  });
});
