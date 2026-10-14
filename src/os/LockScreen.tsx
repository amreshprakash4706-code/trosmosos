import { useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { OS_VERSION } from "@/lib/trosmos/core";

export function LockScreen({ title = "Trosmos OS" }: { title?: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (res.error) throw new Error(res.error.message || "Could not create account");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Could not sign in");
      }
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aurora grid min-h-screen place-items-center px-4 py-10">
      <div className="glass-strong w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 font-display text-xl">
            T
          </span>
          <div>
            <h1 className="font-display text-2xl">{title}</h1>
            <p className="text-sm text-muted">AI-native operating environment · {OS_VERSION}</p>
          </div>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10"
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled in this build.</p>
        )}
        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-faint">
          <span className="h-px flex-1 bg-white/10" />
          Email
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <form className="space-y-3" onSubmit={onEmail}>
          {mode === "up" ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />
          ) : null}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
          >
            {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-sm text-muted"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
