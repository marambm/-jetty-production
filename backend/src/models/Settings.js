import mongoose from "mongoose";

const objectiveByUnitSchema = new mongoose.Schema(
  {
    workUnit: { type: String, required: true },
    objective: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const thresholdsSchema = new mongoose.Schema(
  {
    rendementWarning: { type: Number, default: 85, min: 0, max: 100 },
    rendementCritical: { type: Number, default: 70, min: 0, max: 100 },
    pertesWarning: { type: Number, default: 10, min: 0 },
    pertesCritical: { type: Number, default: 20, min: 0 },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema({
  globalObjective: { type: Number, default: 0, min: 0 },
  objectivesByWorkUnit: { type: [objectiveByUnitSchema], default: [] },
  thresholds: { type: thresholdsSchema, default: () => ({}) },
  forecastEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

settingsSchema.pre("save", function () {
  this.updatedAt = new Date();
});

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
