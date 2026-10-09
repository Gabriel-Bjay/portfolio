// Turns an uploaded CSV / Excel file into a RawTable (header names + string cells).
// Everything runs in the browser; nothing here talks to a server.
import Papa from "papaparse";
import type { RawTable } from "./types";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 200_000;

/** An error whose message is safe and useful to show to the end user as is. */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyError";
  }
}

// ─────────────────────────── decoding ───────────────────────────

/** Decodes file bytes as UTF-8/UTF-16 (honouring a BOM), falling back to Windows-1252 for old Excel exports. */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ─────────────────────────── table shaping ───────────────────────────

const NUMBER_LIKE = /^[\s\d.,\-+()%$€£]*$/;

/**
 * Exports often start with a few title lines (a shop name, "Statement period…") before the
 * real header. The header is the first row that is mostly filled in and has no numeric cells.
 */
function findHeaderRow(rows: string[][]): number {
  const scan = rows.slice(0, 15);
  const filled = scan.map((r) => r.filter((c) => c !== "").length);
  const widest = Math.max(...filled);
  if (widest < 2) return 0;
  for (let i = 0; i < scan.length; i++) {
    if (filled[i] < Math.ceil(widest * 0.6)) continue;
    const cells = scan[i].filter((c) => c !== "");
    if (cells.every((c) => !NUMBER_LIKE.test(c))) return i;
  }
  return 0;
}

/** Normalises ragged rows into a RawTable. Throws FriendlyError when there is nothing usable. */
export function toRawTable(input: readonly (readonly string[])[]): RawTable {
  const rows = input.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0)
    throw new FriendlyError("That file looks empty. Choose a file with a header row and some sales rows.");

  const headerAt = findHeaderRow(rows);
  const headerRow = rows[headerAt];
  const body = rows.slice(headerAt + 1);
  if (body.length === 0) throw new FriendlyError("That file has a header row but no sales rows below it.");
  if (body.length > MAX_ROWS) {
    throw new FriendlyError(
      `That file has ${body.length.toLocaleString("en-KE")} rows. The limit is ${MAX_ROWS.toLocaleString("en-KE")}. Try a shorter date range.`,
    );
  }

  // A loop, not Math.max(...spread): 200k arguments would overflow the call stack.
  let width = headerRow.length;
  for (const r of body) if (r.length > width) width = r.length;
  const headers = Array.from({ length: width }, (_, i) => headerRow[i] ?? "");
  const padded = body.map((r) => (r.length === width ? [...r] : Array.from({ length: width }, (_, i) => r[i] ?? "")));
  return { headers, rows: padded };
}

// ─────────────────────────── CSV ───────────────────────────

/** Parses CSV text (comma, semicolon, tab or pipe delimited; quoted fields; BOM; blank lines). */
export function parseCsvText(text: string): RawTable {
  const clean = text.replace(/^\uFEFF/, "");
  const result = Papa.parse<string[]>(clean, {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  // FieldMismatch (ragged rows) is normal for hand-kept sheets and handled by toRawTable;
  // only a failure to read quotes means the file is genuinely malformed.
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal && result.data.length === 0) {
    throw new FriendlyError("We could not read that CSV: a quoted value is not closed.");
  }
  return toRawTable(result.data);
}

// ─────────────────────────── Excel ───────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Converts one cell from read-excel-file to text. Dates become ISO strings, keeping a time only if present. */
export function xlsxCellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return "";
    const date = `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
    const hasTime = cell.getUTCHours() + cell.getUTCMinutes() + cell.getUTCSeconds() !== 0;
    return hasTime ? `${date}T${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}` : date;
  }
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  return String(cell);
}

/** Shapes the rows of the first Excel sheet (as returned by read-excel-file) into a RawTable. */
export function xlsxRowsToTable(rows: readonly (readonly unknown[])[]): RawTable {
  return toRawTable(rows.map((r) => r.map(xlsxCellToString)));
}

async function parseXlsxFile(file: File): Promise<RawTable> {
  // Loaded on demand: most visitors use CSV and should not download the Excel reader.
  const { readSheet, InvalidInputError, InvalidSpreadsheetError } = await import("read-excel-file/browser");
  try {
    return xlsxRowsToTable(await readSheet(file));
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof InvalidSpreadsheetError) {
      throw new FriendlyError("We could not open that Excel file. Save it as .xlsx (or CSV) and try again.");
    }
    throw error;
  }
}

// ─────────────────────────── entry point ───────────────────────────

export type FileKind = "csv" | "xlsx";

export function fileKindFor(name: string): FileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) {
    throw new FriendlyError(
      "Old .xls files are not supported. In Excel choose Save As → .xlsx (or CSV) and try again.",
    );
  }
  if (/\.(csv|tsv|txt)$/.test(lower)) return "csv";
  throw new FriendlyError("Please choose a .csv or .xlsx file.");
}

/** Reads a user-selected file. The yield callback lets the UI repaint between the slow steps. */
export async function parseFile(file: File, onStage?: (label: string) => Promise<void> | void): Promise<RawTable> {
  const kind = fileKindFor(file.name);
  if (file.size === 0) throw new FriendlyError("That file is empty.");
  if (file.size > MAX_FILE_BYTES) {
    throw new FriendlyError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB. Try exporting a shorter date range.`,
    );
  }
  await onStage?.("Reading your file");
  if (kind === "xlsx") return parseXlsxFile(file);
  const text = decodeText(await file.arrayBuffer());
  await onStage?.("Parsing rows");
  return parseCsvText(text);
}
