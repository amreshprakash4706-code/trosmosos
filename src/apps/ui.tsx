import type { ReactNode } from "react";

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-sm space-y-2">
        <p className="font-display text-lg">{title}</p>
        {body ? <p className="text-sm text-muted">{body}</p> : null}
        {action}
      </div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-sm">{children}</div>
  );
}

export function GhostBtn({
  children,
  onClick,
  danger,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
        danger ? "text-rose-300 hover:bg-rose-500/15" : "text-fg/85 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-fg outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
