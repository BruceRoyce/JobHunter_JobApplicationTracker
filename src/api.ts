import type { JobList, SaveResult, SortDir, SortKey } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

// Dev uses the Vite proxy (relative URLs). Production is set from the sidecar's ready line.
let apiBase = "";

export function setApiBase(url: string) {
  apiBase = url.replace(/\/$/, "");
}

async function handle<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const b = (body ?? {}) as {
      error?: string;
      fieldErrors?: Record<string, string>;
    };
    throw new ApiError(
      b.error ?? `Request failed (HTTP ${res.status}).`,
      res.status,
      b.fieldErrors ?? {},
    );
  }
  return body as T;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError(
      "Cannot reach the Job Hunter server. Check it is running, then try again.",
      0,
    );
  }
  return handle<T>(res);
}

export const api = {
  list(params: {
    page: number;
    sort: SortKey;
    dir: SortDir;
    status: string | null;
  }) {
    const q = new URLSearchParams({
      page: String(params.page),
      sort: params.sort,
      dir: params.dir,
    });
    if (params.status) q.set("status", params.status);
    return request<JobList>(`${apiBase}/api/jobs?${q}`);
  },
  create(form: FormData) {
    return request<SaveResult>(`${apiBase}/api/jobs`, {
      method: "POST",
      body: form,
    });
  },
  update(id: number, form: FormData) {
    return request<SaveResult>(`${apiBase}/api/jobs/${id}`, {
      method: "PUT",
      body: form,
    });
  },
  fileUrl(id: number, kind: "cv" | "cover-letter" | "advert") {
    return `${apiBase}/api/jobs/${id}/files/${kind}`;
  },
  get exportUrl() {
    return `${apiBase}/api/export.csv`;
  },
};
