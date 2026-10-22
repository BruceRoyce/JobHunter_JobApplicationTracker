import { api } from "../api";
import { fmtDate, fmtDateTime, hostOf } from "../format";
import { useStore } from "../store";
import type { Job } from "../types";
import { Markdown } from "./Markdown";
import { Accordion, Button, Icon, LinkButton, StatusBadge } from "./ui";

export function JobCard({ job }: { job: Job }) {
  const openEdit = useStore((s) => s.openEdit);
  const editing = useStore((s) => s.form.kind === "edit" && s.form.job.id === job.id);
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
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openEdit(job)} disabled={editing}>
            <Icon.Edit className="size-3.5" /> Edit
          </Button>
        </div>
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
                <li key={e.id} className="relative flex items-center gap-3 text-[0.8125rem]">
                  <span className="absolute -left-[1.3rem] size-2 rounded-full border border-line-strong bg-surface" />
                  <time dateTime={e.event_date} className="w-24 shrink-0 text-ink-3 tabular">{fmtDate(e.event_date)}</time>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-ink-3">No events.</p>}
        </Accordion>
      </div>
    </article>
  );
}
