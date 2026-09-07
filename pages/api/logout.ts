import type { NextApiRequest, NextApiResponse } from "next";
import { clearSessionCookie } from "@/lib/server/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
