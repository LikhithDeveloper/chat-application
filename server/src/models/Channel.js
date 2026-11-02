const mongoose = require("mongoose");

// A channel is a "community" that holds rooms.
//   public  channel: anyone can join straight away
//   private channel: users send a request, the channel's admin (its owner) must accept
const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, unique: true },
    description: { type: String, default: "", trim: true },
    type: { type: String, enum: ["public", "private"], default: "public" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the channel admin
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

channelSchema.methods.hasMember = function (userId) {
  return this.members.some((m) => m.equals(userId));
};

// Shape sent to the browser. `extra` carries things computed per viewer
// (their request status, the rooms they are allowed to see, ...).
channelSchema.methods.toPublic = function (userId, extra = {}) {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    type: this.type,
    owner: this.owner.toString(),
    isOwner: this.owner.equals(userId),
    isMember: this.hasMember(userId),
    memberCount: this.members.length,
    createdAt: this.createdAt,
    ...extra,
  };
};

module.exports = mongoose.model("Channel", channelSchema);
