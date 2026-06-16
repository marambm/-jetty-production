import express from "express";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.post("/run-seed", async (req, res) => {
  const seedPath = path.join(__dirname, "../routes/seed.js");
  execFile("node", [seedPath], (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, error: stderr });
    res.json({ ok: true, output: stdout });
  });
});

export default router;
