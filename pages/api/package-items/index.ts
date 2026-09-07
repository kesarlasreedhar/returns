import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/server/session";
import { getPackageItems } from "@/lib/server/data";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  res.status(200).json(await getPackageItems());
}
