import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { createUser, getCurrentUser, listUsers, logout } from "@/lib/auth";
import { AppRole, AppUser } from "@/types/domain";

const roleOptions: AppRole[] = ["admin", "seller", "processor"];

export default function UsersPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("admin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    setUser(current);
    listUsers(current.id).then(setUsers);
  }, [router]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) {
      return;
    }
    setMessage("");
    setError("");

    const result = await createUser(user.id, { name, email, username, password, role });
    if (result.error || !result.user) {
      setError(result.error || "Failed to create user.");
      return;
    }

    setMessage(`User ${result.user.name} created.`);
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setRole("admin");
    setUsers(await listUsers(user.id));
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Users"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid two-column">
        <article className="panel">
          <h2>Add New User</h2>
          <form onSubmit={(event) => void onSubmit(event)}>
            <label htmlFor="name">Full Name</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />

            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
              {roleOptions.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>

            {error ? <p className="error-text">{error}</p> : null}
            {message ? <div className="success-box">{message}</div> : null}

            <button type="submit" className="btn-primary">
              Create User
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Existing Users</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.username || "-"}</td>
                  <td>{row.email}</td>
                  <td>{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </AppLayout>
  );
}
