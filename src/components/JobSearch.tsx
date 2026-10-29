import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { fmtDate } from "../format";
import { useStore } from "../store";
import type { SearchHit } from "../types";
import { Icon } from "./ui";

const DEBOUNCE_MS = 250;

type Phase = "idle" | "wait" | "loading" | "ready" | "error";

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

function highlight(text: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      nodes.push(text.slice(i));
      break;
    }
    if (at > i) nodes.push(text.slice(i, at));
    nodes.push(
      <mark key={at} className="rounded-[2px] bg-accent/15 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    i = at + needle.length;
  }
  return nodes;
}

export function JobSearch() {
  const openEdit = useStore((s) => s.openEdit);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dismissedRef = useRef(false);
  const listId = useId();
  const trimmed = query.trim();
  const showClear = query.length > 0;

  useEffect(() => {
    dismissedRef.current = false;
    if (!trimmed) {
      setHits([]);
      setTruncated(false);
      setError(null);
      setOpen(false);
      setPhase("idle");
      setActive(0);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setHits([]);
    setTruncated(false);
    setError(null);
    setOpen(false);
    setPhase("wait");

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setPhase("loading");
      if (!dismissedRef.current) setOpen(true);
      api
        .search(trimmed, ctrl.signal)
        .then((res) => {
          if (cancelled) return;
          setHits(res.items);
          setTruncated(res.truncated);
          setActive(0);
          setPhase("ready");
          if (!dismissedRef.current) setOpen(true);
        })
        .catch((e: unknown) => {
          if (cancelled || isAbort(e)) return;
          setHits([]);
          setError(e instanceof ApiError ? e.message : "Search failed.");
          setPhase("error");
          if (!dismissedRef.current) setOpen(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) {
        dismissedRef.current = true;
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open, hits]);

  function clear() {
    dismissedRef.current = false;
    setQuery("");
    setHits([]);
    setTruncated(false);
    setError(null);
    setOpen(false);
    setPhase("idle");
    inputRef.current?.focus();
  }

  async function choose(hit: SearchHit) {
    if (opening) return;
    setOpening(true);
    try {
      const job = await api.get(hit.job_id);
      openEdit(job);
      setQuery("");
      setHits([]);
      setOpen(false);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open that record.");
      setPhase("error");
      setOpen(true);
    } finally {
      setOpening(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      clear();
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) void choose(hit);
    }
  }

  const activeId = open && hits[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div ref={boxRef} className="relative z-20 mt-4">
      <label htmlFor="job-search" className="sr-only">
        Search employers and roles
      </label>
      <Icon.Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        id="job-search"
        role="combobox"
        className={`input h-9 text-[0.8125rem] ${showClear ? "pr-8 pl-8" : "pl-8"}`}
        placeholder="Search employers and roles"
        value={query}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          dismissedRef.current = false;
          if (trimmed && phase !== "idle" && phase !== "wait") setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showClear
        ? (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-ink-3 hover:bg-raised hover:text-ink"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            <Icon.X className="size-3.5" />
          </button>
        )
        : null}

      {open
        ? (
          <div className="absolute top-full right-0 left-0 mt-1 overflow-hidden rounded-md border border-line-strong bg-surface">
            {phase === "loading" && hits.length === 0
              ? (
                <p className="px-3 py-2.5 text-[0.8125rem] text-ink-3" role="status">
                  Searching…
                </p>
              )
              : null}
            {phase === "error" && error
              ? (
                <p className="px-3 py-2.5 text-[0.8125rem] text-danger" role="alert">
                  {error}
                </p>
              )
              : null}
            {phase === "ready" && hits.length === 0
              ? (
                <p className="px-3 py-2.5 text-[0.8125rem] text-ink-3" role="status">
                  No employers or roles match “{trimmed}”.
                </p>
              )
              : null}
            {hits.length > 0
              ? (
                <ul
                  ref={listRef}
                  id={listId}
                  role="listbox"
                  aria-label="Matching employers and roles"
                  className="menu-scroll max-h-[15rem] overflow-y-auto overscroll-contain"
                >
                  {hits.map((hit, i) => {
                    const employer = hit.kind === "employer";
                    const primary = employer ? (hit.employer_name ?? "") : hit.job_title;
                    const secondary = employer ? hit.job_title : hit.employer_name || "No employer name";
                    const selected = i === active;
                    return (
                      <li key={`${hit.job_id}-${hit.kind}`} role="presentation">
                        <button
                          type="button"
                          id={`${listId}-opt-${i}`}
                          role="option"
                          aria-selected={selected}
                          disabled={opening}
                          className={`flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-left disabled:cursor-wait ${
                            employer ? "border-l-accent" : "border-l-line-strong"
                          } ${selected ? "bg-raised" : "hover:bg-raised"}`}
                          onMouseMove={() => setActive(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void choose(hit)}
                        >
                          <span
                            className={`inline-flex h-5 w-[4.75rem] shrink-0 items-center justify-center rounded-sm border text-[0.625rem] font-semibold tracking-[0.08em] uppercase ${
                              employer ? "border-accent/40 text-accent" : "border-line-strong text-ink-2"
                            }`}
                          >
                            {employer ? "Employer" : "Role"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8125rem] leading-5 font-medium text-ink">
                              {highlight(primary, trimmed)}
                            </span>
                            <span className="block truncate text-[0.6875rem] leading-4 text-ink-3">
                              {secondary}
                            </span>
                          </span>
                          <span
                            className="shrink-0 text-[0.6875rem] text-ink-3 tabular"
                            title={`Added ${fmtDate(hit.created_at)}`}
                          >
                            {fmtDate(hit.created_at)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
              : null}
            {truncated
              ? (
                <p className="border-t border-line px-3 py-1.5 text-xs text-ink-3">
                  Showing the 200 most recent matches. Refine the search to narrow them.
                </p>
              )
              : null}
          </div>
        )
        : null}
    </div>
  );
}
