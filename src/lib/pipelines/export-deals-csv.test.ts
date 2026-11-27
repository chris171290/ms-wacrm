import { describe, expect, it } from "vitest";
import { csvCell } from "./export-deals-csv";

describe("csvCell", () => {
  it("quotes commas in text and decimal numbers to keep them in one column", () => {
    expect(csvCell("MORA TUMBAC, KEILA NINIVE")).toBe(
      '"MORA TUMBAC, KEILA NINIVE"',
    );
    expect(csvCell(16.5)).toBe('"16,5"');
  });
});
