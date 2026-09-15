import {
  Activity,
  Archive,
  Bug,
  Calculator,
  Calendar,
  CheckSquare,
  CircleHelp,
  Clipboard,
  Clock,
  FileCode,
  FileText,
  Folder,
  Globe,
  History,
  Image,
  Layers,
  LayoutGrid,
  Play,
  Search,
  Settings,
  Sparkles,
  SquareTerminal,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  folder: Folder,
  "file-code": FileCode,
  "square-terminal": SquareTerminal,
  "sticky-note": StickyNote,
  "check-square": CheckSquare,
  calendar: Calendar,
  settings: Settings,
  activity: Activity,
  search: Search,
  image: Image,
  "file-text": FileText,
  archive: Archive,
  calculator: Calculator,
  clock: Clock,
  clipboard: Clipboard,
  "layout-grid": LayoutGrid,
  history: History,
  layers: Layers,
  bug: Bug,
  globe: Globe,
  play: Play,
  "circle-help": CircleHelp,
};

const TINT: Record<string, string> = {
  ai: "from-violet-500 to-blue-500",
  files: "from-amber-400 to-orange-500",
  editor: "from-sky-400 to-blue-600",
  terminal: "from-zinc-600 to-zinc-800",
  notes: "from-yellow-300 to-amber-500",
  tasks: "from-emerald-400 to-teal-600",
  calendar: "from-rose-400 to-pink-600",
  settings: "from-slate-400 to-slate-600",
  monitor: "from-cyan-400 to-blue-500",
  search: "from-blue-400 to-indigo-500",
  photos: "from-fuchsia-400 to-purple-600",
  viewer: "from-red-400 to-rose-600",
  archive: "from-orange-400 to-amber-700",
  calculator: "from-indigo-400 to-violet-600",
  clock: "from-teal-400 to-cyan-600",
  clipboard: "from-violet-400 to-purple-600",
  apps: "from-blue-500 to-cyan-400",
  activity: "from-slate-400 to-zinc-600",
  workspaces: "from-blue-400 to-violet-500",
  developer: "from-green-400 to-emerald-700",
  browser: "from-cyan-400 to-blue-600",
  media: "from-pink-400 to-rose-500",
  help: "from-blue-300 to-indigo-500",
};

export function AppGlyph({
  id,
  icon,
  size = 18,
  className = "",
}: {
  id: string;
  icon?: string;
  size?: number;
  className?: string;
}) {
  const Icon = MAP[icon || ""] || Folder;
  return (
    <span
      className={`inline-grid place-items-center rounded-xl bg-gradient-to-br ${TINT[id] || "from-blue-500 to-violet-600"} text-white shadow-inner ${className}`}
      style={{ width: size + 14, height: size + 14 }}
    >
      <Icon size={size} strokeWidth={2.1} />
    </span>
  );
}
