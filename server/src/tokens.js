// Everything about creating and checking tokens lives here.
//
//  - Access token : JWT, 15 min, sent in the "Authorization: Bearer" header (and socket handshake).
//  - Refresh token: random string, 7 days, kept in an httpOnly cookie (JavaScript can't read it,
//                   so XSS can't steal it). Only its SHA-256 hash is stored in MongoDB.
//                   It is ROTATED on every use: the old one is deleted, a new one is issued.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("./config");
const RefreshToken = require("./models/RefreshToken");

const COOKIE_NAME = "refresh_token";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString() }, config.accessSecret, {
    algorithm: "HS256",
    expiresIn: config.accessTtl,
  });
}

// Returns the user id, or throws if the token is forged / expired.
function verifyAccessToken(token) {
  // Pin the algorithm so an attacker can't switch to "none".
  const payload = jwt.verify(token, config.accessSecret, { algorithms: ["HS256"] });
  return payload.sub;
}

async function createRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, tokenHash: hash(raw), expiresAt });
  return raw;
}

// Use a refresh token exactly once (find + delete in one step).
// Returns the user id, or null if the token is unknown, already used, or expired.
async function consumeRefreshToken(raw) {
  const doc = await RefreshToken.findOneAndDelete({ tokenHash: hash(raw) });
  if (!doc || doc.expiresAt < new Date()) return null;
  return doc.user;
}

async function revokeRefreshToken(raw) {
  await RefreshToken.deleteOne({ tokenHash: hash(raw) });
}

const cookieOptions = {
  httpOnly: true, // not readable by JavaScript
  secure: config.isProd, // HTTPS only in production
  sameSite: "strict", // never sent on cross-site requests (CSRF protection)
  path: "/api/auth", // only sent to the auth endpoints
  maxAge: config.refreshTtlDays * 24 * 60 * 60 * 1000,
};

module.exports = {
  COOKIE_NAME,
  cookieOptions,
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
};
