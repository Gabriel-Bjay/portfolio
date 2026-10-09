import { readSheet } from "read-excel-file/node";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeText,
  FriendlyError,
  fileKindFor,
  MAX_ROWS,
  parseCsvText,
  toRawTable,
  xlsxCellToString,
  xlsxRowsToTable,
} from "./parse";

describe("parseCsvText", () => {
  it("parses a plain comma CSV", () => {
    const t = parseCsvText("Date,Amount\n2025-01-01,100\n2025-01-02,250\n");
    expect(t.headers).toEqual(["Date", "Amount"]);
    expect(t.rows).toEqual([
      ["2025-01-01", "100"],
      ["2025-01-02", "250"],
    ]);
  });

  it("strips a byte order mark and handles semicolon delimiters", () => {
    const t = parseCsvText("\uFEFFTarehe;Kiasi\n01/02/2025;1 200\n03/02/2025;900\n");
    expect(t.headers).toEqual(["Tarehe", "Kiasi"]);
    expect(t.rows[0]).toEqual(["01/02/2025", "1 200"]);
  });

  it("handles tab-delimited text", () => {
    const t = parseCsvText("Date\tAmount\n2025-01-01\t5\n");
    expect(t.headers).toEqual(["Date", "Amount"]);
  });

  it("keeps quoted delimiters, doubled quotes and embedded newlines inside one cell", () => {
    const t = parseCsvText('Product,Amount\n"Case, red",100\n"Say ""hi""",200\n"Two\nlines",300\n');
    expect(t.rows).toEqual([
      ["Case, red", "100"],
      ['Say "hi"', "200"],
      ["Two\nlines", "300"],
    ]);
  });

  it("skips blank and whitespace-only lines and handles CRLF", () => {
    const t = parseCsvText("Date,Amount\r\n\r\n2025-01-01,1\r\n   ,  \r\n\r\n2025-01-02,2\r\n");
    expect(t.rows).toEqual([
      ["2025-01-01", "1"],
      ["2025-01-02", "2"],
    ]);
  });

  it("pads short rows and widens for long rows instead of dropping data", () => {
    const t = parseCsvText("A,B,C\n1,2\n1,2,3,4\n");
    expect(t.headers).toEqual(["A", "B", "C", ""]);
    expect(t.rows).toEqual([
      ["1", "2", "", ""],
      ["1", "2", "3", "4"],
    ]);
  });

  it("finds the header below a few title lines (bank / M-Pesa style exports)", () => {
    const t = parseCsvText(
      "Statement for Duka Digital\nPeriod: 01 Jan 2025 - 31 Jan 2025\n\nDate,Details,Amount\n2025-01-01,Sale,100\n",
    );
    expect(t.headers).toEqual(["Date", "Details", "Amount"]);
    expect(t.rows).toEqual([["2025-01-01", "Sale", "100"]]);
  });

  it("preserves unicode text", () => {
    const t = parseCsvText("Bidhaa,Kiasi\nKahawa ya Kenya ☕,1200\nCafé crème,300\n");
    expect(t.rows[0][0]).toBe("Kahawa ya Kenya ☕");
    expect(t.rows[1][0]).toBe("Café crème");
  });

  it("trims whitespace around cells and headers", () => {
    const t = parseCsvText(" Date , Amount \n 2025-01-01 , 5 \n");
    expect(t.headers).toEqual(["Date", "Amount"]);
    expect(t.rows[0]).toEqual(["2025-01-01", "5"]);
  });

  it("explains empty files and header-only files", () => {
    expect(() => parseCsvText("")).toThrow(FriendlyError);
    expect(() => parseCsvText("\n\n  \n")).toThrow(/empty/);
    expect(() => parseCsvText("Date,Amount\n")).toThrow(/no sales rows/);
  });

  it("rejects files over the row limit with a friendly message", () => {
    const lines = ["Date,Amount"];
    for (let i = 0; i <= MAX_ROWS; i++) lines.push("2025-01-01,1");
    expect(() => parseCsvText(lines.join("\n"))).toThrow(/200,000/);
  });

  it("accepts exactly the row limit", () => {
    const lines = ["Date,Amount"];
    for (let i = 0; i < MAX_ROWS; i++) lines.push("2025-01-01,1");
    expect(parseCsvText(lines.join("\n")).rows).toHaveLength(MAX_ROWS);
  });
});

describe("toRawTable", () => {
  it("treats the first row as the header when every row has numbers", () => {
    const t = toRawTable([
      ["Date", "Amount"],
      ["2025-01-01", "10"],
    ]);
    expect(t.headers).toEqual(["Date", "Amount"]);
  });
});

describe("decodeText", () => {
  const bytes = (...n: number[]) => new Uint8Array(n).buffer;

  it("decodes UTF-8, with or without a BOM", () => {
    expect(decodeText(new TextEncoder().encode("Café").buffer as ArrayBuffer)).toBe("Café");
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x41))).toBe("A");
  });

  it("decodes UTF-16 with a BOM (Excel 'Unicode text')", () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x41, 0x00, 0x42, 0x00))).toBe("AB");
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x41, 0x00, 0x42))).toBe("AB");
  });

  it("falls back to Windows-1252 for legacy Excel CSVs", () => {
    // 0xE9 is "é" in Windows-1252 but an invalid UTF-8 sequence on its own.
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xe9))).toBe("Café");
  });
});

describe("Excel conversion", () => {
  it("converts cell values to text", () => {
    expect(xlsxCellToString(null)).toBe("");
    expect(xlsxCellToString(undefined)).toBe("");
    expect(xlsxCellToString(1200.5)).toBe("1200.5");
    expect(xlsxCellToString(Number.NaN)).toBe("");
    expect(xlsxCellToString(true)).toBe("TRUE");
    expect(xlsxCellToString("  Phone ")).toBe("  Phone ");
    expect(xlsxCellToString(new Date(Date.UTC(2025, 10, 24)))).toBe("2025-11-24");
    expect(xlsxCellToString(new Date(Date.UTC(2025, 10, 24, 14, 5)))).toBe("2025-11-24T14:05");
    expect(xlsxCellToString(new Date("nope"))).toBe("");
  });

  it("builds a table from sheet rows with dates, numbers and gaps", () => {
    const t = xlsxRowsToTable([
      ["Date", "Product", "Amount"],
      [new Date(Date.UTC(2025, 0, 5)), "Case", 600],
      [new Date(Date.UTC(2025, 0, 6)), null, 1250.5],
      [null, null, null],
    ]);
    expect(t.headers).toEqual(["Date", "Product", "Amount"]);
    expect(t.rows).toEqual([
      ["2025-01-05", "Case", "600"],
      ["2025-01-06", "", "1250.5"],
    ]);
  });
});

describe("Excel conversion with the real library", () => {
  it("turns a real .xlsx (e2e fixture) into a table, dates included", async () => {
    const rows = await readSheet(join(__dirname, "../../../e2e/fixtures/sales-small.xlsx"));
    const t = xlsxRowsToTable(rows);
    expect(t.headers).toEqual(["Date", "Product", "Quantity", "Amount"]);
    expect(t.rows).toHaveLength(8);
    expect(t.rows[0]).toEqual(["2025-03-03", "Phone case", "2", "1200"]);
    expect(t.rows.reduce((sum, r) => sum + Number(r[3]), 0)).toBe(45_000);
  });
});

describe("fileKindFor", () => {
  it("routes by extension, case-insensitively", () => {
    expect(fileKindFor("Sales.CSV")).toBe("csv");
    expect(fileKindFor("export.tsv")).toBe("csv");
    expect(fileKindFor("sales.xlsx")).toBe("xlsx");
  });

  it("gives friendly errors for .xls and unknown types", () => {
    expect(() => fileKindFor("old.xls")).toThrow(/\.xlsx/);
    expect(() => fileKindFor("photo.png")).toThrow(/\.csv or \.xlsx/);
  });
});
