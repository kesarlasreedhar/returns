import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireRole } from "@/lib/server/session";
import { importReturnsWorkbook } from "@/lib/server/data";

const catalogRowSchema = z.object({
  barcode: z.string().min(1),
  artist: z.string().default(""),
  title: z.string().default(""),
  format: z.string().default(""),
  mediaType: z.string().default(""),
  imageUrl: z.string().default("")
});

const packageRowSchema = z.object({
  returnTrackingNumber: z.string().min(1),
  carrier: z.string().min(1),
  distinctItems: z.number(),
  totalUnits: z.number(),
  totalRefundUsd: z.number(),
  expectedConditions: z.string().default(""),
  orderReferences: z.string().default(""),
  earliestReturnRequested: z.string().default(""),
  status: z.enum(["open", "scanned", "ready_for_refund", "review_for_refund", "closed"]),
  updatedAt: z.string().default("")
});

const packageItemRowSchema = z.object({
  returnTrackingNumber: z.string().min(1),
  carrier: z.string().min(1),
  barcode: z.string().min(1),
  artist: z.string().default(""),
  title: z.string().default(""),
  qtyExpected: z.number(),
  expectedCondition: z.string().min(1),
  customerReturnReason: z.string().default(""),
  refundAmountUsd: z.number(),
  orderReference: z.string().default(""),
  returnRequestedDate: z.string().default(""),
  orderDate: z.string().default("")
});

const schema = z.object({
  catalog: z.array(catalogRowSchema),
  packages: z.array(packageRowSchema),
  packageItems: z.array(packageItemRowSchema),
  fileName: z.string().min(1)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = requireRole(req, res, ["admin", "seller"]);
  if (!session) {
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid workbook payload." });
    return;
  }

  try {
    await importReturnsWorkbook(parsed.data.catalog, parsed.data.packages, parsed.data.packageItems, session.email, parsed.data.fileName);
    res.status(200).json({ ok: true });
  } catch (error) {
    const databaseError = error as { message?: string; details?: string; hint?: string; code?: string };
    const message = databaseError.message || (error instanceof Error ? error.message : "Failed to import workbook.");
    const suffix = [databaseError.details, databaseError.hint, databaseError.code ? `code ${databaseError.code}` : ""]
      .filter(Boolean)
      .join(" ");
    res.status(500).json({ error: suffix ? `${message} ${suffix}` : message });
  }
}
