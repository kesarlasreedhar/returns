import { supabase } from "@/lib/supabase";
import {
  CatalogProduct,
  InspectionPhoto,
  PackageItem,
  PackageStatus,
  PackageSummary,
  ReboxingEvent,
  TimesheetEntry,
  UploadBatch
} from "@/types/domain";

export async function getPackages(): Promise<PackageSummary[]> {
  try {
    const { data, error } = await supabase.from("packages").select("*").order("created_at", { ascending: false });

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
  } catch {
    return [];
  }
}

export async function getPackageItems(): Promise<PackageItem[]> {
  try {
    const { data, error } = await supabase
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
      actualCondition: row.actual_condition || ""
    }));
  } catch {
    return [];
  }
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  try {
    const { data, error } = await supabase.from("catalog_products").select("*").order("created_at", { ascending: false });

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
  } catch {
    return [];
  }
}

export async function getUploadBatches(): Promise<UploadBatch[]> {
  try {
    const { data, error } = await supabase
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
  } catch {
    return [];
  }
}

export async function upsertCatalogRows(rows: CatalogProduct[], uploadedBy: string, fileName: string): Promise<void> {
  try {
    const catalogRows = rows.map((row) => ({
      barcode: row.barcode,
      artist: row.artist,
      title: row.title,
      format: row.format,
      media_type: row.mediaType,
      image_url: row.imageUrl
    }));

    if (catalogRows.length > 0) {
      const { error } = await supabase.from("catalog_products").upsert(catalogRows, { onConflict: "barcode" });
      if (error) {
        throw error;
      }
    }

    const { data: userData } = await supabase.from("app_users").select("id").eq("email", uploadedBy).single();

    const { error: batchError } = await supabase.from("upload_batches").insert({
      kind: "catalog",
      file_name: fileName,
      row_count: rows.length,
      uploaded_by: userData?.id
    });

    if (batchError) {
      throw batchError;
    }
  } catch (err) {
    console.error("Error upserting catalog:", err);
    throw err;
  }
}

export async function replacePackages(rows: PackageSummary[], uploadedBy: string, fileName: string): Promise<void> {
  try {
    const deduped = new Map<string, PackageSummary>();
    for (const row of rows) {
      const tracking = row.returnTrackingNumber.trim();
      if (!tracking) {
        continue;
      }
      deduped.set(tracking, { ...row, returnTrackingNumber: tracking });
    }

    const packageRows = Array.from(deduped.values()).map((row) => ({
      return_tracking_number: row.returnTrackingNumber,
      carrier: row.carrier,
      distinct_items: row.distinctItems,
      total_units: row.totalUnits,
      total_refund_usd: row.totalRefundUsd,
      expected_conditions: row.expectedConditions,
      order_references: row.orderReferences,
      earliest_return_requested: row.earliestReturnRequested || null,
      status: row.status,
      updated_at: new Date().toISOString()
    }));

    if (packageRows.length > 0) {
      const { error } = await supabase.from("packages").upsert(packageRows, { onConflict: "return_tracking_number" });
      if (error) {
        throw error;
      }
    }

    const { data: userData } = await supabase.from("app_users").select("id").eq("email", uploadedBy).single();

    const { error: batchError } = await supabase.from("upload_batches").insert({
      kind: "packages",
      file_name: fileName,
      row_count: rows.length,
      uploaded_by: userData?.id
    });

    if (batchError) {
      throw batchError;
    }
  } catch (err) {
    console.error("Error replacing packages:", err);
    throw err;
  }
}

export async function replacePackageItems(rows: PackageItem[], uploadedBy: string, fileName: string): Promise<void> {
  try {
    const { data: packages, error: packagesError } = await supabase.from("packages").select("id, return_tracking_number");
    if (packagesError) {
      throw packagesError;
    }

    const packageMap = new Map((packages || []).map((p) => [p.return_tracking_number, p.id]));

    const deduped = new Map<string, PackageItem>();
    for (const row of rows) {
      const tracking = row.returnTrackingNumber.trim();
      const barcode = row.barcode.trim();
      const orderReference = row.orderReference.trim();
      const key = `${tracking}__${barcode}__${orderReference}`;
      deduped.set(key, {
        ...row,
        returnTrackingNumber: tracking,
        barcode,
        orderReference
      });
    }

    const dedupedRows = Array.from(deduped.values());

    const missingTrackingNumbers = Array.from(
      new Set(
        dedupedRows
          .map((row) => row.returnTrackingNumber)
          .filter((tracking) => tracking.length > 0 && !packageMap.has(tracking))
      )
    );

    if (missingTrackingNumbers.length > 0) {
      throw new Error(
        [
          "Package Items upload failed.",
          "These Return Tracking Number values do not exist in Packages:",
          ...missingTrackingNumbers.slice(0, 20).map((tracking) => `- ${tracking}`),
          missingTrackingNumbers.length > 20 ? `- ...and ${missingTrackingNumbers.length - 20} more` : "",
          "Upload Packages first, then upload Package Items."
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    const packageIds = Array.from(
      new Set(
        dedupedRows
          .map((row) => packageMap.get(row.returnTrackingNumber))
          .filter((id): id is string => Boolean(id))
      )
    );

    const { data: existingItems, error: existingItemsError } = await supabase
      .from("package_items")
      .select("id, package_id, barcode, order_reference")
      .in("package_id", packageIds);

    if (existingItemsError) {
      throw existingItemsError;
    }

    const existingItemMap = new Map<string, string>();
    for (const item of existingItems || []) {
      const key = `${item.package_id}__${item.barcode}__${item.order_reference || ""}`;
      existingItemMap.set(key, item.id);
    }

    const insertRows: Array<Record<string, unknown>> = [];
    const updateRows: Array<{ id: string; payload: Record<string, unknown> }> = [];

    for (const row of dedupedRows) {
      const packageId = packageMap.get(row.returnTrackingNumber);
      if (!packageId) {
        continue;
      }

      const record = {
        package_id: packageId,
        barcode: row.barcode,
        artist: row.artist,
        title: row.title,
        qty_expected: row.qtyExpected,
        expected_condition: row.expectedCondition,
        customer_return_reason: row.customerReturnReason,
        refund_amount_usd: row.refundAmountUsd,
        order_reference: row.orderReference || "",
        return_requested_date: row.returnRequestedDate || null,
        order_date: row.orderDate || null,
        updated_at: new Date().toISOString()
      };

      const existingId = existingItemMap.get(`${packageId}__${row.barcode}__${row.orderReference || ""}`);
      if (existingId) {
        updateRows.push({ id: existingId, payload: record });
      } else {
        insertRows.push(record);
      }
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("package_items").insert(insertRows);
      if (insertError) {
        throw insertError;
      }
    }

    if (updateRows.length > 0) {
      for (const row of updateRows) {
        const { error: updateError } = await supabase.from("package_items").update(row.payload).eq("id", row.id);
        if (updateError) {
          throw updateError;
        }
      }
    }

    const { data: userData } = await supabase.from("app_users").select("id").eq("email", uploadedBy).single();

    const { error: batchError } = await supabase.from("upload_batches").insert({
      kind: "package_items",
      file_name: fileName,
      row_count: rows.length,
      uploaded_by: userData?.id
    });

    if (batchError) {
      throw batchError;
    }
  } catch (err) {
    console.error("Error replacing package items:", err);
    throw err;
  }
}

export async function updatePackageStatus(returnTrackingNumber: string, nextStatus: PackageStatus): Promise<void> {
  try {
    await supabase
      .from("packages")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("return_tracking_number", returnTrackingNumber);
  } catch (err) {
    console.error("Error updating package status:", err);
  }
}

export async function updateItemCondition(returnTrackingNumber: string, barcode: string, actualCondition: string): Promise<void> {
  try {
    const { data: pkg } = await supabase.from("packages").select("id").eq("return_tracking_number", returnTrackingNumber).single();

    if (!pkg) return;

    await supabase.from("package_items").update({ actual_condition: actualCondition }).eq("package_id", pkg.id).eq("barcode", barcode);
  } catch (err) {
    console.error("Error updating item condition:", err);
  }
}

export async function saveInspectionPhoto(packageItemId: string, filePath: string, uploadedBy: string): Promise<void> {
  try {
    const { data: userData } = await supabase.from("app_users").select("id").eq("email", uploadedBy).maybeSingle();

    const { error } = await supabase.from("inspection_photos").insert({
      package_item_id: packageItemId,
      file_path: filePath,
      uploaded_by: userData?.id || null
    });

    if (error) {
      throw new Error(error.message || "Unable to save inspection photo");
    }
  } catch (err) {
    console.error("Error saving inspection photo:", err);
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("Failed to save evidence image.");
  }
}

export async function getInspectionPhotos(): Promise<InspectionPhoto[]> {
  try {
    const { data, error } = await supabase.from("inspection_photos").select("*").order("created_at", { ascending: false });

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
  } catch {
    return [];
  }
}

export async function saveReboxingEvent(
  returnTrackingNumber: string,
  outboundBoxBarcode: string,
  outboundShippingBarcode: string,
  processedBy: string
): Promise<void> {
  const tracking = returnTrackingNumber.trim();
  try {
    const { data: pkg, error: pkgError } = await supabase
      .from("packages")
      .select("id, status")
      .eq("return_tracking_number", tracking)
      .single();

    if (pkgError || !pkg) {
      throw new Error("Package not found for reboxing.");
    }

    if (pkg.status !== "processed") {
      throw new Error("Package must be in processed status before reboxing.");
    }

    const { data: userData } = await supabase.from("app_users").select("id").eq("email", processedBy).maybeSingle();

    const { error } = await supabase.from("reboxing_events").insert({
      package_id: pkg.id,
      outbound_box_barcode: outboundBoxBarcode,
      outbound_shipping_barcode: outboundShippingBarcode,
      processed_by: userData?.id || null
    });

    if (error) {
      throw new Error(error.message || "Unable to save reboxing event");
    }
  } catch (err) {
    console.error("Error saving reboxing event:", err);
    throw err instanceof Error ? err : new Error("Failed to save reboxing event.");
  }
}

export async function getReboxingEvents(): Promise<ReboxingEvent[]> {
  try {
    const { data, error } = await supabase
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
  } catch {
    return [];
  }
}

export async function saveTimesheetEntry(processorName: string, workDate: string, hoursWorked: number, notes: string): Promise<void> {
  try {
    const { error } = await supabase.from("timesheet_entries").insert({
      processor_name: processorName,
      work_date: workDate,
      hours_worked: hoursWorked,
      notes
    });

    if (error) {
      throw new Error(error.message || "Unable to save timesheet entry");
    }
  } catch (err) {
    console.error("Error saving timesheet entry:", err);
    throw err instanceof Error ? err : new Error("Failed to save timesheet entry.");
  }
}

export async function getTimesheetEntries(): Promise<TimesheetEntry[]> {
  try {
    const { data, error } = await supabase.from("timesheet_entries").select("*").order("created_at", { ascending: false }).limit(200);

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
  } catch {
    return [];
  }
}
