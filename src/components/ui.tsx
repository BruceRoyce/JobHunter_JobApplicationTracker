import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STATUS_DOT, STATUS_STYLE } from "../format";
import type { Status } from "../types";

type Variant = "primary" | "secondary" | "ghost" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink border border-accent hover:brightness-110 active:brightness-95 font-semibold",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-raised hover:border-ink-3 font-medium",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:text-ink hover:bg-raised font-medium",
  quiet: "bg-transparent text-ink-2 border border-line hover:text-ink hover:border-line-strong font-medium",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 px-2.5 text-[0.8125rem] gap-1.5" : "h-9 px-4 text-sm gap-2";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-sm select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  disabled,
  title,
}: {
  href: string;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  const cls =
    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm text-[0.8125rem] font-medium border select-none";
  if (disabled) {
    return (
      <span
        className={`${cls} border-line text-ink-3 opacity-55 cursor-not-allowed`}
        aria-disabled="true"
        title={title}
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`${cls} border-line text-ink-2 hover:text-ink hover:border-line-strong`}
    >
      {children}
    </a>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {status}
    </span>
  );
}

export function Accordion({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2.5 text-left text-[0.8125rem] font-medium text-ink-2 hover:text-ink cursor-pointer"
      >
        <Icon.Chevron className="chevron size-3.5 text-ink-3" />
        <span>{title}</span>
        {meta ? <span className="ml-auto text-xs font-normal text-ink-3">{meta}</span> : null}
      </button>
      <div id={id} className="reveal" data-open={open} inert={!open}>
        <div className="reveal-inner">
          <div className="pb-3 pl-5.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

export function RadioGroup<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  error,
  required,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | "";
  onChange: (v: T) => void;
  error?: string;
  required?: boolean;
}) {
  const errId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="field-label">
        {label}
        {required ? <span className="text-ink-3"> *</span> : null}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={`relative inline-flex items-center gap-2 rounded-sm border px-3 h-8 text-[0.8125rem] cursor-pointer select-none ${
                checked
                  ? "border-accent bg-accent/10 text-ink font-medium"
                  : "border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid size-3.5 place-items-center rounded-full border ${
                  checked ? "border-accent" : "border-line-strong"
                } peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent`}
              >
                {checked ? <span className="size-1.5 rounded-full bg-accent" /> : null}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
      <FieldError id={errId} message={error} />
    </fieldset>
  );
}

type IconProps = { className?: string };
const svg = (path: ReactNode, fill = false) =>
  function I({ className = "size-4" }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

const starPath = (
  <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />
);

export const Icon = {
  Plus: svg(<path d="M12 5v14M5 12h14" />),
  Star: svg(starPath),
  StarFilled: svg(starPath, true),
  Chevron: svg(<path d="M9 6l6 6-6 6" />),
  External: svg(<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  File: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  Lock: svg(<><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  Edit: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  Download: svg(<><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>),
  Sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  Moon: svg(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  Arrow: svg(<path d="M12 5v14M6 13l6 6 6-6" />),
  X: svg(<path d="M6 6l12 12M18 6L6 18" />),
  Alert: svg(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>),
};
