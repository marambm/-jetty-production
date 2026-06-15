import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

const frontendDir = path.join(process.cwd(), "frontend");
const backendDir = path.join(process.cwd(), "backend");

if (!existsSync(path.join(frontendDir, "node_modules"))) {
  console.log("Installing frontend dependencies...");
  execSync("npm install", { cwd: frontendDir, stdio: "inherit" });
}

console.log("Starting backend on port 4000...");
const backend = spawn("node", ["src/server.js"], {
  cwd: backendDir,
  stdio: "inherit",
  env: { ...process.env, BACKEND_PORT: "4000" },
});

console.log("Starting frontend dev server on port 5000...");
const frontend = spawn("npx", ["vite", "--host", "0.0.0.0", "--port", "5000"], {
  cwd: frontendDir,
  stdio: "inherit",
  env: { ...process.env },
});

frontend.on("exit", (code) => {
  backend.kill();
  process.exit(code ?? 0);
});

backend.on("exit", (code) => {
  if (code !== 0) console.error(`Backend exited with code ${code}`);
});
