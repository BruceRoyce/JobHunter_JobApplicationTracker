// Small dependency-free helpers (keeps the server runnable fully offline).
export const SEP = Deno.build.os === "windows" ? "\\" : "/";

export function join(...parts: string[]): string {
  return parts
    .filter((p) => p !== "")
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join(SEP);
}

export function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx <= 0 ? p : p.slice(0, idx);
}

export function fromFileUrl(u: string): string {
  const url = new URL(u);
  let p = decodeURIComponent(url.pathname);
  if (Deno.build.os === "windows") {
    p = p.replace(/^\/([A-Za-z]:)/, "$1").replace(/\//g, "\\");
    if (url.hostname) p = `\\\\${url.hostname}${p}`;
  }
  return p;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
};

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function mimeFor(name: string): string {
  return MIME[extOf(name)] ?? "application/octet-stream";
}

/** Filesystem-safe segment, valid on Windows, macOS and Linux. */
export function safeSegment(input: string, max = 48): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/[^A-Za-z0-9 ._&()+'-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return s.slice(0, max).replace(/[.-]+$/, "");
}

export function safeFileName(name: string): string {
  const ext = extOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  const b = safeSegment(base, 80) || "file";
  return ext ? `${b}.${ext}` : b;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Best-effort numeric value from free-text salary, used only for sorting. */
export function parseSalary(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /(\d[\d,. ]*\d|\d)\s*(k|K)?/.exec(text.replace(/£|\$|€/g, ""));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/[, ]/g, ""));
  if (isNaN(n)) return null;
  return m[2] ? n * 1000 : n;
}

export function randomId(): string {
  return crypto.randomUUID().slice(0, 8);
}
