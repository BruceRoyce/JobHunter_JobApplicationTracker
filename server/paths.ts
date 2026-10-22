// Resolves where the app lives so the whole folder stays portable.
// Layout (dev and dist alike):
//   <root>/server/main.ts   <root>/public/   <root>/data/app.db   <root>/data/files/
import { dirname, fromFileUrl, join } from "./util.ts";

function detectRoot(): string {
  const override = Deno.env.get("JOB_HUNTER_ROOT");
  if (override) return override;
  const exe = Deno.execPath();
  const exeName = exe.split(/[\\/]/).pop()!.toLowerCase();
  // Standalone binary built with `deno compile`: data lives beside the executable.
  if (!/^deno(\.exe)?$/.test(exeName)) return dirname(exe);
  return dirname(dirname(fromFileUrl(import.meta.url)));
}

function detectDataDir(): string {
  const override = Deno.env.get("JOB_HUNTER_DATA");
  if (override) return override;

  const exe = Deno.execPath();
  const exeName = exe.split(/[\\/]/).pop()!.toLowerCase();

  // If running as a standalone binary (installed via MSI in Program Files)
  if (!/^deno(\.exe)?$/.test(exeName)) {
    // Fallback chain: Windows APPDATA -> Mac/Linux HOME -> Current Working Directory
    const osDataDir =
      Deno.env.get("APPDATA") ?? Deno.env.get("HOME") ?? Deno.cwd();
    return join(osDataDir, "job-hunter-tracker", "data");
  }

  // If running in development (via deno task dev), keep data in the project root
  return join(ROOT, "data");
}

export const ROOT = detectRoot();
export const DATA_DIR = detectDataDir();
export const FILES_DIR = join(DATA_DIR, "files");
export const DB_PATH = join(DATA_DIR, "app.db");
export const PUBLIC_DIR =
  Deno.env.get("JOB_HUNTER_PUBLIC") ?? join(ROOT, "public");
