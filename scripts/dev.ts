// Runs the API (with --watch) and the Vite dev server together. Ctrl+C stops both.
const deno = Deno.execPath();
const root = new URL("..", import.meta.url);
const procs = [
  new Deno.Command(deno, { args: ["task", "dev:api"], cwd: root, stdout: "inherit", stderr: "inherit" }).spawn(),
  new Deno.Command(deno, { args: ["task", "dev:web"], cwd: root, stdout: "inherit", stderr: "inherit" }).spawn(),
];
console.log("\n  API  → http://127.0.0.1:8787\n  App  → http://localhost:5173  (open this one)\n");
const stop = () => {
  for (const p of procs) {
    try { p.kill(); } catch { /* already exited */ }
  }
};
try {
  Deno.addSignalListener("SIGINT", () => { stop(); Deno.exit(0); });
} catch { /* signal listeners not supported here */ }
await Promise.race(procs.map((p) => p.status));
stop();
