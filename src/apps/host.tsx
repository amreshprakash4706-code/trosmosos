import { APP_BY_ID } from "@/lib/trosmos/catalog";
import { FilesApp } from "./Files";
import { EditorApp } from "./Editor";
import { TerminalApp } from "./Terminal";
import { NotesApp } from "./Notes";
import { TasksApp } from "./Tasks";
import { CalendarApp } from "./Calendar";
import { SettingsApp } from "./Settings";
import { AiApp } from "./Ai";
import {
  ActivityApp,
  AppsLibrary,
  ArchiveApp,
  BrowserApp,
  CalculatorApp,
  ClipboardApp,
  ClockApp,
  DeveloperApp,
  HelpApp,
  MediaApp,
  MonitorApp,
  PhotosApp,
  SearchApp,
  ViewerApp,
  WorkspacesApp,
} from "./Utilities";

export function AppHost({
  appId,
  payload,
}: {
  appId: string;
  windowId: string;
  payload?: { path?: string; noteId?: string; taskId?: string; eventId?: string };
}) {
  switch (appId) {
    case "files":
      return <FilesApp payload={payload} />;
    case "editor":
      return <EditorApp payload={payload} />;
    case "terminal":
      return <TerminalApp />;
    case "notes":
      return <NotesApp payload={payload} />;
    case "tasks":
      return <TasksApp payload={payload} />;
    case "calendar":
      return <CalendarApp payload={payload} />;
    case "settings":
      return <SettingsApp />;
    case "ai":
      return <AiApp />;
    case "calculator":
      return <CalculatorApp />;
    case "clock":
      return <ClockApp />;
    case "clipboard":
      return <ClipboardApp />;
    case "help":
      return <HelpApp />;
    case "photos":
      return <PhotosApp payload={payload} />;
    case "viewer":
      return <ViewerApp payload={payload} />;
    case "archive":
      return <ArchiveApp payload={payload} />;
    case "media":
      return <MediaApp payload={payload} />;
    case "browser":
      return <BrowserApp />;
    case "search":
      return <SearchApp />;
    case "monitor":
      return <MonitorApp />;
    case "activity":
      return <ActivityApp />;
    case "workspaces":
      return <WorkspacesApp />;
    case "apps":
      return <AppsLibrary />;
    case "developer":
      return <DeveloperApp />;
    default:
      return (
        <div className="grid h-full place-items-center text-sm text-muted">
          Unknown application {APP_BY_ID[appId]?.name || appId}
        </div>
      );
  }
}
