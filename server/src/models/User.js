const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // Lower-cased copy used for the uniqueness check ("Sam" and "sam" are the same person).
    usernameLower: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // never returned by default
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// What we are happy to send to the browser.
userSchema.methods.toPublic = function () {
  return { id: this._id.toString(), username: this.username, email: this.email };
};

module.exports = mongoose.model("User", userSchema);
