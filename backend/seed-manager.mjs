import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "./src/models/users.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/jetty");

const existing = await User.findOne({ username: "manager" });

if (existing) {
  console.log("Manager existe déjà !");
} else {
  const hash = await bcrypt.hash("manager123", 10);

  await User.create({
    username: "manager",
    password: hash,
    role: "manager",
    permissions: [
      "view_dashboard",
      "view_production",
      "view_kpis",
      "view_forecast",
      "view_alerts",
      "manage_settings",
      "export_data",
      "manage_items",
      "view_reports",
    ],
    createdBy: "system",
  });

  console.log("Manager créé avec succès !");
  console.log("Username : manager");
  console.log("Password : manager123");
}

await mongoose.disconnect();
process.exit(0);