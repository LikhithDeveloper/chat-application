const User = require("../models/User");
const { verifyAccessToken } = require("../tokens");

// Protects a route: requires a valid access token, then loads the user into req.user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let userId;
  try {
    userId = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Load the user on every request so deleted accounts lose access immediately.
  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error: "User no longer exists" });

  req.user = user;
  next();
}

module.exports = { requireAuth };
