import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { App } from "./App";
import { setApiBase } from "./api";
import "./index.css";

const root = document.getElementById("root")!;

async function boot() {
  if (!import.meta.env.DEV) {
    const base = await invoke<string>("api_base");
    setApiBase(base);
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot().catch((err: unknown) => {
  root.textContent =
    err instanceof Error
      ? err.message
      : "Cannot reach the Job Hunter server.";
});
