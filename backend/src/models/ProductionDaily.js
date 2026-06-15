// models/ProductionDaily.js
import mongoose from "mongoose";

const productionDailySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    workUnit: { type: String, required: true },

    // Employé
    employeeId: { type: String, default: "UNKNOWN" },
    employeeName: { type: String, default: "Inconnu" },
    department: { type: String, default: "Production" },

    // Production
    goodQty: { type: Number, default: 0 },
    defectsQty: { type: Number, default: 0 },
    scrapQty: { type: Number, default: 0 },
    workSeconds: { type: Number, default: 0 },
    theoreticalSeconds: { type: Number, default: 28800 },

    _isDemo: { type: Boolean, default: false },
    upSeconds: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "production_daily", // ⭐ IMPORTANT : nom exact de la collection
  }
);

// Index pour performances
productionDailySchema.index({ employeeId: 1, date: 1 });
productionDailySchema.index({ date: 1 });

const ProductionDaily = mongoose.model(
  "ProductionDaily",
  productionDailySchema
);

export default ProductionDaily;