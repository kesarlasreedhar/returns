import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ZodError, z } from "zod";
import { CatalogProduct, PackageItem, PackageSummary, PackageStatus } from "@/types/domain";

type CsvRow = Record<string, unknown>;
export type CsvUploadKind = "catalog" | "packages" | "package_items" | "unknown";
export type ReturnsWorkbookData = {
  catalog: CatalogProduct[];
  packages: PackageSummary[];
  packageItems: PackageItem[];
};

const headerAliases = {
  returnTrackingNumber: ["Return Tracking Number", "Return Tracking #", "Tracking Number", "Tracking #", "ReturnTrackingNumber"],
  carrier: ["Carrier"],
  barcode: ["Barcode (EAN/UPC)", "Barcode", "EAN", "UPC", "EAN/UPC"],
  artist: ["Artist"],
  title: ["Title"],
  qtyExpected: ["Qty Expected", "Quantity Expected", "Qty", "Quantity", "Expected Qty"],
  expectedCondition: ["Expected Condition", "Condition Expected"],
  customerReturnReason: ["Customer Return Reason", "Return Reason", "Reason"],
  refundAmountUsd: ["Refund Amount (USD)", "Refund Amount", "Refund USD", "Refund"],
  orderReference: ["Order Reference", "Order Ref", "Order Number"],
  returnRequestedDate: ["Return Requested Date", "Requested Date"],
  orderDate: ["Order Date"],

  distinctItems: ["Distinct Items", "Items Distinct"],
  totalUnits: ["Total Units", "Units"],
  totalRefundUsd: ["Total Refund (USD)", "Total Refund", "Refund Total", "Total Refund USD"],
  expectedConditions: ["Expected Conditions", "Expected Condition(s)"],
  orderReferences: ["Order Reference(s)", "Order References"],
  earliestReturnRequested: ["Earliest Return Requested", "Earliest Requested"],

  format: ["Format"],
  mediaType: ["Media Type", "Media"],
  imageUrl: ["Image URL", "Image", "Image Link"]
} as const;

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/[#$]/g, "");
}

function buildNormalizedRow(row: CsvRow): CsvRow {
  const result: CsvRow = {};
  for (const [key, value] of Object.entries(row)) {
    result[normalizeHeader(key)] = value;
  }
  return result;
}

function getField(row: CsvRow, aliases: readonly string[]): unknown {
  const normalized = buildNormalizedRow(row);
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (key in normalized) {
      return normalized[key];
    }
  }
  return undefined;
}

function hasHeader(headers: string[], aliases: readonly string[]): boolean {
  const normalizedHeaders = new Set(headers.map(normalizeHeader));
  return aliases.some((alias) => normalizedHeaders.has(normalizeHeader(alias)));
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = asString(value).replace(/[$,]/g, "");
  const num = Number(cleaned);
  return num;
}

function isBlankRow(row: CsvRow): boolean {
  return Object.values(row).every((value) => asString(value) === "");
}

function assertRequiredStrings(values: Array<{ key: string; value: string }>, rowNumber: number): void {
  const missing = values.filter((entry) => entry.value.trim().length === 0).map((entry) => entry.key);
  if (missing.length > 0) {
    throw new Error(`Row ${rowNumber}: missing required fields: ${missing.join(", ")}`);
  }
}

function getAllAliasHeaders(): string[] {
  return Object.values(headerAliases).flatMap((values) => [...values]);
}

function scoreHeaderRow(cells: unknown[]): number {
  const aliases = getAllAliasHeaders();
  const aliasSet = new Set(aliases.map((value) => normalizeHeader(value)));
  const seen = new Set<string>();
  let score = 0;

  for (const raw of cells) {
    const normalized = normalizeHeader(asString(raw));
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    if (aliasSet.has(normalized)) {
      score += 1;
    }
  }

  return score;
}

function buildRowsFromMatrix(matrix: unknown[][], headerRowIndex: number): Record<string, unknown>[] {
  const headerRow = matrix[headerRowIndex] || [];
  const rawHeaders = headerRow.map((value, index) => {
    const label = asString(value);
    return label || `__col_${index + 1}`;
  });

  const dedupedHeaders: string[] = [];
  const counts = new Map<string, number>();
  for (const header of rawHeaders) {
    const current = counts.get(header) || 0;
    counts.set(header, current + 1);
    dedupedHeaders.push(current === 0 ? header : `${header}_${current}`);
  }

  const rows: Record<string, unknown>[] = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const record: Record<string, unknown> = {};
    for (let colIndex = 0; colIndex < dedupedHeaders.length; colIndex += 1) {
      const key = dedupedHeaders[colIndex];
      record[key] = row[colIndex];
    }

    if (!isBlankRow(record)) {
      rows.push(record);
    }
  }

  return rows;
}

function rowsFromMatrix(matrix: unknown[][]): Record<string, unknown>[] {
  if (matrix.length === 0) {
    return [];
  }

  const probeRows = Math.min(matrix.length, 6);
  let bestHeaderIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < probeRows; index += 1) {
    const score = scoreHeaderRow(matrix[index] || []);
    if (score > bestScore) {
      bestScore = score;
      bestHeaderIndex = index;
    }
  }
  return buildRowsFromMatrix(matrix, bestHeaderIndex);
}

function formatZodRowError(error: ZodError, rowNumber: number): string {
  const fields = error.issues.map((issue) => String(issue.path[0] || "field"));
  const uniqueFields = Array.from(new Set(fields));
  return `Row ${rowNumber}: invalid values in ${uniqueFields.join(", ")}`;
}

function throwIfValidationErrors(errors: string[], headers: string[], kind: string): void {
  if (errors.length === 0) {
    return;
  }

  const lines = [
    `${kind} upload validation failed.`,
    `Detected headers: ${headers.join(" | ") || "(none)"}`,
    ...errors.slice(0, 20).map((msg) => `- ${msg}`)
  ];

  if (errors.length > 20) {
    lines.push(`- ...and ${errors.length - 20} more row errors`);
  }

  throw new Error(lines.join("\n"));
}

const packageItemSchema = z.object({
  "Return Tracking Number": z.string().min(1),
  Carrier: z.string().min(1),
  "Barcode (EAN/UPC)": z.string().min(1),
  Artist: z.string().optional().default(""),
  Title: z.string().optional().default(""),
  "Qty Expected": z.coerce.number().int().nonnegative(),
  "Expected Condition": z.string().min(1),
  "Customer Return Reason": z.string().optional().default(""),
  "Refund Amount (USD)": z.coerce.number().nonnegative(),
  "Order Reference": z.string().optional().default(""),
  "Return Requested Date": z.string().optional().default(""),
  "Order Date": z.string().optional().default("")
});

const packageSchema = z.object({
  "Return Tracking Number": z.string().min(1),
  Carrier: z.string().min(1),
  "Distinct Items": z.coerce.number().int().nonnegative(),
  "Total Units": z.coerce.number().int().nonnegative(),
  "Total Refund (USD)": z.coerce.number().nonnegative(),
  "Expected Conditions": z.string().optional().default(""),
  "Order Reference(s)": z.string().optional().default(""),
  "Earliest Return Requested": z.string().optional().default("")
});

const catalogSchema = z.object({
  "Barcode (EAN/UPC)": z.string().min(1),
  Artist: z.string().optional().default(""),
  Title: z.string().optional().default(""),
  Format: z.string().optional().default(""),
  "Media Type": z.string().optional().default(""),
  "Image URL": z.string().optional().default("")
});

export async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const result = Papa.parse<unknown[]>(text, {
    header: false,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim()
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message || "CSV parse error");
  }

  const matrix = result.data as unknown[][];
  if (matrix.length === 0) {
    return [];
  }

  return rowsFromMatrix(matrix);
}

function normalizeSheetName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export async function parseReturnsWorkbook(file: File): Promise<ReturnsWorkbookData> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const expectedSheets = ["catalog", "packages", "packageitems"];
  const actualSheets = workbook.SheetNames.map(normalizeSheetName);

  if (actualSheets.length < 3 || expectedSheets.some((name, index) => actualSheets[index] !== name)) {
    throw new Error(
      `Workbook upload stopped. Sheets must be ordered and named: Catalog, Packages, Package Items. Found: ${workbook.SheetNames.join(" | ") || "(none)"}`
    );
  }

  const sheets = workbook.SheetNames.slice(0, 3).map((name) => rowsFromMatrix(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false })));
  const [catalogRows, packageRows, packageItemRows] = sheets;
  if (!catalogRows.length || !packageRows.length || !packageItemRows.length) {
    throw new Error("Workbook upload stopped. Catalog, Packages, and Package Items must each contain a header row and at least one data row.");
  }

  const catalog = mapCatalog(catalogRows);
  const packages = mapPackages(packageRows);
  const packageItems = mapPackageItems(packageItemRows);
  const packageTracking = new Set(packages.map((row) => row.returnTrackingNumber.trim().toUpperCase()));
  const missingPackages = Array.from(new Set(packageItems.map((row) => row.returnTrackingNumber.trim().toUpperCase()).filter((tracking) => !packageTracking.has(tracking))));
  if (missingPackages.length > 0) {
    throw new Error(`Workbook upload stopped. Package Items contains tracking numbers missing from Packages:\n${missingPackages.slice(0, 20).map((tracking) => `- ${tracking}`).join("\n")}`);
  }

  const itemTracking = new Set(packageItems.map((row) => row.returnTrackingNumber.trim().toUpperCase()));
  const packagesWithoutItems = packages.map((row) => row.returnTrackingNumber).filter((tracking) => !itemTracking.has(tracking.trim().toUpperCase()));
  if (packagesWithoutItems.length > 0) {
    throw new Error(`Workbook upload stopped. These Packages have no matching Package Items:\n${packagesWithoutItems.slice(0, 20).map((tracking) => `- ${tracking}`).join("\n")}`);
  }

  const unitsByTracking = new Map<string, number>();
  for (const item of packageItems) {
    const key = item.returnTrackingNumber.trim().toUpperCase();
    unitsByTracking.set(key, (unitsByTracking.get(key) || 0) + item.qtyExpected);
  }
  const unitMismatches = packages.filter((pkg) => (unitsByTracking.get(pkg.returnTrackingNumber.trim().toUpperCase()) || 0) !== pkg.totalUnits);
  if (unitMismatches.length > 0) {
    throw new Error(
      `Workbook upload stopped. Package Total Units does not match the sum of Package Item Qty Expected:\n${unitMismatches
        .slice(0, 20)
        .map((pkg) => `- ${pkg.returnTrackingNumber}: Package Total Units ${pkg.totalUnits}, Package Items sum ${unitsByTracking.get(pkg.returnTrackingNumber.trim().toUpperCase()) || 0}`)
        .join("\n")}`
    );
  }

  return { catalog, packages, packageItems };
}

export function detectCsvUploadKind(rawRows: Record<string, unknown>[]): CsvUploadKind {
  const headers = Object.keys(rawRows[0] || {});
  const packageItemSignals = [
    headerAliases.qtyExpected,
    headerAliases.expectedCondition,
    headerAliases.customerReturnReason,
    headerAliases.refundAmountUsd,
    headerAliases.orderReference
  ].filter((aliases) => hasHeader(headers, aliases)).length;
  const packageSignals = [
    headerAliases.distinctItems,
    headerAliases.totalUnits,
    headerAliases.totalRefundUsd,
    headerAliases.expectedConditions,
    headerAliases.orderReferences,
    headerAliases.earliestReturnRequested
  ].filter((aliases) => hasHeader(headers, aliases)).length;

  if (hasHeader(headers, headerAliases.barcode) && packageItemSignals >= 2) {
    return "package_items";
  }
  if (packageSignals >= 2) {
    return "packages";
  }
  if (hasHeader(headers, headerAliases.barcode)) {
    return "catalog";
  }
  return "unknown";
}

export function assertCsvUploadKind(rawRows: Record<string, unknown>[], selectedKind: Exclude<CsvUploadKind, "unknown">): void {
  const detectedKind = detectCsvUploadKind(rawRows);
  if (detectedKind === selectedKind) {
    return;
  }

  const labels: Record<CsvUploadKind, string> = {
    catalog: "Catalog Upload",
    packages: "Package Upload",
    package_items: "Package Item Upload",
    unknown: "an unrecognized file type"
  };
  const headers = Object.keys(rawRows[0] || {});
  throw new Error(
    `Upload stopped: you selected ${labels[selectedKind]}, but this CSV appears to be ${labels[detectedKind]}. ` +
      `Choose ${detectedKind === "unknown" ? "the correct upload type" : labels[detectedKind]} and try again.\n` +
      `Detected headers: ${headers.join(" | ") || "(none)"}`
  );
}

export function mapPackageItems(rawRows: Record<string, unknown>[]): PackageItem[] {
  const mapped: PackageItem[] = [];
  const validationErrors: string[] = [];
  const detectedHeaders = Object.keys(rawRows[0] || {});
  const seenRowByKey = new Map<string, number>();

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    if (isBlankRow(row)) {
      continue;
    }

    const canonicalRow = {
      "Return Tracking Number": asString(getField(row, headerAliases.returnTrackingNumber)),
      Carrier: asString(getField(row, headerAliases.carrier)),
      "Barcode (EAN/UPC)": asString(getField(row, headerAliases.barcode)),
      Artist: asString(getField(row, headerAliases.artist)),
      Title: asString(getField(row, headerAliases.title)),
      "Qty Expected": asNumber(getField(row, headerAliases.qtyExpected)),
      "Expected Condition": asString(getField(row, headerAliases.expectedCondition)),
      "Customer Return Reason": asString(getField(row, headerAliases.customerReturnReason)),
      "Refund Amount (USD)": asNumber(getField(row, headerAliases.refundAmountUsd)),
      "Order Reference": asString(getField(row, headerAliases.orderReference)),
      "Return Requested Date": asString(getField(row, headerAliases.returnRequestedDate)),
      "Order Date": asString(getField(row, headerAliases.orderDate))
    };

    try {
      assertRequiredStrings(
        [
          { key: "Return Tracking Number", value: canonicalRow["Return Tracking Number"] },
          { key: "Carrier", value: canonicalRow.Carrier },
          { key: "Barcode (EAN/UPC)", value: canonicalRow["Barcode (EAN/UPC)"] },
          { key: "Expected Condition", value: canonicalRow["Expected Condition"] }
        ],
        index + 2
      );

      const parsed = packageItemSchema.parse(canonicalRow);

      const dedupeKey = [
        parsed["Return Tracking Number"].trim().toUpperCase(),
        parsed["Barcode (EAN/UPC)"].trim().toUpperCase(),
        (parsed["Order Reference"] || "").trim().toUpperCase()
      ].join("__");
      const firstRow = seenRowByKey.get(dedupeKey);
      if (firstRow !== undefined) {
        validationErrors.push(
          `Row ${index + 2}: duplicate Return Tracking Number + Barcode + Order Reference combination (first seen at row ${firstRow}). Add a distinct Order Reference or remove the duplicate row.`
        );
        continue;
      }
      seenRowByKey.set(dedupeKey, index + 2);

      mapped.push({
        returnTrackingNumber: parsed["Return Tracking Number"],
        carrier: parsed.Carrier,
        barcode: parsed["Barcode (EAN/UPC)"],
        artist: parsed.Artist || "",
        title: parsed.Title || "",
        qtyExpected: parsed["Qty Expected"],
        expectedCondition: parsed["Expected Condition"],
        customerReturnReason: parsed["Customer Return Reason"] || "",
        refundAmountUsd: parsed["Refund Amount (USD)"],
        orderReference: parsed["Order Reference"] || "",
        returnRequestedDate: parsed["Return Requested Date"] || "",
        orderDate: parsed["Order Date"] || ""
      });
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrors.push(formatZodRowError(error, index + 2));
      } else if (error instanceof Error) {
        validationErrors.push(error.message);
      } else {
        validationErrors.push(`Row ${index + 2}: invalid data`);
      }
    }
  }

  throwIfValidationErrors(validationErrors, detectedHeaders, "Package items");

  return mapped;
}

export function mapPackages(rawRows: Record<string, unknown>[]): PackageSummary[] {
  const mapped: PackageSummary[] = [];
  const validationErrors: string[] = [];
  const detectedHeaders = Object.keys(rawRows[0] || {});

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    if (isBlankRow(row)) {
      continue;
    }

    const canonicalRow = {
      "Return Tracking Number": asString(getField(row, headerAliases.returnTrackingNumber)),
      Carrier: asString(getField(row, headerAliases.carrier)),
      "Distinct Items": asNumber(getField(row, headerAliases.distinctItems)),
      "Total Units": asNumber(getField(row, headerAliases.totalUnits)),
      "Total Refund (USD)": asNumber(getField(row, headerAliases.totalRefundUsd)),
      "Expected Conditions": asString(getField(row, headerAliases.expectedConditions)),
      "Order Reference(s)": asString(getField(row, headerAliases.orderReferences)),
      "Earliest Return Requested": asString(getField(row, headerAliases.earliestReturnRequested))
    };

    try {
      assertRequiredStrings(
        [
          { key: "Return Tracking Number", value: canonicalRow["Return Tracking Number"] },
          { key: "Carrier", value: canonicalRow.Carrier }
        ],
        index + 2
      );

      const parsed = packageSchema.parse(canonicalRow);
      mapped.push({
        returnTrackingNumber: parsed["Return Tracking Number"],
        carrier: parsed.Carrier,
        distinctItems: parsed["Distinct Items"],
        totalUnits: parsed["Total Units"],
        totalRefundUsd: parsed["Total Refund (USD)"],
        expectedConditions: parsed["Expected Conditions"] || "",
        orderReferences: parsed["Order Reference(s)"] || "",
        earliestReturnRequested: parsed["Earliest Return Requested"] || "",
        status: "open" as PackageStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrors.push(formatZodRowError(error, index + 2));
      } else if (error instanceof Error) {
        validationErrors.push(error.message);
      } else {
        validationErrors.push(`Row ${index + 2}: invalid data`);
      }
    }
  }

  throwIfValidationErrors(validationErrors, detectedHeaders, "Packages");

  return mapped;
}

export function mapCatalog(rawRows: Record<string, unknown>[]): CatalogProduct[] {
  const mapped: CatalogProduct[] = [];
  const validationErrors: string[] = [];
  const detectedHeaders = Object.keys(rawRows[0] || {});

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    if (isBlankRow(row)) {
      continue;
    }

    const canonicalRow = {
      "Barcode (EAN/UPC)": asString(getField(row, headerAliases.barcode)),
      Artist: asString(getField(row, headerAliases.artist)),
      Title: asString(getField(row, headerAliases.title)),
      Format: asString(getField(row, headerAliases.format)),
      "Media Type": asString(getField(row, headerAliases.mediaType)),
      "Image URL": asString(getField(row, headerAliases.imageUrl))
    };

    try {
      assertRequiredStrings([{ key: "Barcode (EAN/UPC)", value: canonicalRow["Barcode (EAN/UPC)"] }], index + 2);

      const parsed = catalogSchema.parse(canonicalRow);
      mapped.push({
        barcode: parsed["Barcode (EAN/UPC)"],
        artist: parsed.Artist || "",
        title: parsed.Title || "",
        format: parsed.Format || "",
        mediaType: parsed["Media Type"] || "",
        imageUrl: parsed["Image URL"] || ""
      });
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrors.push(formatZodRowError(error, index + 2));
      } else if (error instanceof Error) {
        validationErrors.push(error.message);
      } else {
        validationErrors.push(`Row ${index + 2}: invalid data`);
      }
    }
  }

  throwIfValidationErrors(validationErrors, detectedHeaders, "Catalog");

  return mapped;
}
