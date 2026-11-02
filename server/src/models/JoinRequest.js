const mongoose = require("mongoose");

// One document = "this user asks to get into this channel (or this room inside it)".
// The channel admin approves or rejects it.
const joinRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null }, // null = a channel request
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A user can only have ONE pending request per target (the database enforces it, so
// double-clicking "Request" can never create duplicates). Old decided requests don't count.
joinRequestSchema.index(
  { user: 1, channel: 1, room: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
joinRequestSchema.index({ channel: 1, status: 1 });

module.exports = mongoose.model("JoinRequest", joinRequestSchema);
