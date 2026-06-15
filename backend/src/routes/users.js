import { Router } from "express";
import bcrypt from "bcrypt";
import User from "../models/users.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { isDbConnected } from "../config/db.js";

const router = Router();

const AVAILABLE_PERMISSIONS = [
  "view_dashboard",
  "view_production",
  "view_kpis",
  "view_forecast",
  "view_alerts",
  "manage_settings",
  "export_data",
  "manage_items",
  "view_reports",
];

function validatePassword(password) {
  if (!password || password.length < 8)
    return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Z]/.test(password))
    return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[a-z]/.test(password))
    return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[0-9]/.test(password))
    return "Le mot de passe doit contenir au moins un chiffre.";
  if (!/[@#$!%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(password))
    return "Le mot de passe doit contenir au moins un caractère spécial.";
  return null;
}

// ─── GET /api/users/permissions ─────────────────────────────────────
router.get("/permissions", requireAuth, requireRole("manager"), (req, res) => {
  res.json({ ok: true, permissions: AVAILABLE_PERMISSIONS });
});

// ─── GET /api/users ─────────────────────────────────────────────────
router.get("/", requireAuth, requireRole("manager"), async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ ok: false, error: "Database not connected." });
  try {
    const admins = await User.find({ role: "admin" }).select("-password");
    res.json({ ok: true, users: admins });
  } catch (err) {
    console.error("GET /api/users error:", err.message);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ─── POST /api/creation de users ─────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("manager"), async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ ok: false, error: "Database not connected." });

  const { username, password, email, permissions = [] } = req.body;

  if (!username || !password)
    return res.status(400).json({ ok: false, error: "Username and password are required." });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ ok: false, error: "Une adresse email valide est requise." });

  const pwdError = validatePassword(password);
  if (pwdError)
    return res.status(400).json({ ok: false, error: pwdError });

  const invalid = permissions.filter((p) => !AVAILABLE_PERMISSIONS.includes(p));
  if (invalid.length > 0)
    return res.status(400).json({ ok: false, error: `Unknown permissions: ${invalid.join(", ")}` });

  try {
    const existing = await User.findOne({ username: username.trim() });
    if (existing)
      return res.status(409).json({ ok: false, error: "Ce nom d'utilisateur existe déjà." });

    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail)
      return res.status(409).json({ ok: false, error: "Cette adresse email est déjà utilisée." });
   //hashage de password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username: username.trim(),
      password: hashedPassword,
      email: email.toLowerCase().trim(),
      role: "admin",
      permissions,
      createdBy: req.user?.username || "manager",
    });

    console.log(`[users] ✅ Admin créé : ${newUser.username} (${newUser.email}) par ${req.user?.username}`);

    res.status(201).json({
      ok: true,
      user: {
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions,
        createdBy: newUser.createdBy,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error("POST /api/users error:", err.message);
    if (err.code === 11000)
      return res.status(409).json({ ok: false, error: "Ce nom d'utilisateur existe déjà." });
    res.status(500).json({ ok: false, error: "Server error: " + err.message });
  }
});

// ─── PATCH /api/users/:id/permissions ────────────────────────────────
router.patch("/:id/permissions", requireAuth, requireRole("manager"), async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ ok: false, error: "Database not connected." });

  const { permissions } = req.body;

  if (!Array.isArray(permissions))
    return res.status(400).json({ ok: false, error: "permissions must be an array." });

  const invalid = permissions.filter((p) => !AVAILABLE_PERMISSIONS.includes(p));
  if (invalid.length > 0)
    return res.status(400).json({ ok: false, error: `Unknown permissions: ${invalid.join(", ")}` });

  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "admin" },
      { permissions },
      { new: true }
    ).select("-password");

    if (!user)
      return res.status(404).json({ ok: false, error: "Admin not found." });

    res.json({ ok: true, user });
  } catch (err) {
    console.error("PATCH permissions error:", err.message);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ─── PATCH /api/users/:id/password ───────────────────────────────────
router.patch("/:id/password", requireAuth, requireRole("manager"), async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ ok: false, error: "Database not connected." });

  const { password } = req.body;

  const pwdError = validatePassword(password);
  if (pwdError)
    return res.status(400).json({ ok: false, error: pwdError });

  try {
    const user = await User.findOne({ _id: req.params.id, role: "admin" });
    if (!user)
      return res.status(404).json({ ok: false, error: "Admin not found." });

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("PATCH password error:", err.message);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────
router.delete("/:id", requireAuth, requireRole("manager"), async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ ok: false, error: "Database not connected." });

  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, role: "admin" });
    if (!user)
      return res.status(404).json({ ok: false, error: "Admin not found." });

    res.json({ ok: true, message: "Admin deleted successfully." });
  } catch (err) {
    console.error("DELETE user error:", err.message);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

export default router;