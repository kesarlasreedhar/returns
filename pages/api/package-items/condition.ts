import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession } from "@/lib/server/session";
import { updateItemCondition } from "@/lib/server/data";

const schema = z.object({
  packageItemId: z.string().min(1),
  actualCondition: z.string().min(1)
});

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
    await updateItemCondition(parsed.data.packageItemId, parsed.data.actualCondition);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update item condition." });
  }
}
