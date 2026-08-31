export type AppRole = "admin" | "seller" | "processor";

export type AppUser = {
  id: string;
  name: string;
  role: AppRole;
  email: string;
  username?: string;
};

export type PackageStatus = "received" | "in_processing" | "processed" | "sent_back";

export type PackageSummary = {
  id?: string;
  returnTrackingNumber: string;
  carrier: string;
  distinctItems: number;
  totalUnits: number;
  totalRefundUsd: number;
  expectedConditions: string;
  orderReferences: string;
  earliestReturnRequested: string;
  status: PackageStatus;
  createdAt?: string;
  updatedAt: string;
};

export type PackageItem = {
  id?: string;
  packageId?: string;
  returnTrackingNumber: string;
  carrier: string;
  barcode: string;
  artist: string;
  title: string;
  qtyExpected: number;
  expectedCondition: string;
  customerReturnReason: string;
  refundAmountUsd: number;
  orderReference: string;
  returnRequestedDate: string;
  orderDate: string;
  actualCondition?: string;
};

export type CatalogProduct = {
  id?: string;
  barcode: string;
  artist: string;
  title: string;
  format: string;
  mediaType: string;
  imageUrl: string;
};

export type UploadBatch = {
  id: string;
  kind: "catalog" | "packages" | "package_items";
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  rowCount: number;
};

export type InspectionPhoto = {
  id: string;
  packageItemId: string;
  filePath: string;
  uploadedBy: string;
  createdAt: string;
};

export type ReboxingEvent = {
  id: string;
  packageId: string;
  returnTrackingNumber: string;
  outboundBoxBarcode: string;
  outboundShippingBarcode: string;
  processedBy: string;
  createdAt: string;
};

export type TimesheetEntry = {
  id: string;
  processorName: string;
  workDate: string;
  hoursWorked: number;
  notes: string;
  createdAt: string;
};
