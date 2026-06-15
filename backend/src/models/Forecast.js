import mongoose from "mongoose";

const forecastSchema = new mongoose.Schema({
  forecastForDate: {
    type: String,
    required: true,
    index: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, "forecastForDate must be YYYY-MM-DD"],
  },
  workUnit: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  yhat:      { type: Number, required: true },
  yhatLower: { type: Number, required: true },
  yhatUpper: { type: Number, required: true },
  confidence: {
    type: Number,
    default: 75,
    min: 0,
    max: 100,
  },
  modelVersion: {
    type: String,
    default: "1.0.0",
    trim: true,
  },
  source: {
    type: String,
    enum: ["ai", "moving-average", "stored"],
    default: "moving-average",
  },
  // ── Métriques XGBoost ────────────────────────────────────────────────────
  mae:      { type: Number, default: null },
  rmse:     { type: Number, default: null },
  testSize: { type: Number, default: null },
  // ────────────────────────────────────────────────────────────────────────
  createdAt: { type: Date, default: Date.now },
});

forecastSchema.index({ forecastForDate: 1, workUnit: 1 }, { unique: true });

export default mongoose.model("Forecast", forecastSchema, "forecasts");