import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ["CREATE", "UPDATE", "DELETE"],
  },

  // ⚠️ "collection" est un mot réservé Mongoose → renommé en "collectionName"
  collectionName: {
    type: String,
    required: true,
  },

  documentId: {
    type: mongoose.Schema.Types.Mixed,
  },

  userId: {
    type: mongoose.Schema.Types.Mixed,
  },

  userName: {
    type: String,
    default: "system",
  },

  userEmail: {
    type: String,
  },

  ip: {
    type: String,
  },

  userAgent: {
    type: String,
  },

  before: {
    type: Object,
    default: null,
  },

  after: {
    type: Object,
    default: null,
  },

  changes: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
  ],

  note: {
    type: String,
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("AuditLog", auditLogSchema);