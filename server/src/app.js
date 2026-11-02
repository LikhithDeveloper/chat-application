const express = require("express");
const http = require("http");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const { createSocketServer } = require("./socket");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const { notFound, errorHandler } = require("./middleware/errors");

// Builds the app without starting it (so tests can use it too).
function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  app.disable("x-powered-by");
  app.use(helmet()); // secure HTTP headers
  app.use(cors({ origin: config.clientOrigin, credentials: true })); // only our own frontend
  app.use(express.json({ limit: "10kb" })); // reject huge bodies
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/rooms", roomRoutes(io));

  app.use(notFound);
  app.use(errorHandler);

  return { app, server, io };
}

module.exports = { createApp };
