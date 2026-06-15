import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      index: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"],
    },

    workUnit: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // availability_low
    // availability_critical
    // performance_low
    // performance_critical
    // quality_low
    // quality_critical
    // oee_low
    // oee_critical
    type: {
      type: String,
      required: true,
      trim: true,
      enum: {
        values: [
          "availability_low",
          "availability_critical",

          "performance_low",
          "performance_critical",

          "quality_low",
          "quality_critical",

          "oee_low",
          "oee_critical",
        ],
        message: "Invalid alert type",
      },
    },

    level: {
      type: String,
      required: true,
      enum: {
        values: ["orange", "red"],
        message: "level must be orange or red",
      },
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Valeur KPI qui a déclenché l’alerte
    value: {
      type: Number,
      default: null,
    },

    // KPI concerné
    // availability | performance | quality | oee
    metric: {
      type: String,
      enum: {
        values: [
          "availability",
          "performance",
          "quality",
          "oee",
        ],
        message: "Invalid metric",
      },
      default: null,
    },

    // L’utilisateur a-t-il lu la notification ?
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Une seule alerte identique par date + unité + type
alertSchema.index(
  {
    date: 1,
    workUnit: 1,
    type: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model("Alert", alertSchema, "alerts");