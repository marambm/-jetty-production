import oracledb from "oracledb";

let pool = null;

export async function initOraclePool() {
  const user = process.env.ORACLE_USER;
  const password = process.env.ORACLE_PASSWORD;
  const connectString = process.env.ORACLE_CONNECT_STRING;

  if (!user || !password || !connectString) {
    console.warn("[Oracle] Missing ORACLE_USER, ORACLE_PASSWORD, or ORACLE_CONNECT_STRING.");
    console.warn("[Oracle] Set these env vars to enable Oracle sync.");
    return false;
  }

  try {
  const libDir = process.env.ORACLE_CLIENT_DIR;
  if (libDir) {
    oracledb.initOracleClient({ libDir });
    console.log(`[Oracle] Thick mode enabled → ${libDir}`);
  }
} catch (err) {
  console.log(`[Oracle] Thick mode init failed: ${err.message}`);
}

  try {
    pool = await oracledb.createPool({
      user,
      password,
      connectString,
      poolMin: 1,
      poolMax: 4,
      poolIncrement: 1,
    });
    console.log(`[Oracle] Connection pool initialized → ${connectString} (user=${user})`);
    return true;
  } catch (err) {
    console.error(`[Oracle] Pool creation FAILED: ${err.message}`);
    pool = null;
    return false;
  }
}

export function getOraclePool() {
  return pool;
}

export function isOracleConnected() {
  return pool !== null;
}

export async function closeOraclePool() {
  if (pool) {
    try {
      await pool.close(0);
      pool = null;
      console.log("[Oracle] Pool closed.");
    } catch (err) {
      console.error("[Oracle] Pool close error:", err.message);
    }
  }
}
