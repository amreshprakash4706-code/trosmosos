import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { DesktopShell } from "@/os/Desktop";
import { LockScreen } from "@/os/LockScreen";
import { OS_VERSION } from "@/lib/trosmos/core";

export const Route = createFileRoute("/")({ component: Home });

function BootSplash() {
  return (
    <main className="aurora grid min-h-screen place-items-center px-6">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 font-display text-2xl">
          T
        </span>
        <h1 className="mt-4 font-display text-2xl">Trosmos OS</h1>
        <p className="mt-1 text-sm text-muted">Starting your workspace · {OS_VERSION}</p>
      </div>
    </main>
  );
}

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <BootSplash />;
  if (!user) return <LockScreen />;
  return <DesktopShell />;
}
