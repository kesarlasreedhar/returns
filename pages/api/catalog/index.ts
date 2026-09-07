import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/server/session";
import { getCatalog, upsertCatalogRows } from "@/lib/server/data";

const catalogRowSchema = z.object({
  barcode: z.string().min(1),
  artist: z.string().default(""),
  title: z.string().default(""),
  format: z.string().default(""),
  mediaType: z.string().default(""),
  imageUrl: z.string().default("")
});

const postSchema = z.object({
  rows: z.array(catalogRowSchema),
  fileName: z.string().min(1)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }
    res.status(200).json(await getCatalog());
    return;
  }

  if (req.method === "POST") {
    const session = requireRole(req, res, ["admin", "seller"]);
    if (!session) {
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid catalog rows." });
      return;
    }

    try {
      await upsertCatalogRows(parsed.data.rows, session.email, parsed.data.fileName);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save catalog rows." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
