import { useEffect } from "react";
import { JobForm } from "./components/JobForm";
import { ListPane } from "./components/ListPane";
import { Button, Icon } from "./components/ui";
import { Logo } from "./components/Logo";
import { useStore } from "./store";

export function App() {
  const form = useStore((s) => s.form);
  const theme = useStore((s) => s.theme);
  const notices = useStore((s) => s.notices);
  const { load, openAdd, toggleTheme, dismissNotice } = useStore.getState();

  useEffect(() => {
    void load();
  }, [load]);

  const open = form.kind !== "closed";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-24">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex flex-row gap-2 items-center">
          <Logo />
          <div className="pt-3">
            <p className="eyebrow leading-1">Tracker</p>
            <h1 className="text-xl font-semibold tracking-tight text-ink/90">
              Job Hunter
            </h1>
          </div>
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="h-8"
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Icon.Sun className="size-3.5" />
          ) : (
            <Icon.Moon className="size-3.5" />
          )}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </header>

      <div aria-live="polite" className="mb-4 grid gap-2 empty:hidden">
        {notices.map((n) => (
          <div
            key={n.id}
            role="status"
            className={`fade-in flex items-start gap-2.5 rounded-sm border px-3.5 py-2.5 text-[0.8125rem] ${
              n.tone === "warning"
                ? "border-warn/40 text-warn"
                : "border-line bg-surface text-ink-2"
            }`}
          >
            {n.tone === "warning" ? (
              <Icon.Alert className="mt-0.5 size-4 shrink-0" />
            ) : null}
            <span className="flex-1">{n.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-ink-3 hover:text-ink cursor-pointer"
              onClick={() => dismissNotice(n.id)}
            >
              <Icon.X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <section aria-label="Add or edit a record">
        {!open ? (
          <Button
            variant="primary"
            className="w-full h-11 tracking-[0.14em] text-[0.8125rem]"
            onClick={openAdd}
          >
            <Icon.Plus className="size-4" /> ADD
          </Button>
        ) : null}
        <div className="reveal" data-open={open}>
          <div className="reveal-inner">
            <div className="rounded-md border border-line bg-surface">
              {form.kind === "add" ? <JobForm key="add" /> : null}
              {form.kind === "edit" ? (
                <JobForm key={`edit-${form.job.id}`} job={form.job} />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <ListPane />

      <footer className="mt-16 text-center text-xs text-ink-3">
        <p>
          Frozen job descriptions are historic evidence and are never
          overwritten.
        </p>
        <a
          href="https://www.linkedin.com/in/BruceRoyce"
          target="_blank"
          className="text-[80%] underline opacity-70 hover:opacity-100"
        >
          2026 - Bruce Royce
        </a>{" "}
      </footer>
    </div>
  );
}
