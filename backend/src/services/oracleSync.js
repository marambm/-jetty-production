import oracledb from "oracledb";
import { getOraclePool, isOracleConnected } from "../config/oracle.js";
import { isDbConnected } from "../config/db.js";
import ProductionDaily from "../models/ProductionDaily.js";

// Mapping entre les clés internes et les noms de colonnes Oracle attendus
const EXPECTED_COLUMNS = {
  collectionTime: "Collection time",
  workUnit: "Work unit name",
  goodQty: "Good product quantity",
  defectsQty: "Number of defective products",
  scrapQty: "Scrap quantity",
  workSeconds: "Work hours (seconds)",
  theoreticalPerPiece: "Theoretical working time of the workpiece",
  department: "Department",
  employeeId: "Employee ID",
};

// Stocke le résultat de la dernière synchronisation (accessible via getter)
let lastSyncResult = null;

// Retourne le résultat de la dernière sync sans déclencher une nouvelle
export function getLastSyncResult() {
  return lastSyncResult;
}

// Supprime les balises HTML éventuelles dans un en-tête de colonne et trim les espaces
export function cleanHeader(raw) {
  return String(raw).replace(/<[^>]+>/g, "").trim();
}

// Convertit une date (string ou objet Date) en format "YYYY-MM-DD"
// Retourne null si la date est invalide
function formatDateYMD(dt) {
  if (typeof dt === "string") {
    const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

// Construit un dictionnaire { nomNettoyé -> nomBrut } à partir des noms de colonnes Oracle
// Permet de faire la correspondance malgré des variations de casse ou de balises HTML
function buildColumnLookup(rawColumnNames) {
  const lookup = {};
  for (const raw of rawColumnNames) {
    const clean = cleanHeader(raw);
    lookup[clean] = raw;
  }
  return lookup;
}

// Cherche le nom brut d'une colonne Oracle à partir de son nom attendu (insensible à la casse)
// Retourne null si la colonne est introuvable
function findColumn(lookup, expectedName) {
  if (lookup[expectedName]) return lookup[expectedName];
  const lower = expectedName.toLowerCase();
  for (const [clean, raw] of Object.entries(lookup)) {
    if (clean.toLowerCase() === lower) return raw;
  }
  return null;
}

// Fonction principale : lit les données Oracle sur la plage [fromDate, toDate],
// les agrège par (date + unité de travail), puis les upserte dans MongoDB
export async function syncOracleToMongo(fromDate, toDate) {
  // Vérification des connexions avant toute opération
  if (!isOracleConnected()) {
    throw new Error("Oracle is not connected. Set ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING.");
  }
  if (!isDbConnected()) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI.");
  }

  const tableName = process.env.ORACLE_TABLE || "PRODUCTION_DATA";

  console.log(`[Sync] Fetching Oracle data from ${fromDate} to ${toDate} ...`);
  console.log(`[Sync] Table: ${tableName}`);

  const pool = getOraclePool();
  let connection;
  try {
    connection = await pool.getConnection();

    // Requête à 0 ligne pour récupérer uniquement les métadonnées (noms de colonnes)
    const colResult = await connection.execute(
      `SELECT * FROM "${tableName}" WHERE ROWNUM = 0`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rawColNames = colResult.metaData.map((m) => m.name);
    console.log(`[Sync] Oracle columns found: ${rawColNames.length}`);

    // Construction du lookup et résolution de chaque colonne attendue
    const lookup = buildColumnLookup(rawColNames);
    console.log("[Sync] Cleaned column names:", Object.keys(lookup).join(", "));

    const colTime       = findColumn(lookup, EXPECTED_COLUMNS.collectionTime);
    const colWU         = findColumn(lookup, EXPECTED_COLUMNS.workUnit);
    const colGood       = findColumn(lookup, EXPECTED_COLUMNS.goodQty);
    const colDefects    = findColumn(lookup, EXPECTED_COLUMNS.defectsQty);
    const colScrap      = findColumn(lookup, EXPECTED_COLUMNS.scrapQty);
    const colWork       = findColumn(lookup, EXPECTED_COLUMNS.workSeconds);
    const colTheo       = findColumn(lookup, EXPECTED_COLUMNS.theoreticalPerPiece);
    const colDepartment = findColumn(lookup, EXPECTED_COLUMNS.department);
    const colEmployeeId = findColumn(lookup, EXPECTED_COLUMNS.employeeId);

    // Les colonnes time, workUnit et goodQty sont obligatoires — on lève une erreur si manquantes
    const missing = [];
    if (!colTime) missing.push(EXPECTED_COLUMNS.collectionTime);
    if (!colWU)   missing.push(EXPECTED_COLUMNS.workUnit);
    if (!colGood) missing.push(EXPECTED_COLUMNS.goodQty);
    if (missing.length > 0) {
      throw new Error(`Missing required Oracle columns: ${missing.join(", ")}. Available: ${Object.keys(lookup).join(", ")}`);
    }

    // Construction de la requête SQL avec aliases fixes pour simplifier la lecture des résultats
    // Les colonnes optionnelles sont remplacées par 0 (ou NULL) si absentes
    const q = (c) => `"${c}"`;
    const sql = `
      SELECT
        ${q(colTime)} AS COL_TIME,
        ${q(colWU)} AS COL_WU,
        ${colGood       ? `${q(colGood)}`       : "0"   } AS COL_GOOD,
        ${colDefects    ? `${q(colDefects)}`    : "0"   } AS COL_DEFECTS,
        ${colScrap      ? `${q(colScrap)}`      : "0"   } AS COL_SCRAP,
        ${colWork       ? `${q(colWork)}`       : "0"   } AS COL_WORK,
        ${colTheo       ? `${q(colTheo)}`       : "0"   } AS COL_THEO,
        ${colDepartment ? `${q(colDepartment)}` : "NULL"} AS COL_DEPARTMENT,
        ${colEmployeeId ? `${q(colEmployeeId)}` : "NULL"} AS COL_EMPLOYEE_ID
      FROM "${tableName}"
      WHERE ${q(colTime)} IS NOT NULL
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const rawRows = result.rows;
    console.log(`[Sync] Oracle raw rows fetched: ${rawRows.length}`);

    // Agrégation des lignes par clé composite "date|workUnit"
    // Le filtrage sur la plage de dates se fait ici côté JS (Oracle renvoie tout)
    const grouped = {};
    let filteredCount = 0;

    for (const row of rawRows) {
      const dateStr = formatDateYMD(row.COL_TIME);
      if (!dateStr) continue;                              // Date illisible → on ignore la ligne
      if (dateStr < fromDate || dateStr > toDate) continue; // Hors plage → on ignore

      filteredCount++;

      const wu  = cleanHeader(String(row.COL_WU || "")).trim();
      const key = `${dateStr}|${wu}`;

      // Initialisation du groupe si première occurrence de cette clé
      if (!grouped[key]) {
        grouped[key] = {
          date: dateStr,
          workUnit: wu,
          goodQty: 0,
          defectsQty: 0,
          scrapQty: 0,
          workSeconds: 0,
          theoreticalSeconds: 0,
          department: row.COL_DEPARTMENT ?? null,
          employeeId: row.COL_EMPLOYEE_ID ?? null,
        };
      }

      const good = Number(row.COL_GOOD) || 0;
      const theo = Number(row.COL_THEO) || 0;

      // Cumul des quantités et des temps pour ce groupe
      grouped[key].goodQty          += good;
      grouped[key].defectsQty       += Number(row.COL_DEFECTS) || 0;
      grouped[key].scrapQty         += Number(row.COL_SCRAP)   || 0;
      grouped[key].workSeconds      += Number(row.COL_WORK)    || 0;
      grouped[key].theoreticalSeconds += theo * good; // temps théorique total = temps/pièce × nb pièces
    }

    const docs = Object.values(grouped);
    console.log(`[Sync] Rows in date range: ${filteredCount}`);
    console.log(`[Sync] Records aggregated (date+workUnit groups): ${docs.length}`);

    // Aucune donnée dans la plage → on retourne un résultat vide sans toucher MongoDB
    if (docs.length === 0) {
      lastSyncResult = {
        oracleRowsFetched: rawRows.length,
        rowsInDateRange: 0,
        recordsAggregated: 0,
        mongoInserted: 0,
        mongoModified: 0,
        lastSyncTime: new Date().toISOString(),
        sampleRecord: null,
        error: null,
      };
      return lastSyncResult;
    }

    console.log("[Sync] Sample transformed record:", JSON.stringify(docs[0], null, 2));

    // Upsert en masse dans MongoDB : insert si nouveau (date+workUnit), update sinon
    const bulkOps = docs.map((doc) => ({
      updateOne: {
        filter: { date: doc.date, workUnit: doc.workUnit },
        update: { $set: doc },
        upsert: true,
      },
    }));

    const bulkResult = await ProductionDaily.bulkWrite(bulkOps, { ordered: false });
    const inserted = bulkResult.upsertedCount  || 0;
    const modified = bulkResult.modifiedCount  || 0;

    console.log(`[Sync] MongoDB bulkWrite: ${inserted} inserted, ${modified} modified`);

    // Sauvegarde du résultat pour consultation ultérieure via getLastSyncResult()
    lastSyncResult = {
      oracleRowsFetched: rawRows.length,
      rowsInDateRange: filteredCount,
      recordsAggregated: docs.length,
      mongoInserted: inserted,
      mongoModified: modified,
      lastSyncTime: new Date().toISOString(),
      sampleRecord: docs[0],
      error: null,
    };

    return lastSyncResult;
  } catch (err) {
    console.error(`[Sync] Error: ${err.message}`);

    // En cas d'erreur, on mémorise quand même le résultat (avec le message d'erreur)
    lastSyncResult = {
      oracleRowsFetched: 0,
      rowsInDateRange: 0,
      recordsAggregated: 0,
      mongoInserted: 0,
      mongoModified: 0,
      lastSyncTime: new Date().toISOString(),
      sampleRecord: null,
      error: err.message,
    };
    throw err;
  } finally {
    // Fermeture de la connexion Oracle dans tous les cas (succès ou erreur)
    if (connection) {
      try {
        await connection.close();
      } catch {
      }
    }
  }
}