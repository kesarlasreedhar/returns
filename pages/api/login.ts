import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const { username, password } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (error || !data || !data.password_hash) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, data.password_hash);
  if (!passwordMatches) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  res.status(200).json({
    id: data.id,
    email: data.email,
    name: data.full_name,
    role: data.role,
    username: data.username
  });
}
