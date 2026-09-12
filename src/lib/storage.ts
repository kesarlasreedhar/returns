import {
  CatalogProduct,
  InspectionPhoto,
  PackageItem,
  PackageStatus,
  PackageSummary,
  ReboxingEvent,
  TimesheetEntry,
  OperationNote,
  UploadBatch
} from "@/types/domain";
import { ReturnsWorkbookData } from "@/lib/csv";

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errorMessage = "Request failed.";
    try {
      const text = await response.text();
      try {
        const payload = JSON.parse(text);
        if (payload && typeof payload.error === "string") {
          errorMessage = payload.error;
        }
      } catch {
        if (text && text.trim().length > 0) {
          errorMessage = text.trim();
        }
      }
    } catch {
      // fallback
    }
    throw new Error(errorMessage);
  }
}

export async function getPackages(): Promise<PackageSummary[]> {
  return getJson("/api/packages", []);
}

export async function getPackageItems(): Promise<PackageItem[]> {
  return getJson("/api/package-items", []);
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  return getJson("/api/catalog", []);
}

export async function getUploadBatches(): Promise<UploadBatch[]> {
  return getJson("/api/upload-batches", []);
}

export async function upsertCatalogRows(rows: CatalogProduct[], _uploadedBy: string, fileName: string): Promise<void> {
  await postJson("/api/catalog", { rows, fileName });
}

export async function importReturnsWorkbook(workbook: ReturnsWorkbookData, _uploadedBy: string, fileName: string): Promise<void> {
  await postJson("/api/uploads/workbook", {
    catalog: workbook.catalog,
    packages: workbook.packages,
    packageItems: workbook.packageItems,
    fileName
  });
}

export async function updatePackageStatus(returnTrackingNumber: string, nextStatus: PackageStatus): Promise<void> {
  await postJson("/api/packages/status", { action: "set", returnTrackingNumber, status: nextStatus });
}

export async function markPackageScanned(returnTrackingNumber: string): Promise<void> {
  await postJson("/api/packages/status", { action: "scan", returnTrackingNumber });
}

export async function evaluatePackageRefundStatus(returnTrackingNumber: string): Promise<PackageStatus> {
  const response = await fetch("/api/packages/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "evaluate", returnTrackingNumber })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error((payload && payload.error) || "Failed to evaluate refund status.");
  }

  const payload = (await response.json()) as { status: PackageStatus };
  return payload.status;
}

export async function updateItemCondition(packageItemId: string, actualCondition: string): Promise<void> {
  await postJson("/api/package-items/condition", { packageItemId, actualCondition });
}

export async function saveInspectionPhoto(packageItemId: string, filePath: string, _uploadedBy: string): Promise<void> {
  await postJson("/api/inspection-photos", { packageItemId, filePath });
}

export async function getInspectionPhotos(): Promise<InspectionPhoto[]> {
  return getJson("/api/inspection-photos", []);
}

export async function saveReboxingEvent(
  returnTrackingNumber: string,
  outboundBoxBarcode: string,
  outboundShippingBarcode: string,
  _processedBy: string
): Promise<void> {
  await postJson("/api/reboxing-events", { returnTrackingNumber, outboundBoxBarcode, outboundShippingBarcode });
}

export async function getReboxingEvents(): Promise<ReboxingEvent[]> {
  return getJson("/api/reboxing-events", []);
}

export async function saveTimesheetEntry(processorName: string, workDate: string, hoursWorked: number, notes: string): Promise<void> {
  await postJson("/api/timesheet-entries", { processorName, workDate, hoursWorked, notes });
}

export async function getTimesheetEntries(): Promise<TimesheetEntry[]> {
  return getJson("/api/timesheet-entries", []);
}

export async function saveOperationNote(note: string, _createdBy: string): Promise<void> {
  await postJson("/api/operation-notes", { note });
}

export async function getOperationNotes(): Promise<OperationNote[]> {
  return getJson("/api/operation-notes", []);
}
