import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "../api";
import { fmtDateTime, todayIso } from "../format";
import { useStore } from "../store";
import {
  STATUSES,
  type ContractType,
  type Job,
  type Status,
  type Via,
} from "../types";
import { Button, FieldError, Icon, RadioGroup } from "./ui";
import { Markdown } from "./Markdown";

interface Values {
  is_starred: boolean;
  job_title: string;
  via: Via;
  agency_name: string;
  employer_name: string;
  contract_type: ContractType | "";
  salary_offer: string;
  contact_person: string;
  url: string;
  status: Status | "";
  record_date: string;
  cv_name: string;
  cover_name: string;
  notes: string;
}

interface EventRow {
  key: string;
  id?: number;
  status: Status;
  event_date: string;
}

function initialValues(job?: Job): Values {
  return {
    is_starred: job?.is_starred ?? false,
    job_title: job?.job_title ?? "",
    via: job?.via ?? "Employer",
    agency_name: job?.agency_name ?? "",
    employer_name: job?.employer_name ?? "",
    contract_type: job?.contract_type ?? "",
    salary_offer: job?.salary_offer ?? "",
    contact_person: job?.contact_person ?? "",
    url: job?.url ?? "",
    status: job?.status ?? "",
    record_date: job?.record_date ?? todayIso(),
    cv_name: job?.cv ? "" : (job?.cv_name ?? ""),
    cover_name: job?.cover_letter ? "" : (job?.cover_name ?? ""),
    notes: job?.notes ?? "",
  };
}

function validate(v: Values): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.job_title.trim()) e.job_title = "Job title is required.";
  if (v.via === "Employer" && !v.employer_name.trim()) {
    e.employer_name =
      "Employer name is required when applying via an employer.";
  }
  if (v.via === "Agency" && !v.agency_name.trim()) {
    e.agency_name = "Agency name is required when applying via an agency.";
  }
  if (!v.status) e.status = "Choose a status.";
  if (!v.record_date) e.record_date = "Enter a date.";
  if (v.url.trim()) {
    try {
      const u = new URL(v.url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      e.url = "Enter a full web address starting with http:// or https://.";
    }
  }
  return e;
}

export function JobForm({ job }: { job?: Job }) {
  const isEdit = !!job;
  const closeForm = useStore((s) => s.closeForm);
  const afterSave = useStore((s) => s.afterSave);
  const [v, setV] = useState<Values>(() => initialValues(job));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [events, setEvents] = useState<EventRow[]>(() =>
    (job?.events ?? []).map((e) => ({
      key: `e${e.id}`,
      id: e.id,
      status: e.status,
      event_date: e.event_date,
    })),
  );
  const [pendingDate, setPendingDate] = useState(todayIso());
  const cvRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const advertRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const statusChanged = isEdit && v.status !== "" && v.status !== job!.status;
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          a.event_date.localeCompare(b.event_date) ||
          (a.id ?? 1e12) - (b.id ?? 1e12),
      ),
    [events],
  );

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
    if (errors[k as string])
      setErrors(({ [k as string]: _omit, ...rest }) => rest);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const clientErrors = validate(v);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setFormError("Please correct the highlighted fields.");
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>(
            '[aria-invalid="true"], fieldset[aria-describedby] input',
          )
          ?.focus();
      });
      return;
    }
    const fd = new FormData();
    fd.set("is_starred", v.is_starred ? "1" : "0");
    for (const k of [
      "job_title",
      "via",
      "employer_name",
      "agency_name",
      "contract_type",
      "salary_offer",
      "contact_person",
      "url",
      "status",
      "record_date",
      "cv_name",
      "cover_name",
      "notes",
    ] as const)
      fd.set(k, String(v[k]));
    const cv = cvRef.current?.files?.[0];
    const cover = coverRef.current?.files?.[0];
    const advert = advertRef.current?.files?.[0];
    if (cv) fd.set("cv", cv);
    if (cover) fd.set("cover_letter", cover);
    if (advert) fd.set("advert", advert);
    if (isEdit) {
      const payload = events.map((ev) => ({
        id: ev.id,
        status: ev.status,
        event_date: ev.event_date,
      }));
      if (statusChanged)
        payload.push({
          id: undefined,
          status: v.status as Status,
          event_date: pendingDate,
        });
      fd.set("events", JSON.stringify(payload));
    }
    setSaving(true);
    try {
      const res = isEdit ? await api.update(job!.id, fd) : await api.create(fd);
      afterSave(res.job, res.warnings, isEdit ? "updated" : "saved");
    } catch (err) {
      // Keep everything the user entered so they can correct and retry.
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError(String(err));
      }
      setSaving(false);
    }
  }

  const inv = (k: string) =>
    errors[k]
      ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` }
      : {};

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="fade-in"
      aria-busy={saving}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
        <div>
          <p className="eyebrow">{isEdit ? "Edit record" : "New record"}</p>
          <h2 className="mt-0.5 text-[1.0625rem] font-semibold text-ink/90">
            {isEdit ? job!.job_title : "Record an application"}
          </h2>
        </div>
        <label className="inline-flex items-center gap-2 h-8 px-3 rounded-sm border border-line text-[0.8125rem] text-ink-2 cursor-pointer hover:border-line-strong hover:text-ink select-none">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={v.is_starred}
            onChange={(e) => set("is_starred", e.target.checked)}
          />
          {v.is_starred ? (
            <Icon.StarFilled className="size-4 text-accent" />
          ) : (
            <Icon.Star className="size-4" />
          )}
          <span className="peer-focus-visible:underline">Star</span>
        </label>
      </div>

      <div className="grid gap-5 px-6 py-5">
        <Field
          label="Job title"
          name="job_title"
          required
          error={errors.job_title}
        >
          <input
            id="job_title"
            className="input"
            value={v.job_title}
            onChange={(e) => set("job_title", e.target.value)}
            autoFocus
            autoComplete="off"
            {...inv("job_title")}
          />
        </Field>

        <RadioGroup
          name="via"
          label="Via"
          value={v.via}
          onChange={(x) => set("via", x)}
          options={[
            { value: "Employer", label: "Employer" },
            { value: "Agency", label: "Agency" },
          ]}
          error={errors.via}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          {v.via === "Agency" ? (
            <Field
              label="Agency name"
              name="agency_name"
              required
              error={errors.agency_name}
            >
              <input
                id="agency_name"
                className="input"
                value={v.agency_name}
                onChange={(e) => set("agency_name", e.target.value)}
                {...inv("agency_name")}
              />
            </Field>
          ) : null}
          <Field
            label="Employer name"
            name="employer_name"
            required={v.via === "Employer"}
            hint={
              v.via === "Agency" ? "Optional when via an agency" : undefined
            }
            error={errors.employer_name}
          >
            <input
              id="employer_name"
              className="input"
              value={v.employer_name}
              onChange={(e) => set("employer_name", e.target.value)}
              {...inv("employer_name")}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <RadioGroup
            name="contract_type"
            label="Type"
            value={v.contract_type}
            onChange={(x) => set("contract_type", x)}
            options={[
              { value: "Contract", label: "Contract" },
              { value: "Permanent", label: "Permanent" },
            ]}
            error={errors.contract_type}
          />
          <Field
            label="Salary offer"
            name="salary_offer"
            error={errors.salary_offer}
          >
            <input
              id="salary_offer"
              className="input tabular"
              placeholder="e.g. £55,000 or £450/day"
              value={v.salary_offer}
              onChange={(e) => set("salary_offer", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Contact person"
            name="contact_person"
            error={errors.contact_person}
          >
            <input
              id="contact_person"
              className="input"
              value={v.contact_person}
              onChange={(e) => set("contact_person", e.target.value)}
            />
          </Field>
          <Field
            label="Date"
            name="record_date"
            required
            error={errors.record_date}
          >
            <input
              id="record_date"
              type="date"
              className="input tabular"
              value={v.record_date}
              onChange={(e) => set("record_date", e.target.value)}
              {...inv("record_date")}
            />
          </Field>
        </div>

        <Field
          label="URL"
          name="url"
          error={errors.url}
          hint={
            isEdit && job!.advert
              ? "The frozen job advert is kept as captured, even if this changes."
              : "The advert at this address is captured and frozen on save."
          }
        >
          <input
            id="url"
            type="url"
            inputMode="url"
            className="input"
            placeholder="https://"
            value={v.url}
            onChange={(e) => set("url", e.target.value)}
            {...inv("url")}
          />
        </Field>

        <RadioGroup
          name="status"
          label="Status"
          required
          value={v.status}
          onChange={(x) => set("status", x)}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          error={errors.status}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FileField
            label="CV used"
            name="cv"
            inputRef={cvRef}
            current={job?.cv?.name}
            nameValue={v.cv_name}
            onName={(x) => set("cv_name", x)}
            error={errors.cv}
          />
          <FileField
            label="Cover letter used"
            name="cover_letter"
            inputRef={coverRef}
            current={job?.cover_letter?.name}
            nameValue={v.cover_name}
            onName={(x) => set("cover_name", x)}
            error={errors.cover_letter}
          />
        </div>

        {isEdit && job!.advert ? (
          <div className="flex items-start gap-3 rounded-sm border border-line bg-raised px-3.5 py-3 text-[0.8125rem]">
            <Icon.Lock className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-ink">
                Frozen job description · locked
              </p>
              <p className="text-ink-3">
                Captured {fmtDateTime(job!.advert.frozen_at)}. Historic evidence
                — it is never overwritten.
              </p>
            </div>
          </div>
        ) : (
          <Field
            label="Job description file"
            name="advert"
            error={errors.advert}
            hint={
              isEdit
                ? "No advert has been frozen yet. Upload one (PDF, JPEG, PNG or HTML), or Update retries the URL. Once frozen it is locked."
                : "Optional. Use if the URL cannot be captured (PDF, JPEG, PNG or HTML). Frozen and locked once saved."
            }
          >
            <input
              id="advert"
              ref={advertRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.html,.htm"
              className="input"
              {...inv("advert")}
            />
          </Field>
        )}

        <div>
          <div className="flex items-end justify-between">
            <label htmlFor="notes" className="field-label">
              Notes
            </label>
            <div
              className="mb-1.5 flex gap-1 text-xs"
              role="tablist"
              aria-label="Notes mode"
            >
              {(["Write", "Preview"] as const).map((m) => {
                const active = (m === "Preview") === preview;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPreview(m === "Preview")}
                    className={`px-2 py-0.5 rounded-sm cursor-pointer ${
                      active
                        ? "bg-raised text-ink border border-line"
                        : "text-ink-3 hover:text-ink border border-transparent"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          {preview ? (
            <div className="min-h-32 rounded-sm border border-line bg-raised px-3 py-2.5">
              {v.notes.trim() ? (
                <Markdown source={v.notes} />
              ) : (
                <p className="text-sm text-ink-3">Nothing to preview.</p>
              )}
            </div>
          ) : (
            <textarea
              id="notes"
              className="input min-h-32 resize-y font-[inherit] leading-relaxed"
              placeholder="Markdown supported — **bold**, lists, links…"
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          )}
        </div>

        {isEdit ? (
          <fieldset>
            <legend className="field-label">Status history</legend>
            <ol className="divide-y divide-line rounded-sm border border-line">
              {sortedEvents.map((ev) => (
                <li
                  key={ev.key}
                  className="flex flex-wrap items-center gap-3 px-3 py-2"
                >
                  <select
                    aria-label="Status"
                    className="input h-8 w-auto py-0 text-[0.8125rem]"
                    value={ev.status}
                    onChange={(e) =>
                      setEvents((list) =>
                        list.map((x) =>
                          x.key === ev.key
                            ? { ...x, status: e.target.value as Status }
                            : x,
                        ),
                      )
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    aria-label={`Date for ${ev.status}`}
                    className="input h-8 w-auto py-0 text-[0.8125rem] tabular"
                    value={ev.event_date}
                    required
                    onChange={(e) =>
                      setEvents((list) =>
                        list.map((x) =>
                          x.key === ev.key
                            ? { ...x, event_date: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </li>
              ))}
              {statusChanged ? (
                <li className="flex flex-wrap items-center gap-3 bg-accent/5 px-3 py-2">
                  <span className="text-[0.8125rem] text-ink">
                    <span className="eyebrow mr-2">New</span>
                    {v.status}
                  </span>
                  <input
                    type="date"
                    aria-label={`Date for new status ${v.status}`}
                    className="input ml-auto h-8 w-auto py-0 text-[0.8125rem] tabular"
                    value={pendingDate}
                    onChange={(e) => setPendingDate(e.target.value)}
                  />
                </li>
              ) : null}
              {!sortedEvents.length && !statusChanged ? (
                <li className="px-3 py-2 text-sm text-ink-3">
                  No status changes recorded.
                </li>
              ) : null}
            </ol>
            <FieldError
              id="events-error"
              message={
                Object.entries(errors).find(([k]) =>
                  k.startsWith("events"),
                )?.[1]
              }
            />
          </fieldset>
        ) : null}
      </div>

      {formError ? (
        <div
          role="alert"
          className="mx-6 mb-4 flex items-start gap-2.5 rounded-sm border border-danger/40 bg-danger/8 px-3.5 py-2.5 text-[0.8125rem] text-danger"
        >
          <Icon.Alert className="mt-0.5 size-4 shrink-0" />
          <span>
            {formError}{" "}
            <span className="text-ink-2">
              Your entries have been kept — correct them and try again.
            </span>
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={closeForm} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          className="min-w-28"
        >
          {saving
            ? isEdit
              ? "Updating…"
              : "Saving…"
            : isEdit
              ? "Update"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {required ? <span className="text-ink-3"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
      ) : null}
      <FieldError id={`${name}-error`} message={error} />
    </div>
  );
}

function FileField({
  label,
  name,
  inputRef,
  current,
  nameValue,
  onName,
  error,
}: {
  label: string;
  name: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  current?: string;
  nameValue: string;
  onName: (v: string) => void;
  error?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input
        id={name}
        ref={inputRef}
        type="file"
        className="input"
        onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
        aria-invalid={error ? true : undefined}
      />
      {current ? (
        <p className="mt-1.5 truncate text-xs text-ink-3" title={current}>
          {picked ? (
            <>
              Will replace <span className="text-ink-2">{current}</span>
            </>
          ) : (
            <>
              Current: <span className="text-ink-2">{current}</span>
            </>
          )}
        </p>
      ) : !picked ? (
        <input
          aria-label={`${label} — file name`}
          className="input mt-1.5 h-8 py-0 text-[0.8125rem]"
          placeholder="…or type the file name"
          value={nameValue}
          onChange={(e) => onName(e.target.value)}
        />
      ) : null}
      <FieldError id={`${name}-error`} message={error} />
    </div>
  );
}
