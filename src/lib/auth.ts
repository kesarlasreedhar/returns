import { AppUser } from "@/types/domain";

const AUTH_KEY = "returns_ops_user";

export function getCurrentUser(): AppUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AppUser;
  } catch {
    return null;
  }
}

export async function loginWithPassword(username: string, password: string): Promise<AppUser | null> {
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as AppUser;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    }

    return user;
  } catch {
    return null;
  }
}

export function logout(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_KEY);
}

export async function listUsers(requesterId: string): Promise<AppUser[]> {
  try {
    const response = await fetch(`/api/users?requesterId=${encodeURIComponent(requesterId)}`);
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as AppUser[];
  } catch {
    return [];
  }
}

export type NewUserInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  role: AppUser["role"];
};

export async function createUser(
  requesterId: string,
  input: NewUserInput
): Promise<{ user?: AppUser; error?: string }> {
  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId, ...input })
    });

    const body = await response.json();
    if (!response.ok) {
      return { error: body.error || "Failed to create user." };
    }

    return { user: body as AppUser };
  } catch {
    return { error: "Failed to create user." };
  }
}
