import { createFileRoute } from "@tanstack/react-router";
import { SignInGate } from "@/lib/auth/gates";
import { DesktopShell } from "@/os/Desktop";
import { LockScreen } from "@/os/LockScreen";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <SignInGate fallback={<LockScreen />}>
      <DesktopShell />
    </SignInGate>
  );
}
