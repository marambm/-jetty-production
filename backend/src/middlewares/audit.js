import AuditLog from "../models/AuditLog.js";
import User from "../models/users.js";

// ── Diff deux objets et retourne les champs modifiés ─────────────────────────
function diffObjects(before = {}, after = {}) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (["__v", "_id", "createdAt", "updatedAt"].includes(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal ?? null, newValue: newVal ?? null });
    }
  }
  return changes;
}

// ── Extraire les infos utilisateur depuis req + DB ───────────────────────────
async function extractContext(req) {
  if (!req) {
    return { userId: null, userName: "system", userEmail: null, ip: null, userAgent: null };
  }

  const user = req.user || req.currentUser || req.authUser || null;
  const userId = user?._id?.toString() || user?.id?.toString() || null;

  // userName depuis le token (username est toujours présent dans le JWT)
  let userName  = user?.name || user?.username || user?.email || "system";
  let userEmail = user?.email || null;

  // Si l'email est absent du token, on le récupère depuis la DB
  if (userId && !userEmail) {
    try {
      const dbUser = await User.findById(userId).select("email username").lean();
      if (dbUser) {
        userEmail = dbUser.email || null;
        // Utiliser username de la DB si celui du token est vide
        if (!userName || userName === "system") {
          userName = dbUser.username || "system";
        }
      }
    } catch (err) {
      console.warn("[AUDIT] Impossible de récupérer l'email depuis la DB:", err.message);
    }
  }

  return {
    userId,
    userName,
    userEmail,
    ip:        req.ip || req.headers?.["x-forwarded-for"] || req.connection?.remoteAddress || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

// ── Convertir un document Mongoose ou objet brut en plain object ─────────────
function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") return doc.toObject();
  if (typeof doc.toJSON   === "function") return doc.toJSON();
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// logCreate
// ─────────────────────────────────────────────────────────────────────────────
export async function logCreate({ collection, document, req, note = "" }) {
  try {
    if (!collection) throw new Error("collection is required");
    const ctx   = await extractContext(req);
    const after = toPlain(document);

    console.log(`[AUDIT] logCreate → collectionName=${collection} user=${ctx.userName} email=${ctx.userEmail}`);

    const result = await AuditLog.create({
      ...ctx,
      action:         "CREATE",
      collectionName: collection,
      documentId:     after?._id?.toString() || null,
      before:         null,
      after,
      changes:        [],
      note,
      timestamp:      new Date(),
    });

    console.log(`[AUDIT] ✅ CREATE enregistré, _id=${result._id}`);
  } catch (err) {
    console.error("[AUDIT CREATE ERROR]", err.message, err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// logUpdate
// ─────────────────────────────────────────────────────────────────────────────
export async function logUpdate({ collection, before, after, req, note = "" }) {
  try {
    if (!collection) throw new Error("collection is required");
    const ctx         = await extractContext(req);
    const beforePlain = toPlain(before);
    const afterPlain  = toPlain(after);
    const changes     = diffObjects(beforePlain || {}, afterPlain || {});

    if (changes.length === 0) {
      console.log(`[AUDIT] logUpdate → aucun changement détecté, rien enregistré`);
      return;
    }

    console.log(`[AUDIT] logUpdate → collectionName=${collection} user=${ctx.userName} email=${ctx.userEmail} changes=${changes.length}`);

    const result = await AuditLog.create({
      ...ctx,
      action:         "UPDATE",
      collectionName: collection,
      documentId:     (afterPlain?._id || beforePlain?._id)?.toString() || null,
      before:         beforePlain,
      after:          afterPlain,
      changes,
      note,
      timestamp:      new Date(),
    });

    console.log(`[AUDIT] ✅ UPDATE enregistré, _id=${result._id}`);
  } catch (err) {
    console.error("[AUDIT UPDATE ERROR]", err.message, err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// logDelete
// ─────────────────────────────────────────────────────────────────────────────
export async function logDelete({ collection, document, req, note = "" }) {
  try {
    if (!collection) throw new Error("collection is required");
    const ctx    = await extractContext(req);
    const before = toPlain(document);

    console.log(`[AUDIT] logDelete → collectionName=${collection} user=${ctx.userName} email=${ctx.userEmail}`);

    const result = await AuditLog.create({
      ...ctx,
      action:         "DELETE",
      collectionName: collection,
      documentId:     before?._id?.toString() || null,
      before,
      after:          null,
      changes:        [],
      note,
      timestamp:      new Date(),
    });

    console.log(`[AUDIT] ✅ DELETE enregistré, _id=${result._id}`);
  } catch (err) {
    console.error("[AUDIT DELETE ERROR]", err.message, err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware Express
// ─────────────────────────────────────────────────────────────────────────────
export default function auditMiddleware(req, res, next) {
  req.audit = {
    logCreate: (params) => logCreate({ ...params, req }),
    logUpdate: (params) => logUpdate({ ...params, req }),
    logDelete: (params) => logDelete({ ...params, req }),
  };
  res.locals.audit = req.audit;
  next();
}