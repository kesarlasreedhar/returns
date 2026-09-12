import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession } from "@/lib/server/session";
import { deleteOperationNote, getOperationNotes, saveOperationNote, updateOperationNote } from "@/lib/server/data";

const postSchema = z.object({
  note: z.string().min(1),
  packageItemId: z.string().min(1).optional()
});

const putSchema = z.object({
  id: z.string().min(1),
  note: z.string().min(1)
});

const deleteSchema = z.object({
  id: z.string().min(1)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }
    res.status(200).json(await getOperationNotes());
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
      await saveOperationNote(parsed.data.note, session.email, parsed.data.packageItemId);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save note." });
    }
    return;
  }

  if (req.method === "PUT") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    try {
      await updateOperationNote(parsed.data.id, parsed.data.note);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update note." });
    }
    return;
  }

  if (req.method === "DELETE") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    try {
      await deleteOperationNote(parsed.data.id);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete note." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
