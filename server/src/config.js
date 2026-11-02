// Loads environment variables once and refuses to start if anything unsafe is configured.
require("dotenv").config();

const env = process.env;

function required(name) {
  if (!env[name]) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return env[name];
}

const config = {
  port: Number(env.PORT) || 5000,
  mongoUri: required("MONGODB_URI"),
  clientOrigin: env.CLIENT_ORIGIN || "http://localhost:5173",
  isProd: env.NODE_ENV === "production",

  accessSecret: required("JWT_ACCESS_SECRET"),
  accessTtl: "15m", // short-lived: a stolen access token is only useful briefly
  refreshTtlDays: 7,
  authRateLimit: Number(env.AUTH_RATE_LIMIT) || 20, // login/register attempts per 15 min per IP
};

if (config.accessSecret.length < 32) {
  throw new Error("JWT_ACCESS_SECRET must be at least 32 characters");
}

module.exports = config;
