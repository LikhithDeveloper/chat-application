const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, unique: true },
    description: { type: String, default: "", trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Shape sent to the browser. `userId` tells us whether the viewer is a member / the owner.
roomSchema.methods.toPublic = function (userId) {
  const id = String(userId);
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    owner: this.owner.toString(),
    memberCount: this.members.length,
    isMember: this.members.some((m) => m.toString() === id),
    isOwner: this.owner.toString() === id,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Room", roomSchema);
