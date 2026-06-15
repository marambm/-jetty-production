import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import User from "../models/users.js";

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET  || "jetty-default-secret-dev-only";
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || "8h";

// ─── Générateur de mot de passe aléatoire ────────────────────────────
function generatePassword() {
  const upper   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower   = "abcdefghijklmnopqrstuvwxyz";
  const digits  = "0123456789";
  const special = "@#$!%^&*";
  const all     = upper + lower + digits + special;
  let pwd = [
    upper  [Math.floor(Math.random() * upper.length)],
    lower  [Math.floor(Math.random() * lower.length)],
    digits [Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 6; i++)
    pwd.push(all[Math.floor(Math.random() * all.length)]);
  return pwd.sort(() => Math.random() - 0.5).join("");
}

// ─── Envoi d'email ───────────────────────────────────────────────────
async function sendPasswordEmail(to, username, newPassword) {
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from:    `"Jetty System" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: "🔐 Votre nouveau mot de passe — Jetty",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#4f46e5;margin-bottom:8px;">Jetty Production Control</h2>
        <p>Bonjour <strong>${username}</strong>,</p>
        <p>Votre mot de passe a été réinitialisé. Voici vos nouvelles informations de connexion :</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;font-size:14px;color:#64748b;">Nom d'utilisateur</p>
          <p style="margin:4px 0 12px;font-weight:bold;font-size:16px;">${username}</p>
          <p style="margin:0;font-size:14px;color:#64748b;">Nouveau mot de passe</p>
          <p style="margin:4px 0 0;font-weight:bold;font-size:20px;letter-spacing:2px;color:#4f46e5;">${newPassword}</p>
        </div>
        <p style="color:#ef4444;font-size:13px;">⚠️ Changez ce mot de passe dès votre première connexion.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="font-size:12px;color:#94a3b8;">Cet email a été envoyé automatiquement par le système Jetty.</p>
      </div>
    `,
  });
}

// ─── POST /api/auth/login ────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, error: "Username and password required." });
  try {
    const user = await User.findOne({ username });
    if (!user)
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    //creation du token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    res.json({
      ok: true,
      token,
      user: {
        id:          user._id,
        username:    user.username,
        role:        user.role,
        permissions: user.permissions,
      },
      expiresIn: TOKEN_EXPIRY,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────
router.get("/auth/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ ok: false, error: "Not authenticated." });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findById(payload.id).select("-password");
    if (!user)
      return res.status(401).json({ ok: false, error: "User not found." });
    res.json({
      ok: true,
      user: {
        id:          user._id,
        username:    user.username,
        role:        user.role,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
});

// ─── POST /api/auth/forgot-password ─────────────────────────────────
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ ok: false, error: "Email requis." });

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user)
      return res.status(404).json({ ok: false, error: "Aucun compte associé à cet email." });

    const newPassword = generatePassword();
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await sendPasswordEmail(email, user.username, newPassword);

    console.log(`[auth] 📧 Nouveau mot de passe envoyé à ${email}`);
    res.json({ ok: true, message: "Nouveau mot de passe envoyé par email." });
  } catch (err) {
    console.error("[auth] forgot-password error:", err.message);
    res.status(500).json({ ok: false, error: "Erreur lors de l'envoi de l'email." });
  }
});

// ─── POST /api/auth/change-password ──────────────────────────────────
// Permet à l'utilisateur connecté de changer son propre mot de passe
// Nécessite le token JWT valide + l'ancien mot de passe pour vérification
router.post("/auth/change-password", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ ok: false, error: "Not authenticated." });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    return res.status(400).json({ ok: false, error: "Ancien et nouveau mot de passe requis." });

  try {
    // Vérification du token JWT pour identifier l'utilisateur connecté
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user)
      return res.status(404).json({ ok: false, error: "Utilisateur non trouvé." });

    // Vérification que l'ancien mot de passe est correct
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid)
      return res.status(401).json({ ok: false, error: "Ancien mot de passe incorrect." });

    // Validation du nouveau mot de passe
    if (newPassword.length < 8)
      return res.status(400).json({ ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." });
    if (!/[A-Z]/.test(newPassword))
      return res.status(400).json({ ok: false, error: "Le mot de passe doit contenir au moins une majuscule." });
    if (!/[a-z]/.test(newPassword))
      return res.status(400).json({ ok: false, error: "Le mot de passe doit contenir au moins une minuscule." });
    if (!/[0-9]/.test(newPassword))
      return res.status(400).json({ ok: false, error: "Le mot de passe doit contenir au moins un chiffre." });
    if (!/[@#$!%^&*]/.test(newPassword))
      return res.status(400).json({ ok: false, error: "Le mot de passe doit contenir au moins un caractère spécial (@#$!%^&*)." });

    // Hachage bcrypt et sauvegarde en base
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log(`[auth] ✅ Mot de passe changé pour ${user.username}`);
    res.json({ ok: true, message: "Mot de passe modifié avec succès." });
  } catch (err) {
    console.error("[auth] change-password error:", err.message);
    res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
});

export default router;