import mongoose from "mongoose";

let dbConnected = false;

export function isDbConnected() {
  return dbConnected && mongoose.connection.readyState === 1;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    dbConnected = false;
    console.warn("[MongoDB] No MONGODB_URI or MONGO_URI found in environment.");
    console.warn("[MongoDB] Set MONGODB_URI to a valid connection string (e.g. MongoDB Atlas).");
    console.log("[MongoDB] Continuing without database — features will return empty data.");
    return;
  }

  const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
  console.log(`[MongoDB] Connecting to ${maskedUri} ...`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    dbConnected = true;
    const dbName = mongoose.connection.db.databaseName;
    console.log(`[MongoDB] Connected successfully → host=${mongoose.connection.host}, db=${dbName}`);
  } catch (err) {
    dbConnected = false;
    console.error(`[MongoDB] Connection FAILED: ${err.message}`);
    console.log("[MongoDB] Continuing without database — features will return empty data.");
  }

  mongoose.connection.on("disconnected", () => {
    dbConnected = false;
    console.warn("[MongoDB] Disconnected.");
  });
  mongoose.connection.on("reconnected", () => {
    dbConnected = true;
    console.log("[MongoDB] Reconnected.");
  });
}
