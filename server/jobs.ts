import type { DatabaseSync } from "node:sqlite";
import { CONTRACT_TYPES, STATUSES, tx, VIA } from "./db.ts";
import { freezeUrl } from "./freeze.ts";
import { FILES_DIR } from "./paths.ts";
import {
  exists,
  extOf,
  isIsoDate,
  join,
  nowIso,
  parseSalary,
  randomId,
  safeFileName,
  safeSegment,
  todayIso,
} from "./util.ts";

const MAX_UPLOAD = 25 * 1024 * 1024;
const PAGE_SIZE = 50;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface StatusEvent {
  id: number;
  status: string;
  event_date: string;
  created_at: string;
}

function toDto(r: Row, events: StatusEvent[]) {
  return {
    id: r.id,
    is_starred: r.is_starred === 1,
    job_title: r.job_title,
    via: r.via,
    employer_name: r.employer_name,
    agency_name: r.agency_name,
    contract_type: r.contract_type,
    salary_offer: r.salary_offer,
    contact_person: r.contact_person,
    url: r.url,
    status: r.status,
    record_date: r.record_date,
    folder: r.folder,
    cv: r.cv_file ? { name: r.cv_name ?? r.cv_file, path: `${r.folder}/${r.cv_file}` } : null,
    cv_name: r.cv_name,
    cover_letter: r.cover_file ? { name: r.cover_name ?? r.cover_file, path: `${r.folder}/${r.cover_file}` } : null,
    cover_name: r.cover_name,
    advert: r.advert_file
      ? {
        path: `${r.folder}/${r.advert_file}`,
        content_type: r.advert_content_type,
        source_url: r.advert_source_url,
        frozen_at: r.advert_frozen_at,
      }
      : null,
    advert_error: r.advert_error,
    notes: r.notes ?? "",
    created_at: r.created_at,
    updated_at: r.updated_at,
    events,
  };
}
export type JobDto = ReturnType<typeof toDto>;

// ---------- input parsing & validation ----------

interface JobInput {
  is_starred: number;
  job_title: string;
  via: string;
  employer_name: string | null;
  agency_name: string | null;
  contract_type: string | null;
  salary_offer: string | null;
  contact_person: string | null;
  url: string | null;
  status: string;
  record_date: string;
  notes: string;
  cv_name: string | null;
  cover_name: string | null;
}

function str(fd: FormData, key: string, max = 500): string {
  const v = fd.get(key);
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function fileOf(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v instanceof File && v.size > 0 ? v : null;
}

function parseInput(fd: FormData): JobInput {
  const errors: Record<string, string> = {};
  const starredRaw = str(fd, "is_starred");
  const via = str(fd, "via") || "Employer";
  const job_title = str(fd, "job_title", 200);
  const employer = str(fd, "employer_name", 200);
  const agency = str(fd, "agency_name", 200);
  const contract = str(fd, "contract_type");
  const status = str(fd, "status");
  const record_date = str(fd, "record_date") || todayIso();
  const url = str(fd, "url", 2000);

  if (!job_title) errors.job_title = "Job title is required.";
  if (!(VIA as readonly string[]).includes(via)) errors.via = "Choose Employer or Agency.";
  if (via === "Employer" && !employer) errors.employer_name = "Employer name is required when applying via an employer.";
  if (via === "Agency" && !agency) errors.agency_name = "Agency name is required when applying via an agency.";
  if (contract && !(CONTRACT_TYPES as readonly string[]).includes(contract)) {
    errors.contract_type = "Choose Contract or Permanent.";
  }
  if (!(STATUSES as readonly string[]).includes(status)) errors.status = "Choose a status.";
  if (!isIsoDate(record_date)) errors.record_date = "Enter a valid date.";
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      errors.url = "Enter a full web address starting with http:// or https://.";
    }
  }
  for (const k of ["cv", "cover_letter", "advert"]) {
    const f = fileOf(fd, k);
    if (f && f.size > MAX_UPLOAD) errors[k] = "Files must be 25 MB or smaller.";
  }
  const advert = fileOf(fd, "advert");
  if (advert && !["pdf", "jpg", "jpeg", "png", "html", "htm"].includes(extOf(advert.name))) {
    errors.advert = "The job advert must be a PDF, JPEG, PNG or HTML file.";
  }
  if (Object.keys(errors).length) throw new HttpError(422, "Please correct the highlighted fields.", errors);

  return {
    is_starred: ["1", "true", "on", "yes"].includes(starredRaw.toLowerCase()) ? 1 : 0,
    job_title,
    via,
    employer_name: employer || null,
    agency_name: via === "Agency" ? agency || null : null,
    contract_type: contract || null,
    salary_offer: str(fd, "salary_offer", 200) || null,
    contact_person: str(fd, "contact_person", 200) || null,
    url: url || null,
    status,
    record_date,
    notes: (typeof fd.get("notes") === "string" ? (fd.get("notes") as string) : "").slice(0, 100_000),
    cv_name: str(fd, "cv_name", 255) || null,
    cover_name: str(fd, "cover_name", 255) || null,
  };
}

// ---------- files ----------

function folderBase(input: JobInput): string {
  const [y, m] = input.record_date.split("-");
  const parts = [
    `${y}_${m}`,
    safeSegment(input.employer_name ?? ""),
    safeSegment(input.agency_name ?? ""),
    safeSegment(input.job_title),
  ].filter(Boolean);
  return parts.join("_");
}

async function uniqueFolder(base: string): Promise<string> {
  let name = base;
  for (let i = 2; await exists(join(FILES_DIR, name)); i++) name = `${base}-${i}`;
  return name;
}

async function writeFile(folder: string, name: string, data: Uint8Array) {
  await Deno.writeFile(join(FILES_DIR, folder, name), data, { createNew: true });
}

async function fileBytes(f: File) {
  return new Uint8Array(await f.arrayBuffer());
}

function storedName(prefix: string, original: string) {
  return `${prefix}__${safeFileName(original)}`;
}

// ---------- queries ----------

function eventsFor(db: DatabaseSync, ids: number[]): Map<number, StatusEvent[]> {
  const map = new Map<number, StatusEvent[]>();
  if (!ids.length) return map;
  const rows = db
    .prepare(
      `SELECT id, job_id, status, event_date, created_at FROM status_events
       WHERE job_id IN (${ids.map(() => "?").join(",")}) ORDER BY event_date ASC, id ASC`,
    )
    .all(...ids) as Row[];
  for (const r of rows) {
    const list = map.get(r.job_id) ?? [];
    list.push({ id: r.id, status: r.status, event_date: r.event_date, created_at: r.created_at });
    map.set(r.job_id, list);
  }
  return map;
}

function getRow(db: DatabaseSync, id: number): Row {
  const r = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new HttpError(404, "Record not found.");
  return r;
}

export function getJob(db: DatabaseSync, id: number): JobDto {
  const r = getRow(db, id);
  return toDto(r, eventsFor(db, [id]).get(id) ?? []);
}

const SORTS: Record<string, string> = {
  updated: "updated_at",
  title: "job_title COLLATE NOCASE",
  name: "COALESCE(NULLIF(employer_name, ''), agency_name) COLLATE NOCASE",
  salary: "salary_value",
};

export function listJobs(db: DatabaseSync, params: URLSearchParams) {
  const sortKey = SORTS[params.get("sort") ?? ""] ? params.get("sort")! : "updated";
  const defaultDir = sortKey === "updated" || sortKey === "salary" ? "desc" : "asc";
  const dir = (params.get("dir") ?? defaultDir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const status = params.get("status");
  const where: string[] = [];
  const args: string[] = [];
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Unknown status filter.");
    where.push("status = ?");
    args.push(status);
  }
  if (params.get("starred") === "1") where.push("is_starred = 1");
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM jobs ${w}`).get(...args) as Row).n as number;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(params.get("page") ?? "1") || 1), pages);
  const nulls = sortKey === "salary" ? "salary_value IS NULL, " : "";
  const rows = db
    .prepare(
      `SELECT * FROM jobs ${w} ORDER BY ${nulls}${SORTS[sortKey]} ${dir}, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Row[];
  const ev = eventsFor(db, rows.map((r) => r.id));
  return {
    items: rows.map((r) => toDto(r, ev.get(r.id) ?? [])),
    total,
    page,
    pages,
    page_size: PAGE_SIZE,
    sort: sortKey,
    dir: dir.toLowerCase(),
  };
}

// ---------- create ----------

export async function createJob(db: DatabaseSync, fd: FormData) {
  const input = parseInput(fd);
  const warnings: string[] = [];
  const folder = await uniqueFolder(folderBase(input));
  const folderPath = join(FILES_DIR, folder);
  await Deno.mkdir(folderPath, { recursive: true });
  try {
    const cv = fileOf(fd, "cv");
    const cover = fileOf(fd, "cover_letter");
    const manualAdvert = fileOf(fd, "advert");
    let cvFile: string | null = null, coverFile: string | null = null;
    if (cv) {
      cvFile = storedName("CV", cv.name);
      await writeFile(folder, cvFile, await fileBytes(cv));
    }
    if (cover) {
      coverFile = storedName("Cover-letter", cover.name);
      await writeFile(folder, coverFile, await fileBytes(cover));
    }

    const advert = await captureAdvert(folder, input.url, manualAdvert, warnings);

    const now = nowIso();
    const id = tx(db, () => {
      const res = db
        .prepare(
          `INSERT INTO jobs (is_starred, job_title, via, employer_name, agency_name, contract_type,
            salary_offer, salary_value, contact_person, url, status, record_date, folder,
            cv_file, cv_name, cover_file, cover_name,
            advert_file, advert_content_type, advert_source_url, advert_frozen_at, advert_error,
            notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          input.is_starred, input.job_title, input.via, input.employer_name, input.agency_name,
          input.contract_type, input.salary_offer, parseSalary(input.salary_offer), input.contact_person,
          input.url, input.status, input.record_date, folder,
          cvFile, cv ? cv.name : input.cv_name, coverFile, cover ? cover.name : input.cover_name,
          advert.file, advert.contentType, advert.sourceUrl, advert.frozenAt, advert.error,
          input.notes, now, now,
        );
      const jobId = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO status_events (job_id, status, event_date, created_at) VALUES (?,?,?,?)")
        .run(jobId, input.status, input.record_date, now);
      return jobId;
    });
    return { job: getJob(db, id), warnings };
  } catch (e) {
    await Deno.remove(folderPath, { recursive: true }).catch(() => {});
    throw e;
  }
}

interface AdvertResult {
  file: string | null;
  contentType: string | null;
  sourceUrl: string | null;
  frozenAt: string | null;
  error: string | null;
}

async function captureAdvert(
  folder: string,
  url: string | null,
  manual: File | null,
  warnings: string[],
): Promise<AdvertResult> {
  const none: AdvertResult = { file: null, contentType: null, sourceUrl: null, frozenAt: null, error: null };
  if (manual) {
    let ext = extOf(manual.name);
    if (ext === "jpeg") ext = "jpg";
    if (ext === "htm") ext = "html";
    const file = `Job-advert.${ext}`;
    await writeFile(folder, file, await fileBytes(manual));
    return {
      file,
      contentType: ext === "pdf" ? "application/pdf" : ext === "html" ? "text/html" : `image/${ext === "jpg" ? "jpeg" : "png"}`,
      sourceUrl: url ? `${url} (uploaded file: ${manual.name})` : `uploaded file: ${manual.name}`,
      frozenAt: nowIso(),
      error: null,
    };
  }
  if (!url) return none;
  try {
    const f = await freezeUrl(url);
    const file = `Job-advert.${f.ext}`;
    await writeFile(folder, file, f.bytes);
    return { file, contentType: f.contentType, sourceUrl: f.finalUrl || url, frozenAt: nowIso(), error: null };
  } catch (e) {
    const msg = `Could not freeze the job advert from the URL: ${(e as Error).message}.`;
    warnings.push(msg);
    return { ...none, error: msg };
  }
}

// ---------- update ----------

interface EventInput {
  id?: number;
  status: string;
  event_date: string;
}

function parseEvents(fd: FormData): EventInput[] | null {
  const raw = fd.get("events");
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(422, "Status history could not be read.", { events: "Invalid status history." });
  }
  if (!Array.isArray(data) || data.length > 500) {
    throw new HttpError(422, "Status history could not be read.", { events: "Invalid status history." });
  }
  return data.map((e, i) => {
    const ev = e as Record<string, unknown>;
    const status = String(ev.status ?? "");
    const event_date = String(ev.event_date ?? "");
    if (!(STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(422, "Please correct the status history.", { [`events.${i}`]: "Unknown status." });
    }
    if (!isIsoDate(event_date)) {
      throw new HttpError(422, "Please correct the status history.", { [`events.${i}`]: "Enter a valid date." });
    }
    const id = ev.id === undefined || ev.id === null ? undefined : Number(ev.id);
    if (id !== undefined && !Number.isInteger(id)) {
      throw new HttpError(422, "Please correct the status history.", { [`events.${i}`]: "Invalid entry." });
    }
    return { id, status, event_date };
  });
}

export async function updateJob(db: DatabaseSync, id: number, fd: FormData) {
  const current = getRow(db, id);
  const input = parseInput(fd);
  const events = parseEvents(fd);
  const warnings: string[] = [];
  const folder = current.folder as string;
  const folderPath = join(FILES_DIR, folder);
  await Deno.mkdir(folderPath, { recursive: true });

  if (events) {
    const known = new Set(
      (db.prepare("SELECT id FROM status_events WHERE job_id = ?").all(id) as Row[]).map((r) => r.id),
    );
    events.forEach((e, i) => {
      if (e.id !== undefined && !known.has(e.id)) {
        throw new HttpError(422, "Please correct the status history.", { [`events.${i}`]: "Unknown entry." });
      }
    });
  }

  // Stage new uploads under temporary names; promote them only after the DB commit.
  const staged: { tmp: string; final: string; old: string | null }[] = [];
  const stage = async (f: File | null, prefix: string, old: string | null) => {
    if (!f) return null;
    const final = storedName(prefix, f.name);
    const tmp = `.upload-${randomId()}-${final}`;
    await writeFile(folder, tmp, await fileBytes(f));
    staged.push({ tmp, final, old });
    return final;
  };

  let newAdvert: AdvertResult | null = null;
  try {
    const cv = fileOf(fd, "cv");
    const cover = fileOf(fd, "cover_letter");
    const cvFile = await stage(cv, "CV", current.cv_file);
    const coverFile = await stage(cover, "Cover-letter", current.cover_file);

    // The frozen advert is never replaced. Capture is only attempted when none exists yet.
    if (!current.advert_file) {
      const manual = fileOf(fd, "advert");
      if (manual || (input.url && input.url !== current.url) || (input.url && current.advert_error)) {
        newAdvert = await captureAdvert(folder, input.url, manual, warnings);
      }
    } else if (fileOf(fd, "advert")) {
      warnings.push("The frozen job advert is historic evidence and was not replaced.");
    }

    const now = nowIso();
    tx(db, () => {
      db.prepare(
        `UPDATE jobs SET is_starred=?, job_title=?, via=?, employer_name=?, agency_name=?, contract_type=?,
           salary_offer=?, salary_value=?, contact_person=?, url=?, status=?, record_date=?, notes=?,
           cv_file=?, cv_name=?, cover_file=?, cover_name=?, updated_at=? WHERE id=?`,
      ).run(
        input.is_starred, input.job_title, input.via, input.employer_name, input.agency_name,
        input.contract_type, input.salary_offer, parseSalary(input.salary_offer), input.contact_person,
        input.url, input.status, input.record_date, input.notes,
        cvFile ?? current.cv_file, cv ? cv.name : current.cv_file ? current.cv_name : input.cv_name,
        coverFile ?? current.cover_file, cover ? cover.name : current.cover_file ? current.cover_name : input.cover_name,
        now, id,
      );
      if (newAdvert) {
        db.prepare(
          `UPDATE jobs SET advert_file=?, advert_content_type=?, advert_source_url=?, advert_frozen_at=?, advert_error=?
           WHERE id=? AND advert_file IS NULL`,
        ).run(newAdvert.file, newAdvert.contentType, newAdvert.sourceUrl, newAdvert.frozenAt, newAdvert.error, id);
      }

      let addedForNewStatus = false;
      if (events) {
        for (const e of events) {
          if (e.id !== undefined) {
            db.prepare("UPDATE status_events SET status=?, event_date=? WHERE id=? AND job_id=?")
              .run(e.status, e.event_date, e.id, id);
          } else {
            db.prepare("INSERT INTO status_events (job_id, status, event_date, created_at) VALUES (?,?,?,?)")
              .run(id, e.status, e.event_date, now);
            if (e.status === input.status) addedForNewStatus = true;
          }
        }
      }
      if (input.status !== current.status && !addedForNewStatus) {
        db.prepare("INSERT INTO status_events (job_id, status, event_date, created_at) VALUES (?,?,?,?)")
          .run(id, input.status, todayIso(), now);
      }
    });
  } catch (e) {
    for (const s of staged) await Deno.remove(join(folderPath, s.tmp)).catch(() => {});
    if (newAdvert?.file) await Deno.remove(join(folderPath, newAdvert.file)).catch(() => {});
    throw e;
  }

  for (const s of staged) {
    await Deno.rename(join(folderPath, s.tmp), join(folderPath, s.final));
    if (s.old && s.old !== s.final) await Deno.remove(join(folderPath, s.old)).catch(() => {});
  }
  return { job: getJob(db, id), warnings };
}

// ---------- files & export ----------

export function filePathFor(db: DatabaseSync, id: number, kind: string) {
  const r = getRow(db, id);
  const col = kind === "cv" ? "cv_file" : kind === "cover-letter" ? "cover_file" : kind === "advert" ? "advert_file" : null;
  if (!col) throw new HttpError(404, "Unknown file kind.");
  const name = r[col] as string | null;
  if (!name) throw new HttpError(404, "No file stored for this record.");
  const display = kind === "cv" ? r.cv_name : kind === "cover-letter" ? r.cover_name : name;
  return { path: join(FILES_DIR, r.folder, name), name, display: (display as string) || name, kind };
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // guard against spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(db: DatabaseSync): string {
  const rows = db
    .prepare("SELECT job_title, employer_name, agency_name FROM jobs ORDER BY updated_at DESC, id DESC")
    .all() as Row[];
  const lines = [["Job Title", "Employer Name", "Agency Name"].map(csvCell).join(",")];
  for (const r of rows) lines.push([r.job_title, r.employer_name, r.agency_name].map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
