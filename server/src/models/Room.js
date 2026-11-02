const mongoose = require("mongoose");

const GLOBAL_NAME = "Global";

// Rooms ALWAYS live inside a channel (except the single built-in Global room).
const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true },
    description: { type: String, default: "", trim: true },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      default: null,
      // A room without a channel is only allowed for the Global room.
      validate: {
        validator: function (value) { return this.isGlobal || value != null; },
        message: "A room must belong to a channel",
      },
    },
    // private room: channel members must send a request, the channel admin approves
    // public room : channel members join directly
    isPrivate: { type: Boolean, default: false },
    // the channel admin who created the room (the Global room has none)
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: function () { return !this.isGlobal; } },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // true = the one built-in room that EVERY logged-in user can read and write, no joining needed.
    isGlobal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Room names only need to be unique INSIDE their channel.
roomSchema.index({ channel: 1, nameLower: 1 }, { unique: true });

// THE permission rule for reading/writing a room, used by HTTP routes and sockets alike:
//   Global room        -> any logged-in user
//   every other room   -> the user must be a member of the ROOM *and* of its CHANNEL
// (Leaving a channel therefore instantly removes access to all of its rooms.)
roomSchema.statics.findAccessible = async function (roomId, userId) {
  const room = await this.findOne({ _id: roomId, $or: [{ isGlobal: true }, { members: userId }] });
  if (!room) return null;
  if (room.isGlobal) return room;

  const inChannel = await mongoose.model("Channel").exists({ _id: room.channel, members: userId });
  return inChannel ? room : null;
};

// Creates the Global room if it doesn't exist yet. Safe to call on every start.
roomSchema.statics.ensureGlobal = async function () {
  let room = await this.findOne({ isGlobal: true });
  if (room) return room;

  // Edge case: an old normal room already called "Global". Promote it.
  room = await this.findOne({ channel: null, nameLower: GLOBAL_NAME.toLowerCase() });
  if (room) {
    room.isGlobal = true;
    return room.save();
  }

  return this.create({
    name: GLOBAL_NAME,
    nameLower: GLOBAL_NAME.toLowerCase(),
    description: "Everyone is here. Say hello!",
    isGlobal: true,
  });
};

// Shape sent to the browser. `requestStatus` is this viewer's join request: "pending" | "rejected" | null.
roomSchema.methods.toPublic = function (userId, requestStatus = null) {
  const id = String(userId);
  return {
    id: this._id.toString(),
    channel: this.channel ? this.channel.toString() : null,
    name: this.name,
    description: this.description,
    owner: this.owner ? this.owner.toString() : null,
    memberCount: this.members.length,
    isGlobal: this.isGlobal,
    isPrivate: this.isPrivate,
    isMember: this.isGlobal || this.members.some((m) => m.toString() === id),
    isOwner: !this.isGlobal && this.owner.toString() === id,
    requestStatus,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Room", roomSchema);
