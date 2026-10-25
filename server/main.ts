import { openDb, STATUSES } from "./db.ts";
import {
  createJob,
  exportCsv,
  filePathFor,
  getJob,
  HttpError,
  listJobs,
  updateJob,
} from "./jobs.ts";
import { DATA_DIR, DB_PATH, FILES_DIR, PUBLIC_DIR } from "./paths.ts";
import { exists, join, mimeFor, todayIso } from "./util.ts";

await Deno.mkdir(FILES_DIR, { recursive: true });
const db = openDb(DB_PATH);

const PORT = Number(Deno.env.get("PORT") ?? "8787");
const HOSTNAME = Deno.env.get("HOST") ?? "127.0.0.1";
const MAX_BODY = 80 * 1024 * 1024;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "SAMEORIGIN",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Origin, Accept",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
      ...CORS_HEADERS,
    },
  });
}

function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function readForm(req: Request): Promise<FormData> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY)
    throw new HttpError(
      413,
      "The upload is too large (80 MB maximum per save).",
    );
  const ct = req.headers.get("content-type") ?? "";
  if (
    !ct.includes("multipart/form-data") &&
    !ct.includes("application/x-www-form-urlencoded")
  ) {
    throw new HttpError(415, "Send the form as multipart/form-data.");
  }
  try {
    return await req.formData();
  } catch {
    throw new HttpError(400, "The form could not be read.");
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return (
      host === new URL(req.url).host ||
      /^(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$/.test(host) ||
      origin.startsWith("tauri://") // <-- Trust Tauri production scheme
    );
  } catch {
    return false;
  }
}

async function serveFile(path: string, headers: Record<string, string> = {}) {
  const file = await Deno.open(path, { read: true });
  const stat = await file.stat();
  return new Response(file.readable, {
    headers: {
      "content-length": String(stat.size),
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

async function serveStatic(pathname: string): Promise<Response> {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel.split(/[\\/]/).some((p) => p === ".." || p.startsWith(".")))
    return new Response("Not found", { status: 404 });
  let path = join(PUBLIC_DIR, rel || "index.html");
  let isIndex = !rel;
  try {
    const st = await Deno.stat(path);
    if (st.isDirectory) throw new Deno.errors.NotFound();
  } catch {
    if (/\.[a-z0-9]+$/i.test(rel))
      return new Response("Not found", { status: 404 });
    path = join(PUBLIC_DIR, "index.html");
    isIndex = true;
  }
  if (!(await exists(path))) {
    return new Response(
      "Front-end not built. In development open the Vite dev server (deno task dev); otherwise run deno task build.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return serveFile(path, {
    "content-type": mimeFor(path),
    "cache-control":
      isIndex || !rel.startsWith("assets/")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method;

  // NEW: Handle CORS preflight requests
  if (m === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!p.startsWith("/api/")) {
    if (m !== "GET" && m !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    return serveStatic(p);
  }
  if (m !== "GET" && m !== "HEAD" && !sameOrigin(req))
    throw new HttpError(403, "Cross-origin request refused.");

  if (p === "/api/health")
    return json({ ok: true, data_dir: DATA_DIR, today: todayIso() });
  if (p === "/api/meta")
    return json({
      statuses: STATUSES,
      contract_types: ["Contract", "Permanent"],
      via: ["Employer", "Agency"],
    });

  if (p === "/api/jobs") {
    if (m === "GET") return json(listJobs(db, url.searchParams));
    if (m === "POST")
      return json(await createJob(db, await readForm(req)), 201);
  }

  if (p === "/api/export.csv" && m === "GET") {
    const stamp = todayIso();
    return new Response(exportCsv(db), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": contentDisposition(
          "attachment",
          `job-hunter-export-${stamp}.csv`,
        ),
        "cache-control": "no-store",
        ...SECURITY_HEADERS,
      },
    });
  }

  const one = /^\/api\/jobs\/(\d+)$/.exec(p);
  if (one) {
    const id = Number(one[1]);
    if (m === "GET") return json(getJob(db, id));
    if (m === "PUT" || m === "POST")
      return json(await updateJob(db, id, await readForm(req)));
  }

  const file = /^\/api\/jobs\/(\d+)\/files\/(cv|cover-letter|advert)$/.exec(p);
  if (file && m === "GET") {
    const f = filePathFor(db, Number(file[1]), file[2]);
    if (!(await exists(f.path)))
      throw new HttpError(
        404,
        "The stored file is missing from the data folder.",
      );
    const type = mimeFor(f.name);
    const headers: Record<string, string> = {
      "content-type": type,
      "content-disposition": contentDisposition(
        url.searchParams.get("download") ? "attachment" : "inline",
        f.display,
      ),
      "cache-control": "no-cache",
    };
    // Frozen web pages are shown as evidence only: scripts and forms never run.
    if (type.startsWith("text/html"))
      headers["content-security-policy"] =
        "sandbox; default-src * data: 'unsafe-inline'; script-src 'none'";
    return serveFile(f.path, headers);
  }

  throw new HttpError(404, "Not found.");
}

async function handler(req: Request): Promise<Response> {
  try {
    return await route(req);
  } catch (e) {
    if (e instanceof HttpError)
      return json(
        { error: e.message, fieldErrors: e.fieldErrors ?? {} },
        e.status,
      );
    console.error(e);
    return json(
      { error: `Something went wrong: ${(e as Error).message}` },
      500,
    );
  }
}

Deno.serve(
  {
    port: PORT,
    hostname: HOSTNAME,
    onListen: ({ hostname, port }) => {
      const host = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
      // One stable line so the Tauri shell can learn an ephemeral port (PORT=0).
      const line = `JOB_HUNTER_READY http://${host}:${port}\n`;
      Deno.stdout.writeSync(new TextEncoder().encode(line));
      console.log(`Data folder: ${DATA_DIR}`);
    },
  },
  handler,
);
