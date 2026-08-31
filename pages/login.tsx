import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { loginWithPassword } from "@/lib/auth";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const user = await loginWithPassword(username, password);
    if (!user) {
      setError("Invalid username or password.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="auth-shell">
      <form onSubmit={onSubmit} className="auth-card">
        <h1>Neeros</h1>
        <p>Sign in with your username and password.</p>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit" className="btn-primary">
          Login
        </button>
      </form>
    </div>
  );
}
