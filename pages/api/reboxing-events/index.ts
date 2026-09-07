import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession } from "@/lib/server/session";
import { getReboxingEvents, saveReboxingEvent } from "@/lib/server/data";

const postSchema = z.object({
  returnTrackingNumber: z.string().min(1),
  outboundBoxBarcode: z.string().min(1),
  outboundShippingBarcode: z.string().min(1)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }
    res.status(200).json(await getReboxingEvents());
    return;
  }

  if (req.method === "POST") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    try {
      await saveReboxingEvent(
        parsed.data.returnTrackingNumber,
        parsed.data.outboundBoxBarcode,
        parsed.data.outboundShippingBarcode,
        session.email
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save reboxing event." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
