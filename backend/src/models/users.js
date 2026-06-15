import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    role: {
      type: String,
      enum: ["manager", "admin"],
      default: "admin",
    },
    permissions: {
      type: [String],
      default: [],
      enum: [
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
    },
    createdBy: {
      type: String,
      default: "system",
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);