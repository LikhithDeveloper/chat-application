const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fast "latest messages in this room" queries.
messageSchema.index({ room: 1, createdAt: -1 });

// Shape sent to the browser (works for populated or plain sender).
messageSchema.methods.toPublic = function (sender) {
  return {
    id: this._id.toString(),
    room: this.room.toString(),
    sender: { id: sender._id.toString(), username: sender.username },
    text: this.text,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Message", messageSchema);
