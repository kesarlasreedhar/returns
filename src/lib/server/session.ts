import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { AppRole } from "@/types/domain";

export const SESSION_COOKIE = "ro_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type SessionPayload = {
  sub: string;
  role: AppRole;
  email: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return secret;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function signSession(payload: Omit<SessionPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = sign(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function serializeCookie(name: string, value: string, options: { maxAge?: number } = {}): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  return parts.join("; ");
}

export function setSessionCookie(res: NextApiResponse, payload: Omit<SessionPayload, "iat" | "exp">): void {
  const token = signSession(payload);
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE_SECONDS }));
}

export function clearSessionCookie(res: NextApiResponse): void {
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAge: 0 }));
}

export function getSessionUser(req: NextApiRequest): SessionPayload | null {
  return verifySessionToken(req.cookies?.[SESSION_COOKIE]);
}

export function requireSession(req: NextApiRequest, res: NextApiResponse): SessionPayload | null {
  const session = getSessionUser(req);
  if (!session) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  return session;
}

export function requireRole(req: NextApiRequest, res: NextApiResponse, roles: AppRole[]): SessionPayload | null {
  const session = requireSession(req, res);
  if (!session) {
    return null;
  }
  if (!roles.includes(session.role)) {
    res.status(403).json({ error: "You do not have access to this action." });
    return null;
  }
  return session;
}
