import jwt from "jsonwebtoken";
import User from "../models/users.js";

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("FATAL: JWT_SECRET environment variable is required in production.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || "jetty-default-secret-dev-only";

// ─── Vérifie le token JWT ───────────────────────────────────────────
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
}

// ─── Vérifie le rôle (manager ou admin) ────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

// ─── Vérifie une permission spécifique ─────────────────────────────
// Usage : requirePermission("view_kpis")
export function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    // Le manager a accès à tout
    if (req.user.role === "manager") return next();

    try {
      const user = await User.findById(req.user.id).select("permissions");
      if (!user) {
        return res.status(401).json({ ok: false, error: "User not found." });
      }
      if (!user.permissions.includes(permission)) {
        return res.status(403).json({
          ok: false,
          error: `Access denied. Missing permission: ${permission}`,
        });
      }
      next();
    } catch (err) {
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  };
}