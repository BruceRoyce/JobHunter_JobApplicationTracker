import { api } from "../api";
import { useStore } from "../store";
import { STATUSES, type SortKey, type Status } from "../types";
import { JobCard } from "./JobCard";
import { JobSearch } from "./JobSearch";
import { Button, Icon } from "./ui";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Last update date",
  title: "Job title",
  name: "Employer / Agency name",
  salary: "Salary",
};

export function ListPane() {
  const { items, total, page, pages, sort, dir, status, loading, listError } = useStore();
  const { setSort, toggleDir, setStatus, clearFilters, setPage, load } = useStore.getState();
  const filtered = status !== null || sort !== "updated" || dir !== "desc";

  return (
    <section aria-labelledby="records-title" className="mt-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Applications</p>
          <h2 id="records-title" className="mt-0.5 text-[1.0625rem] font-semibold text-ink/90">
            Records <span className="ml-1 text-sm font-normal text-ink-3 tabular">{total}</span>
          </h2>
        </div>
        <a
          href={api.exportUrl}
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line px-3 text-[0.8125rem] font-medium text-ink-2 hover:text-ink hover:border-line-strong"
        >
          <Icon.Download className="size-3.5" /> Export All
        </a>
      </div>

      <JobSearch />

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface px-4 py-3">
        <div>
          <label htmlFor="sort" className="field-label">Sort by</label>
          <div className="flex gap-1">
            <select
              id="sort"
              className="input h-8 w-auto py-0 text-[0.8125rem]"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="quiet"
              className="h-8 w-8 px-0"
              onClick={toggleDir}
              aria-label={dir === "asc" ? "Ascending — switch to descending" : "Descending — switch to ascending"}
              title={dir === "asc" ? "Ascending" : "Descending"}
            >
              <Icon.Arrow className={`size-3.5 ${dir === "asc" ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>
        <div>
          <label htmlFor="status-filter" className="field-label">Status</label>
          <select
            id="status-filter"
            className="input h-8 w-auto py-0 text-[0.8125rem]"
            value={status ?? ""}
            onChange={(e) => setStatus((e.target.value || null) as Status | null)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button size="sm" variant="ghost" className="h-8" onClick={clearFilters} disabled={!filtered}>
          <Icon.X className="size-3.5" /> Clear filters
        </Button>
      </div>

      <div className="mt-4 grid gap-3" aria-live="polite" aria-busy={loading}>
        {listError ? (
          <div role="alert" className="rounded-md border border-danger/40 px-4 py-3 text-sm text-danger">
            {listError}{" "}
            <button type="button" className="underline cursor-pointer" onClick={() => void load()}>Retry</button>
          </div>
        ) : null}
        {!listError && !loading && items.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
            <p className="font-display text-sm font-medium text-ink-2">
              {status ? `No records with status “${status}”.` : "No applications recorded yet."}
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-3">
              {status ? "Clear the filter to see everything." : "Use ADD to record the first one."}
            </p>
          </div>
        ) : null}
        {items.map((j) => <JobCard key={j.id} job={j} />)}
      </div>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 text-[0.8125rem]">
          <Button size="sm" variant="quiet" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <ol className="flex flex-wrap items-center gap-1">
            {pageList(page, pages).map((p, i) =>
              p === "…" ? <li key={`g${i}`} className="px-1 text-ink-3">…</li> : (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={`h-7 min-w-7 rounded-sm px-2 tabular cursor-pointer ${
                      p === page ? "bg-accent text-accent-ink font-semibold" : "text-ink-2 hover:bg-raised hover:text-ink"
                    }`}
                  >
                    {p}
                  </button>
                </li>
              )
            )}
          </ol>
          <Button size="sm" variant="quiet" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      ) : null}
      {total > 0 ? (
        <p className="mt-3 text-center text-xs text-ink-3 tabular">
          Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
        </p>
      ) : null}
    </section>
  );
}

function pageList(page: number, pages: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}
