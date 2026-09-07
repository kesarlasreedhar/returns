import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireSession } from "@/lib/server/session";
import { getTimesheetEntries, saveTimesheetEntry } from "@/lib/server/data";

const postSchema = z.object({
  processorName: z.string().min(1),
  workDate: z.string().min(1),
  hoursWorked: z.number(),
  notes: z.string().default("")
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }
    res.status(200).json(await getTimesheetEntries());
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
      await saveTimesheetEntry(parsed.data.processorName, parsed.data.workDate, parsed.data.hoursWorked, parsed.data.notes);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save timesheet entry." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
