import type { Status } from "./types";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso);
  return isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const STATUS_STYLE: Record<Status, string> = {
  Applied: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/25",
  Interested: "bg-violet-500/10 text-violet-700 ring-violet-600/25 dark:text-violet-300 dark:ring-violet-400/25",
  "Going to interview": "bg-amber-500/12 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/25",
  unsuccessful: "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  successful: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25",
  Closed: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/25 dark:text-zinc-400 dark:ring-zinc-400/20",
};

export const STATUS_DOT: Record<Status, string> = {
  Applied: "bg-sky-500",
  Interested: "bg-violet-500",
  "Going to interview": "bg-amber-500",
  unsuccessful: "bg-rose-500",
  successful: "bg-emerald-500",
  Closed: "bg-zinc-500",
};
