# Job Hunter Application Tracker

v1.0.1

A calm, secure desktop tracker for the jobs you have applied to - or intend to.
Built as a **Tauri v2** application with a **Deno + SQLite** backend (running as a native sidecar) and a **Vite + React + TypeScript + Tailwind + Zustand** frontend.

## Requirements

- **[Deno](https://deno.com)** 2.2 or newer (uses the built-in `node:sqlite`).
- **[Rust & Tauri Toolchain](https://tauri.app/v1/guides/getting-started/prerequisites)** (for compiling the desktop application).
- VS Code users: Install the official Deno extension and ensure `.vscode/settings.json` restricts Deno strictly to the `server/` directory to avoid conflicting with React types.

## Quick start

### Development

In development, the Deno backend and Vite frontend run concurrently. Tauri acts as the desktop window and proxies requests to the backend.

```sh
deno task setup      # install dependencies (once)
npm run tauri dev    # (or `cargo tauri dev`) Starts the backend, Vite, and the Tauri window
```

### Production Build

Building creates a native OS installer (e.g., `.msi` on Windows). The Deno backend is compiled into a standalone binary sidecar and bundled inside the application.

```sh
npm run tauri build  # (or `cargo tauri build`)
```

_Note: Tauri's `beforeBuildCommand` automatically handles building the Vite frontend and compiling the Deno backend sidecar into `src-tauri/binaries/`._

## Deno Tasks (`deno.json`)

| Task              | What it does                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `setup`           | Installs dependencies.                                                             |
| `dev`             | Runs both `dev:backend` (watch mode) and `dev:frontend` (Vite) via `concurrently`. |
| `build`           | Builds the Vite frontend into `dist/`.                                             |
| `check`           | Type-checks server and frontend.                                                   |
| `compile:windows` | Compiles the standalone backend sidecar for Windows production.                    |
| `smoke`           | End-to-end API smoke test against local files.                                     |

## Data Storage & Portability

Because production applications installed via MSI reside in read-only system folders (like `Program Files`), the application automatically routes your writable data based on the environment:

- **Development (`tauri dev`):**
  Data is stored locally in the project root at `<project_root>/data/`.
- **Production (Installed App):**
  Data is stored in the OS-level user application data directory.
  - Windows: `%APPDATA%\job-hunter-tracker\data`
  - Mac/Linux: `~/.config/job-hunter-tracker/data` (or `$HOME`)

_Back up your records by copying the `data/` folder while the app is closed._

## How it works

**Tauri Sidecar Architecture:** On launch, the Rust core (`src-tauri/src/lib.rs`) spawns the compiled Deno backend as a background process. The React frontend interacts with it via HTTP. Production builds utilize permissive CORS headers in Deno to accept requests from Tauri's custom internal protocols (e.g., `http://tauri.localhost`).

**Pane one — ADD / Edit.** `ADD` expands the _Record an application_ form. Via Employer requires the employer name; via Agency shows and requires the agency name. Validation runs in the browser and again on the server; on any error the message is shown and every entry (including chosen files) is kept so you can retry.

**On Save**

1. The advert at the URL is fetched once and **frozen**: PDF, JPEG and PNG are stored as-is; web pages are stored as an HTML snapshot (with a provenance comment and `<base>` tag). If the site cannot be captured the record is still saved and a warning is shown.
2. A sub-folder `year_month_Employer-name_Agency-name_Job-Title` is created under `data/files/`. CV, cover letter and advert go in it.
3. The record is inserted with the folder and stored file names (relative paths). If anything fails, the half-written folder is removed.

**On Update** — fields are updated; a new CV / cover letter replaces the old file. **The frozen advert is never overwritten**: the server refuses to replace it and a SQLite trigger makes the advert columns immutable once set.

**Pane two — Records.** Cards show star, employer/agency, title, colour-coded status, URL (new tab), View CV / View Cover Letter / View frozen Job Description, and collapsed _Notes_ and _Events_ accordions. Includes pagination, sorting, filtering, and CSV export.

Frozen web pages are served with a `sandbox` Content-Security-Policy so their scripts never run.

## API

| Method | Path                                                                        |                                                                      |
| ------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/jobs?sort=updated\|title\|name\|salary&dir=asc\|desc&status=…&page=1` | paged list (50) with events                                          |
| GET    | `/api/jobs/search?q=…`                                                      | employer-name and job-title matches, newest added first              |
| POST   | `/api/jobs`                                                                 | create (multipart: fields + `cv`, `cover_letter`, optional `advert`) |
| GET    | `/api/jobs/:id`                                                             | one record                                                           |
| PUT    | `/api/jobs/:id`                                                             | update (multipart; `events` = JSON `[{id?, status, event_date}]`)    |
| GET    | `/api/jobs/:id/files/cv\|cover-letter\|advert`                              | view stored file inline (`?download=1` to save)                      |
| GET    | `/api/export.csv`                                                           | export all records                                                   |
| GET    | `/api/health`                                                               | health check                                                         |

## Project layout

```text
src-tauri/  Tauri v2 Rust core (manages window and spawns backend sidecar)
server/     Deno backend (main.ts, jobs.ts, db.ts, freeze.ts, paths.ts)
src/        Vite React frontend (components, Zustand store, API logic)
scripts/    Utility and test scripts
data/       Development data (git-ignored; moves to AppData in production)
.vscode/    Workspace settings (keeps Deno language server isolated to server/)
```
