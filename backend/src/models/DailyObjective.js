import mongoose from "mongoose";

const dailyObjectiveSchema = new mongoose.Schema(
  {
    date:      { type: String, required: true },
    workUnit:  { type: String, default: "global" },
    objective: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

dailyObjectiveSchema.index({ date: 1, workUnit: 1 }, { unique: true });

export default mongoose.model("DailyObjective", dailyObjectiveSchema);