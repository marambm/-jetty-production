import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connecté");

const hash = await bcrypt.hash("admin123", 10);

const result = await mongoose.connection.db.collection("users").insertOne({
  username: "admin",
  password: hash,
  email: "admin@jetty.com",
  role: "admin",
  permissions: [
    "view_dashboard","view_production","view_kpis",
    "view_forecast","view_alerts","manage_settings",
    "export_data","manage_items","view_reports"
  ],
  createdBy: "system",
  createdAt: new Date(),
  updatedAt: new Date()
});

console.log("✅ Admin créé :", result.insertedId);
await mongoose.disconnect();
process.exit(0);
