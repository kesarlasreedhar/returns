import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const createUserSchema = z.object({
  requesterId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(4),
  role: z.enum(["admin", "seller", "processor"])
});

async function requireAdmin(requesterId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("role")
    .eq("id", requesterId)
    .maybeSingle();

  return !error && data?.role === "admin";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    const requesterId = req.query.requesterId;
    if (typeof requesterId !== "string" || !(await requireAdmin(requesterId))) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select("id, email, full_name, role, username, created_at")
      .order("created_at", { ascending: true });

    if (error || !data) {
      res.status(500).json({ error: "Failed to load users." });
      return;
    }

    res.status(200).json(
      data.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.full_name,
        role: row.role,
        username: row.username
      }))
    );
    return;
  }

  if (req.method === "POST") {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user details." });
      return;
    }

    const { requesterId, name, email, username, password, role } = parsed.data;
    if (!(await requireAdmin(requesterId))) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from("app_users")
      .insert({ full_name: name, email, username, password_hash: passwordHash, role })
      .select("id, email, full_name, role, username")
      .single();

    if (error || !data) {
      const message = error?.code === "23505" ? "Username or email already exists." : "Failed to create user.";
      res.status(409).json({ error: message });
      return;
    }

    res.status(201).json({
      id: data.id,
      email: data.email,
      name: data.full_name,
      role: data.role,
      username: data.username
    });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
