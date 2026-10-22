// End-to-end smoke test against the portable build (dist/). Uses a throwaway data folder.
//   deno task build && deno task smoke
const deno = Deno.execPath();
const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = await Deno.makeTempDir({ prefix: "jobhunter-smoke-" });
const entry = new URL("../dist/server/main.ts", import.meta.url);

// Tiny fake job board serving a PDF advert and an HTML advert.
const pdf = new TextEncoder().encode("%PDF-1.4\n% fake advert for smoke test\n%%EOF\n");
const board = Deno.serve({ port: 18788, hostname: "127.0.0.1", onListen() {} }, (req) => {
  const p = new URL(req.url).pathname;
  if (p === "/advert.pdf") return new Response(pdf, { headers: { "content-type": "application/pdf" } });
  if (p === "/advert.html") {
    return new Response("<html><head><title>Role</title></head><body><h1>Senior Analyst</h1><script>alert(1)</script></body></html>", {
      headers: { "content-type": "text/html" },
    });
  }
  return new Response("nope", { status: 404 });
});

const server = new Deno.Command(deno, {
  args: ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-sys", entry.pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  env: { PORT: String(PORT), JOB_HUNTER_DATA: tmp },
  stdout: "piped",
  stderr: "inherit",
}).spawn();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  // 1. Validation: Employer name required via Employer; data rejected, nothing written.
  {
    const fd = new FormData();
    fd.set("job_title", "Analyst");
    fd.set("via", "Employer");
    fd.set("status", "Applied");
    const r = await fetch(`${BASE}/api/jobs`, { method: "POST", body: fd });
    const b = await r.json();
    check("validation rejects missing employer", r.status === 422 && !!b.fieldErrors?.employer_name, JSON.stringify(b.fieldErrors));
  }
  {
    const fd = new FormData();
    fd.set("job_title", "Analyst");
    fd.set("via", "Agency");
    fd.set("status", "Bogus");
    const r = await fetch(`${BASE}/api/jobs`, { method: "POST", body: fd });
    const b = await r.json();
    check("validation rejects missing agency + bad status", r.status === 422 && !!b.fieldErrors?.agency_name && !!b.fieldErrors?.status);
  }

  // 2. Create via employer with URL (PDF advert) + CV + cover letter.
  const fd = new FormData();
  fd.set("is_starred", "1");
  fd.set("job_title", "Senior Data Analyst");
  fd.set("via", "Employer");
  fd.set("employer_name", "Acme Ltd");
  fd.set("contract_type", "Permanent");
  fd.set("salary_offer", "£55,000");
  fd.set("contact_person", "Jane Smith");
  fd.set("url", "http://127.0.0.1:18788/advert.pdf");
  fd.set("status", "Applied");
  fd.set("record_date", "2026-10-19");
  fd.set("notes", "## Notes\n- **Strong** fit\n- Follow up Friday");
  fd.set("cv", new File(["CV v3 content"], "CV v3.pdf", { type: "application/pdf" }));
  fd.set("cover_letter", new File(["Dear hiring manager"], "cover.docx"));
  const created = await fetch(`${BASE}/api/jobs`, { method: "POST", body: fd });
  const c = await created.json();
  const job = c.job;
  check("create returns 201", created.status === 201, `id=${job?.id}`);
  check("subfolder name", job?.folder === "2026_10_Acme-Ltd_Senior-Data-Analyst", job?.folder);
  check("advert frozen as PDF", job?.advert?.path?.endsWith("Job-advert.pdf"), job?.advert?.path);
  check("cv + cover stored", !!job?.cv && !!job?.cover_letter);
  check("initial status event", job?.events?.length === 1 && job.events[0].status === "Applied");
  const onDisk = [...Deno.readDirSync(`${tmp}/files/${job.folder}`)].map((e) => e.name).sort();
  check("files on disk", onDisk.length === 3, onDisk.join(", "));

  // 3. Create via agency with HTML advert.
  const fd2 = new FormData();
  fd2.set("job_title", "Contract BI Developer");
  fd2.set("via", "Agency");
  fd2.set("agency_name", "Hays");
  fd2.set("contract_type", "Contract");
  fd2.set("salary_offer", "£500/day");
  fd2.set("url", "http://127.0.0.1:18788/advert.html");
  fd2.set("status", "Interested");
  const c2 = await (await fetch(`${BASE}/api/jobs`, { method: "POST", body: fd2 })).json();
  check("agency record + HTML snapshot", c2.job?.advert?.path?.endsWith("Job-advert.html") && c2.job.folder.includes("Hays"), c2.job?.folder);
  const html = await fetch(`${BASE}/api/jobs/${c2.job.id}/files/advert`);
  check("HTML advert served sandboxed", (html.headers.get("content-security-policy") ?? "").includes("sandbox"));
  await html.body?.cancel();

  // 4. Unreachable URL → record saved, warning returned.
  const fd3 = new FormData();
  fd3.set("job_title", "Analyst");
  fd3.set("via", "Employer");
  fd3.set("employer_name", "Beta plc");
  fd3.set("url", "http://127.0.0.1:18788/missing");
  fd3.set("status", "Closed");
  const c3 = await (await fetch(`${BASE}/api/jobs`, { method: "POST", body: fd3 })).json();
  check("freeze failure is a warning, not data loss", !!c3.job && c3.warnings.length === 1, c3.warnings[0]);

  // 5. List, sort, filter.
  const list = await (await fetch(`${BASE}/api/jobs`)).json();
  check("list returns 3", list.total === 3 && list.items.length === 3);
  const bySalary = await (await fetch(`${BASE}/api/jobs?sort=salary&dir=desc`)).json();
  check("sort by salary", bySalary.items[0].salary_offer === "£55,000", bySalary.items.map((j: { salary_offer: string }) => j.salary_offer).join(" | "));
  const byName = await (await fetch(`${BASE}/api/jobs?sort=name&dir=asc`)).json();
  check("sort by employer/agency name", byName.items.map((j: { employer_name: string; agency_name: string }) => j.employer_name ?? j.agency_name).join(",") === "Acme Ltd,Beta plc,Hays");
  const filt = await (await fetch(`${BASE}/api/jobs?status=Interested`)).json();
  check("filter by status", filt.total === 1 && filt.items[0].status === "Interested");

  // 6. Update: change status, edit event date, replace CV, try to replace advert (must be refused).
  const advertBefore = await Deno.readFile(`${tmp}/files/${job.folder}/Job-advert.pdf`);
  const up = new FormData();
  for (const [k, v] of Object.entries({
    is_starred: "1", job_title: "Senior Data Analyst", via: "Employer", employer_name: "Acme Ltd",
    contract_type: "Permanent", salary_offer: "£58,000", contact_person: "Jane Smith",
    url: "http://127.0.0.1:18788/advert.html", status: "Going to interview", record_date: "2026-10-19", notes: "Updated",
  })) up.set(k, v);
  up.set("events", JSON.stringify([
    { id: job.events[0].id, status: "Applied", event_date: "2026-10-18" },
    { status: "Going to interview", event_date: "2026-10-25" },
  ]));
  up.set("cv", new File(["CV v4 content"], "CV v4.pdf"));
  up.set("advert", new File(["%PDF-1.4 tampered"], "fake.pdf"));
  const ur = await fetch(`${BASE}/api/jobs/${job.id}`, { method: "PUT", body: up });
  const u = await ur.json();
  check("update ok", ur.status === 200, u.error ?? "");
  check("status events appended", u.job?.events?.map((e: { status: string; event_date: string }) => `${e.event_date}:${e.status}`).join(",") === "2026-10-18:Applied,2026-10-25:Going to interview");
  check("CV replaced", u.job?.cv?.name === "CV v4.pdf");
  const filesAfter = [...Deno.readDirSync(`${tmp}/files/${job.folder}`)].map((e) => e.name).sort();
  check("old CV removed, no temp files", filesAfter.length === 3 && !filesAfter.some((n) => n.startsWith(".")), filesAfter.join(", "));
  const advertAfter = await Deno.readFile(`${tmp}/files/${job.folder}/Job-advert.pdf`);
  check("frozen advert untouched", advertAfter.length === advertBefore.length && advertAfter.every((b, i) => b === advertBefore[i]));
  check("advert replacement refused with warning", u.warnings?.some((w: string) => w.includes("not replaced")));
  check("advert metadata unchanged", u.job?.advert?.source_url === job.advert.source_url);

  // 7. File download.
  const cvRes = await fetch(`${BASE}/api/jobs/${job.id}/files/cv`);
  check("CV download", cvRes.ok && (await cvRes.text()) === "CV v4 content");

  // 8. CSV export.
  const csvRes = await fetch(`${BASE}/api/export.csv`);
  const csv = (await csvRes.text()).replace(/^\uFEFF/, "");
  const lines = csv.trim().split("\r\n");
  check("CSV export header", lines[0] === "Job Title,Employer Name,Agency Name", lines[0]);
  check("CSV export rows", lines.length === 4, `${lines.length - 1} rows`);
  console.log("\n--- export.csv ---\n" + csv);

  // 9. Front-end served.
  const idx = await fetch(`${BASE}/`);
  check("front-end index served", idx.ok && (await idx.text()).includes('id="root"'));
} finally {
  server.kill();
  await server.status;
  await server.stdout.cancel().catch(() => {});
  await board.shutdown();
  await Deno.remove(tmp, { recursive: true }).catch(() => {});
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll smoke checks passed.");
Deno.exit(failures ? 1 : 0);
