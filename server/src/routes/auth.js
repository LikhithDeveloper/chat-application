const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const User = require("../models/User");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const tokens = require("../tokens");

const router = express.Router();

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// A real hash used to burn the same CPU time when the user doesn't exist,
// so attackers can't discover valid emails by measuring response time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

// Max 20 attempts per 15 minutes per IP on login/register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
});

// ---------- Input rules ----------
const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers and _"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(100),
  // bcrypt only looks at the first 72 bytes, so we cap the length there.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .regex(/[a-zA-Z]/, "Password needs at least one letter")
    .regex(/[0-9]/, "Password needs at least one number"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(100),
  password: z.string().min(1).max(72),
});

// ---------- Helpers ----------
// Issues a fresh access token + refresh cookie and answers the request.
async function sendSession(res, user, status = 200) {
  const refresh = await tokens.createRefreshToken(user._id);
  res.cookie(tokens.COOKIE_NAME, refresh, tokens.cookieOptions);
  res.status(status).json({ accessToken: tokens.signAccessToken(user), user: user.toPublic() });
}

// ---------- Routes ----------
router.post("/register", authLimiter, validate(registerSchema), async (req, res) => {
  const { username, email, password } = req.body;

  const taken = await User.findOne({ $or: [{ email }, { usernameLower: username.toLowerCase() }] });
  if (taken) return res.status(409).json({ error: "Username or email is already in use" });

  const user = await User.create({
    username,
    usernameLower: username.toLowerCase(),
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
  });

  await sendSession(res, user, 201);
});

router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const invalid = () => res.status(401).json({ error: "Invalid email or password" });

  const user = await User.findOne({ email }).select("+passwordHash");

  // Unknown email: still do a bcrypt compare (see DUMMY_HASH), then give the same generic error.
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return invalid();
  }

  // Account lock: too many wrong passwords recently.
  if (user.lockUntil && user.lockUntil > new Date()) {
    return res.status(423).json({ error: "Account temporarily locked. Try again later." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLogins = 0;
    }
    await user.save();
    return invalid();
  }

  user.failedLogins = 0;
  user.lockUntil = null;
  await user.save();

  await sendSession(res, user);
});

// Trades the refresh cookie for a new access token (and a new refresh cookie).
router.post("/refresh", async (req, res) => {
  const raw = req.cookies[tokens.COOKIE_NAME];
  if (!raw) return res.status(401).json({ error: "No session" });

  const userId = await tokens.consumeRefreshToken(raw);
  const user = userId && (await User.findById(userId));
  if (!user) {
    res.clearCookie(tokens.COOKIE_NAME, { ...tokens.cookieOptions, maxAge: undefined });
    return res.status(401).json({ error: "Session expired" });
  }

  await sendSession(res, user);
});

router.post("/logout", async (req, res) => {
  const raw = req.cookies[tokens.COOKIE_NAME];
  if (raw) await tokens.revokeRefreshToken(raw);
  res.clearCookie(tokens.COOKIE_NAME, { ...tokens.cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

module.exports = router;
