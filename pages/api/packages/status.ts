import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession } from "@/lib/server/session";
import { evaluatePackageRefundStatus, markPackageScanned, updatePackageStatus } from "@/lib/server/data";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan"), returnTrackingNumber: z.string().min(1) }),
  z.object({ action: z.literal("evaluate"), returnTrackingNumber: z.string().min(1) }),
  z.object({
    action: z.literal("set"),
    returnTrackingNumber: z.string().min(1),
    status: z.enum(["open", "scanned", "ready_for_refund", "review_for_refund", "closed"])
  })
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  try {
    if (parsed.data.action === "scan") {
      await markPackageScanned(parsed.data.returnTrackingNumber, session.sub);
      res.status(200).json({ ok: true });
      return;
    }

    if (parsed.data.action === "evaluate") {
      const status = await evaluatePackageRefundStatus(parsed.data.returnTrackingNumber, session.sub);
      res.status(200).json({ status });
      return;
    }

    await updatePackageStatus(parsed.data.returnTrackingNumber, parsed.data.status, session.sub);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update package status." });
  }
}
