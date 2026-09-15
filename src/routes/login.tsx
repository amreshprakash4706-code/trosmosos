import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LockScreen } from "@/os/LockScreen";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="aurora grid min-h-screen place-items-center text-muted">Loading session…</div>;
  }
  if (user) return <Navigate to="/" />;
  void GROK_PROVIDERS;
  void authEnabled;
  return <LockScreen title="Sign in to Trosmos" />;
}
