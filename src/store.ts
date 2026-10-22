import { create } from "zustand";
import { api, ApiError } from "./api";
import type { Job, SortDir, SortKey, Status } from "./types";

type FormMode = { kind: "closed" } | { kind: "add" } | { kind: "edit"; job: Job };
type Theme = "dark" | "light";

interface Notice {
  id: number;
  tone: "success" | "warning";
  text: string;
}

interface State {
  items: Job[];
  total: number;
  page: number;
  pages: number;
  sort: SortKey;
  dir: SortDir;
  status: Status | null;
  loading: boolean;
  listError: string | null;
  form: FormMode;
  theme: Theme;
  notices: Notice[];
  highlightId: number | null;

  load: () => Promise<void>;
  setPage: (p: number) => void;
  setSort: (s: SortKey) => void;
  toggleDir: () => void;
  setStatus: (s: Status | null) => void;
  clearFilters: () => void;
  openAdd: () => void;
  openEdit: (job: Job) => void;
  closeForm: () => void;
  afterSave: (job: Job, warnings: string[], verb: "saved" | "updated") => void;
  toggleTheme: () => void;
  dismissNotice: (id: number) => void;
}

const DEFAULT_DIR: Record<SortKey, SortDir> = { updated: "desc", title: "asc", name: "asc", salary: "desc" };

let seq = 0;
let loadToken = 0;

export const useStore = create<State>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pages: 1,
  sort: "updated",
  dir: "desc",
  status: null,
  loading: false,
  listError: null,
  form: { kind: "closed" },
  theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  notices: [],
  highlightId: null,

  async load() {
    const token = ++loadToken;
    const { page, sort, dir, status } = get();
    set({ loading: true, listError: null });
    try {
      const data = await api.list({ page, sort, dir, status });
      if (token !== loadToken) return;
      set({ items: data.items, total: data.total, page: data.page, pages: data.pages, loading: false });
    } catch (e) {
      if (token !== loadToken) return;
      set({ loading: false, listError: e instanceof ApiError ? e.message : String(e) });
    }
  },
  setPage(p) {
    set({ page: p });
    void get().load();
  },
  setSort(s) {
    set({ sort: s, dir: DEFAULT_DIR[s], page: 1 });
    void get().load();
  },
  toggleDir() {
    set({ dir: get().dir === "asc" ? "desc" : "asc", page: 1 });
    void get().load();
  },
  setStatus(s) {
    set({ status: s, page: 1 });
    void get().load();
  },
  clearFilters() {
    set({ status: null, sort: "updated", dir: "desc", page: 1 });
    void get().load();
  },
  openAdd() {
    set({ form: { kind: "add" } });
  },
  openEdit(job) {
    set({ form: { kind: "edit", job } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  closeForm() {
    set({ form: { kind: "closed" } });
  },
  afterSave(job, warnings, verb) {
    const notices: Notice[] = [
      { id: ++seq, tone: "success", text: `“${job.job_title}” ${verb}.` },
      ...warnings.map((w) => ({ id: ++seq, tone: "warning" as const, text: w })),
    ];
    set({ form: { kind: "closed" }, notices: [...get().notices, ...notices], highlightId: job.id });
    if (verb === "saved") set({ page: 1 });
    void get().load();
    for (const n of notices) {
      if (n.tone === "success") setTimeout(() => get().dismissNotice(n.id), 4000);
    }
  },
  toggleTheme() {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("jh-theme", next);
    } catch {
      /* ignore */
    }
    set({ theme: next });
  },
  dismissNotice(id) {
    set({ notices: get().notices.filter((n) => n.id !== id) });
  },
}));
