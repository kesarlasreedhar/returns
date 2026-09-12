import { supabaseAdmin } from "@/lib/supabase-admin";
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

async function resolveUserId(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_users").select("id").eq("email", email).maybeSingle();
  return data?.id || null;
}

export async function getPackages(): Promise<PackageSummary[]> {
  const { data, error } = await supabaseAdmin.from("packages").select("*").order("created_at", { ascending: false });
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    returnTrackingNumber: row.return_tracking_number,
    carrier: row.carrier,
    distinctItems: row.distinct_items,
    totalUnits: row.total_units,
    totalRefundUsd: parseFloat(row.total_refund_usd),
    expectedConditions: row.expected_conditions || "",
    orderReferences: row.order_references || "",
    earliestReturnRequested: row.earliest_return_requested || "",
    status: row.status as PackageStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getPackageItems(): Promise<PackageItem[]> {
  const { data, error } = await supabaseAdmin
    .from("package_items")
    .select("*, packages(return_tracking_number, carrier)")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    packageId: row.package_id,
    returnTrackingNumber: (row.packages as any)?.return_tracking_number || "",
    carrier: (row.packages as any)?.carrier || "",
    barcode: row.barcode,
    artist: row.artist || "",
    title: row.title || "",
    qtyExpected: row.qty_expected,
    expectedCondition: row.expected_condition || "",
    customerReturnReason: row.customer_return_reason || "",
    refundAmountUsd: parseFloat(row.refund_amount_usd),
    orderReference: row.order_reference || "",
    returnRequestedDate: row.return_requested_date || "",
    orderDate: row.order_date || "",
    actualCondition: row.actual_condition || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await supabaseAdmin.from("catalog_products").select("*").order("created_at", { ascending: false });
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    barcode: row.barcode,
    artist: row.artist || "",
    title: row.title || "",
    format: row.format || "",
    mediaType: row.media_type || "",
    imageUrl: row.image_url || ""
  }));
}

export async function getUploadBatches(): Promise<UploadBatch[]> {
  const { data, error } = await supabaseAdmin
    .from("upload_batches")
    .select("*, app_users(email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    kind: row.kind as UploadBatch["kind"],
    fileName: row.file_name,
    uploadedBy: (row.app_users as any)?.email || "unknown",
    uploadedAt: row.created_at,
    rowCount: row.row_count
  }));
}

export async function upsertCatalogRows(rows: CatalogProduct[], uploadedBy: string, fileName: string): Promise<void> {
  const catalogRows = rows.map((row) => ({
    barcode: row.barcode,
    artist: row.artist,
    title: row.title,
    format: row.format,
    media_type: row.mediaType,
    image_url: row.imageUrl
  }));

  if (catalogRows.length > 0) {
    const { error } = await supabaseAdmin.from("catalog_products").upsert(catalogRows, { onConflict: "barcode" });
    if (error) {
      throw error;
    }
  }

  const userId = await resolveUserId(uploadedBy);
  const { error: batchError } = await supabaseAdmin.from("upload_batches").insert({
    kind: "catalog",
    file_name: fileName,
    row_count: rows.length,
    uploaded_by: userId
  });

  if (batchError) {
    throw batchError;
  }
}

export async function importReturnsWorkbook(
  catalog: CatalogProduct[],
  packages: PackageSummary[],
  packageItems: PackageItem[],
  uploadedBy: string,
  fileName: string
): Promise<void> {
  const userId = await resolveUserId(uploadedBy);

  const catalogPayload = catalog.map((row) => ({
    barcode: row.barcode,
    artist: row.artist,
    title: row.title,
    format: row.format,
    media_type: row.mediaType,
    image_url: row.imageUrl
  }));

  const packagesPayload = packages.map((row) => ({
    return_tracking_number: row.returnTrackingNumber.trim(),
    carrier: row.carrier,
    distinct_items: row.distinctItems,
    total_units: row.totalUnits,
    total_refund_usd: row.totalRefundUsd,
    expected_conditions: row.expectedConditions,
    order_references: row.orderReferences,
    earliest_return_requested: row.earliestReturnRequested || null,
    status: row.status
  }));

  const packageItemsPayload = packageItems.map((row) => ({
    return_tracking_number: row.returnTrackingNumber.trim(),
    barcode: row.barcode.trim(),
    artist: row.artist,
    title: row.title,
    qty_expected: row.qtyExpected,
    expected_condition: row.expectedCondition,
    customer_return_reason: row.customerReturnReason,
    refund_amount_usd: row.refundAmountUsd,
    order_reference: row.orderReference.trim(),
    return_requested_date: row.returnRequestedDate || null,
    order_date: row.orderDate || null
  }));

  const { error } = await supabaseAdmin.rpc("import_returns_workbook", {
    p_catalog: catalogPayload,
    p_packages: packagesPayload,
    p_package_items: packageItemsPayload,
    p_uploaded_by: userId,
    p_file_name: fileName
  });

  if (error) {
    throw error;
  }
}

export async function updatePackageStatus(returnTrackingNumber: string, nextStatus: PackageStatus, changedBy: string | null): Promise<void> {
  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from("packages")
    .select("id, status")
    .eq("return_tracking_number", returnTrackingNumber)
    .single();

  if (pkgError || !pkg) {
    throw pkgError || new Error("Package not found.");
  }

  if (pkg.status === nextStatus) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("packages")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("return_tracking_number", returnTrackingNumber);
  if (error) {
    throw error;
  }

  const { error: historyError } = await supabaseAdmin.from("package_status_history").insert({
    package_id: pkg.id,
    from_status: pkg.status,
    to_status: nextStatus,
    changed_by: changedBy
  });
  if (historyError) {
    throw historyError;
  }
}

export async function markPackageScanned(returnTrackingNumber: string, changedBy: string | null): Promise<void> {
  const { data, error } = await supabaseAdmin.from("packages").select("status").eq("return_tracking_number", returnTrackingNumber).single();
  if (error) {
    throw error;
  }
  if (data?.status === "open") {
    await updatePackageStatus(returnTrackingNumber, "scanned", changedBy);
  }
}

export async function evaluatePackageRefundStatus(returnTrackingNumber: string, changedBy: string | null): Promise<PackageStatus> {
  const { data: pkg, error: packageError } = await supabaseAdmin
    .from("packages")
    .select("id, total_units")
    .eq("return_tracking_number", returnTrackingNumber)
    .single();
  if (packageError || !pkg) {
    throw new Error("Package not found.");
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("package_items")
    .select("qty_expected, expected_condition, actual_condition")
    .eq("package_id", pkg.id);
  if (itemsError) {
    throw itemsError;
  }

  const expectedUnits = (items || []).reduce((total, item) => total + Number(item.qty_expected || 0), 0);
  const allItemsInspected = (items || []).length > 0 && (items || []).every((item) => Boolean(item.actual_condition));
  const hasMismatch = (items || []).some((item) => item.actual_condition !== item.expected_condition);
  const status: PackageStatus = !allItemsInspected
    ? "scanned"
    : expectedUnits === Number(pkg.total_units) && !hasMismatch
      ? "ready_for_refund"
      : "review_for_refund";

  await updatePackageStatus(returnTrackingNumber, status, changedBy);
  return status;
}

export async function updateItemCondition(packageItemId: string, actualCondition: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("package_items")
    .update({
      actual_condition: actualCondition,
      updated_at: new Date().toISOString()
    })
    .eq("id", packageItemId);
  if (error) {
    throw error;
  }
}

export async function saveInspectionPhoto(packageItemId: string, filePath: string, uploadedBy: string): Promise<void> {
  const userId = await resolveUserId(uploadedBy);
  const { error } = await supabaseAdmin.from("inspection_photos").insert({
    package_item_id: packageItemId,
    file_path: filePath,
    uploaded_by: userId
  });

  if (error) {
    throw new Error(error.message || "Unable to save inspection photo");
  }
}

export async function getInspectionPhotos(): Promise<InspectionPhoto[]> {
  const { data, error } = await supabaseAdmin.from("inspection_photos").select("*").order("created_at", { ascending: false });
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    packageItemId: row.package_item_id,
    filePath: row.file_path,
    uploadedBy: "unknown",
    createdAt: row.created_at
  }));
}

export async function saveReboxingEvent(
  returnTrackingNumber: string,
  outboundBoxBarcode: string,
  outboundShippingBarcode: string,
  processedBy: string
): Promise<void> {
  const tracking = returnTrackingNumber.trim();
  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from("packages")
    .select("id, status")
    .eq("return_tracking_number", tracking)
    .single();

  if (pkgError || !pkg) {
    throw new Error("Package not found for reboxing.");
  }

  if (pkg.status !== "closed") {
    throw new Error("Package must be closed before reboxing.");
  }

  const userId = await resolveUserId(processedBy);
  const { error } = await supabaseAdmin.from("reboxing_events").insert({
    package_id: pkg.id,
    outbound_box_barcode: outboundBoxBarcode,
    outbound_shipping_barcode: outboundShippingBarcode,
    processed_by: userId
  });

  if (error) {
    throw new Error(error.message || "Unable to save reboxing event");
  }
}

export async function getReboxingEvents(): Promise<ReboxingEvent[]> {
  const { data, error } = await supabaseAdmin
    .from("reboxing_events")
    .select("id, outbound_box_barcode, outbound_shipping_barcode, created_at, package_id, packages(return_tracking_number)")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    packageId: row.package_id,
    returnTrackingNumber: (row.packages as any)?.return_tracking_number || "",
    outboundBoxBarcode: row.outbound_box_barcode,
    outboundShippingBarcode: row.outbound_shipping_barcode,
    processedBy: "unknown",
    createdAt: row.created_at
  }));
}

export async function saveTimesheetEntry(processorName: string, workDate: string, hoursWorked: number, notes: string): Promise<void> {
  const { error } = await supabaseAdmin.from("timesheet_entries").insert({
    processor_name: processorName,
    work_date: workDate,
    hours_worked: hoursWorked,
    notes
  });

  if (error) {
    throw new Error(error.message || "Unable to save timesheet entry");
  }
}

export async function getTimesheetEntries(): Promise<TimesheetEntry[]> {
  const { data, error } = await supabaseAdmin.from("timesheet_entries").select("*").order("created_at", { ascending: false }).limit(200);
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    processorName: row.processor_name,
    workDate: row.work_date,
    hoursWorked: Number(row.hours_worked),
    notes: row.notes || "",
    createdAt: row.created_at
  }));
}

export async function saveOperationNote(note: string, createdBy: string): Promise<void> {
  const trimmedNote = note.trim();
  if (!trimmedNote) {
    throw new Error("Enter a note before saving.");
  }

  const userId = await resolveUserId(createdBy);
  const { error } = await supabaseAdmin.from("operation_notes").insert({
    note: trimmedNote,
    created_by: userId
  });

  if (error) {
    throw new Error(error.message || "Unable to save note");
  }
}

export async function getOperationNotes(): Promise<OperationNote[]> {
  const { data, error } = await supabaseAdmin
    .from("operation_notes")
    .select("id, note, created_at, app_users(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    note: row.note,
    createdBy: (row.app_users as any)?.full_name || (row.app_users as any)?.email || "Unknown",
    createdAt: row.created_at
  }));
}
