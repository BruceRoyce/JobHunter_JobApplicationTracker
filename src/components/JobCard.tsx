import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { fmtDate, fmtDateTime, hostOf, todayIso } from "../format";
import { useStore } from "../store";
import { STATUSES, type Job, type Status } from "../types";
import { Markdown } from "./Markdown";
import { Accordion, Button, FieldError, Icon, LinkButton, StatusBadge } from "./ui";

export function JobCard({ job }: { job: Job }) {
  const openEdit = useStore((s) => s.openEdit);
  const applyJob = useStore((s) => s.applyJob);
  const editing = useStore((s) => s.form.kind === "edit" && s.form.job.id === job.id);
  const [adding, setAdding] = useState(false);
  const highlight = useStore((s) => s.highlightId === job.id);
  const primaryName = job.via === "Agency" ? job.agency_name : job.employer_name;
  const secondary = job.via === "Agency" && job.employer_name ? `for ${job.employer_name}` : null;
  const details = [
    job.contract_type,
    job.salary_offer,
    job.contact_person ? `Contact: ${job.contact_person}` : null,
  ].filter(Boolean) as string[];
  const events = [...job.events].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.id - b.id);

  return (
    <article
      className={`rounded-md border bg-surface ${
        editing ? "border-accent" : highlight ? "border-line-strong" : "border-line"
      }`}
      aria-label={`${job.job_title}${primaryName ? `, ${primaryName}` : ""}`}
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow truncate">
              <span className="sr-only">Via {job.via}: </span>
              {job.via === "Agency" ? "Agency · " : ""}
              {primaryName}
              {secondary ? <span className="normal-case tracking-normal"> {secondary}</span> : null}
            </p>
            <h3 className="mt-0.5 flex items-center gap-2 text-[1.0625rem] leading-snug font-semibold text-ink">
              {job.is_starred ? (
                <Icon.StarFilled className="size-4 shrink-0 text-accent" />
              ) : null}
              {job.is_starred ? <span className="sr-only">Starred. </span> : null}
              <span className="min-w-0 break-words">{job.job_title}</span>
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={job.status} />
            <span className="text-xs text-ink-3 tabular" title={`Last updated ${fmtDateTime(job.updated_at)}`}>
              {fmtDate(job.record_date)}
            </span>
          </div>
        </div>

        {details.length || job.url ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-2">
            {details.map((d, i) => (
              <span key={i} className="tabular">{d}</span>
            ))}
            {job.url ? (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-accent hover:underline underline-offset-2"
              >
                <span className="truncate max-w-64">{hostOf(job.url)}</span>
                <Icon.External className="size-3.5 shrink-0" />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <LinkButton
            href={api.fileUrl(job.id, "cv")}
            disabled={!job.cv}
            title={job.cv ? job.cv.name : job.cv_name ? `Not stored — recorded as “${job.cv_name}”` : "No CV stored"}
          >
            <Icon.File className="size-3.5" /> View CV
          </LinkButton>
          <LinkButton
            href={api.fileUrl(job.id, "cover-letter")}
            disabled={!job.cover_letter}
            title={job.cover_letter
              ? job.cover_letter.name
              : job.cover_name
              ? `Not stored — recorded as “${job.cover_name}”`
              : "No cover letter stored"}
          >
            <Icon.File className="size-3.5" /> View Cover Letter
          </LinkButton>
          <LinkButton
            href={api.fileUrl(job.id, "advert")}
            disabled={!job.advert}
            title={job.advert
              ? `Frozen ${fmtDateTime(job.advert.frozen_at)}`
              : job.advert_error ?? "No job description was frozen"}
          >
            <Icon.Lock className="size-3.5" /> View frozen Job Description
          </LinkButton>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={editing || adding}>
              <Icon.Plus className="size-3.5" /> Add Event
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openEdit(job)} disabled={editing}>
              <Icon.Edit className="size-3.5" /> Edit
            </Button>
          </div>
        </div>
        {adding ? (
          <AddEventForm
            jobId={job.id}
            onCancel={() => setAdding(false)}
            onSaved={(saved) => {
              setAdding(false);
              applyJob(saved);
            }}
          />
        ) : null}
        {(!job.cv && job.cv_name) || (!job.cover_letter && job.cover_name) ? (
          <p className="mt-2 text-xs text-ink-3">
            {!job.cv && job.cv_name ? <>CV: {job.cv_name}</> : null}
            {!job.cv && job.cv_name && !job.cover_letter && job.cover_name ? " · " : null}
            {!job.cover_letter && job.cover_name ? <>Cover letter: {job.cover_name}</> : null}
          </p>
        ) : null}
      </div>

      <div className="px-5">
        <Accordion title="Notes" meta={job.notes.trim() ? null : "Empty"}>
          {job.notes.trim() ? <Markdown source={job.notes} /> : <p className="text-sm text-ink-3">No notes.</p>}
        </Accordion>
        <Accordion title="Events" meta={`${events.length}`}>
          {events.length ? (
            <ol className="relative grid gap-2 border-l border-line pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                  <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full border border-line-strong bg-surface" />
                  <time dateTime={e.event_date} className="w-24 shrink-0 text-ink-3 tabular">{fmtDate(e.event_date)}</time>
                  <StatusBadge status={e.status} />
                  {e.description ? (
                    <span className="min-w-0 basis-full text-ink-2 break-words sm:basis-auto">{e.description}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-ink-3">No events.</p>}
        </Accordion>
      </div>
    </article>
  );
}

function AddEventForm({
  jobId,
  onCancel,
  onSaved,
}: {
  jobId: number;
  onCancel: () => void;
  onSaved: (job: Job) => void;
}) {
  const formId = useId();
  const dateRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayIso);
  const [status, setStatus] = useState<Status | "">("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!date) next.event_date = "Enter a date.";
    if (!status) next.status = "Choose an event type.";
    setErrors(next);
    setFormError(next.event_date || next.status ? "Please correct the highlighted fields." : null);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const res = await api.addEvent(jobId, { status, event_date: date, description });
      onSaved(res.job);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError(String(err));
      }
      setSaving(false);
    }
  }

  return (
    <form
      className="mt-3 grid gap-3 rounded-sm border border-line bg-raised p-3"
      aria-label="Add event"
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="field-label" htmlFor={`${formId}-date`}>
            Date <span className="text-ink-3">*</span>
          </label>
          <input
            ref={dateRef}
            id={`${formId}-date`}
            type="date"
            required
            className="input h-8 w-full py-0 text-[0.8125rem] tabular"
            value={date}
            aria-invalid={errors.event_date ? true : undefined}
            aria-describedby={errors.event_date ? `${formId}-date-error` : undefined}
            onChange={(e) => setDate(e.target.value)}
          />
          <FieldError id={`${formId}-date-error`} message={errors.event_date} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${formId}-type`}>
            Event type <span className="text-ink-3">*</span>
          </label>
          <select
            id={`${formId}-type`}
            required
            className="input h-8 w-full py-0 text-[0.8125rem]"
            value={status}
            aria-invalid={errors.status ? true : undefined}
            aria-describedby={errors.status ? `${formId}-type-error` : undefined}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="">Choose an event</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <FieldError id={`${formId}-type-error`} message={errors.status} />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor={`${formId}-desc`}>Description</label>
        <input
          id={`${formId}-desc`}
          type="text"
          maxLength={280}
          className="input h-8 w-full py-0 text-[0.8125rem]"
          placeholder="Optional note"
          value={description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${formId}-desc-error` : undefined}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FieldError id={`${formId}-desc-error`} message={errors.description} />
      </div>
      {formError ? (
        <p role="alert" className="text-xs font-medium text-danger">{formError}</p>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="quiet" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
