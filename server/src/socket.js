const { Server } = require("socket.io");
const { z } = require("zod");

const config = require("./config");
const User = require("./models/User");
const Room = require("./models/Room");
const Channel = require("./models/Channel");
const Message = require("./models/Message");
const { verifyAccessToken } = require("./tokens");

const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES_PER_10S = 15;
const MAX_GLOBAL_MESSAGES_PER_10S = 5; // stricter in the Global room, because strangers share it

// Everything a client sends is untrusted. These schemas describe the ONLY shapes we accept.
// (Wrong types, null, or objects like {"$ne": null} are rejected before touching the database.)
const roomIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid room");
const sendSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

// A client may forget (or fake) the acknowledgement callback, so only call it if it is a function.
const replyTo = (ack) => (typeof ack === "function" ? ack : () => {});

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  // 1) AUTHENTICATION: no valid access token => connection refused.
  io.use(async (socket, next) => {
    try {
      const userId = verifyAccessToken(socket.handshake.auth.token);
      const user = await User.findById(userId);
      if (!user) throw new Error("no user");
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    let recentMessages = []; // timestamps, used for simple flood protection
    let recentGlobal = [];   // same, but only for the Global room

    // Notification rooms (used by the REST routes to tell the right people that something changed):
    //   user:<id>      all tabs/devices of this user
    //   channel:<id>   everyone who belongs to a channel
    socket.join(`user:${user._id}`);
    Channel.find({ members: user._id }).select("_id")
      .then((channels) => channels.forEach((c) => socket.join(`channel:${c._id}`)))
      .catch(() => {});

    // Start listening to a room's live messages. 2) AUTHORIZATION: members only.
    socket.on("room:open", async (roomId, ack) => {
      const reply = replyTo(ack);
      try {
        const parsed = roomIdSchema.safeParse(roomId);
        if (!parsed.success) return reply({ error: "Invalid room" });

        const room = await Room.findAccessible(parsed.data, user._id);
        if (!room) return reply({ error: "You are not a member of this room" });
        socket.join(`room:${room._id}`);
        reply({ ok: true });
      } catch {
        reply({ error: "Invalid room" });
      }
    });

    socket.on("room:close", (roomId) => {
      const parsed = roomIdSchema.safeParse(roomId);
      if (parsed.success) socket.leave(`room:${parsed.data}`);
    });

    socket.on("message:send", async (payload, ack) => {
      const reply = replyTo(ack);
      try {
        const parsed = sendSchema.safeParse(payload);
        if (!parsed.success) return reply({ error: "Message must be 1-1000 characters" });
        const { roomId, text } = parsed.data;

        // Allow at most 15 messages per 10 seconds per connection.
        const now = Date.now();
        recentMessages = recentMessages.filter((t) => now - t < 10_000);
        if (recentMessages.length >= MAX_MESSAGES_PER_10S) {
          return reply({ error: "You are sending messages too fast" });
        }
        recentMessages.push(now);

        // Check membership against the DB every time (they might have left since).
        const room = await Room.findAccessible(roomId, user._id);
        if (!room) return reply({ error: "You are not a member of this room" });

        // Extra, tighter limit for the Global room.
        if (room.isGlobal) {
          recentGlobal = recentGlobal.filter((t) => now - t < 10_000);
          if (recentGlobal.length >= MAX_GLOBAL_MESSAGES_PER_10S) {
            return reply({ error: "Slow down, the Global room allows 5 messages per 10 seconds" });
          }
          recentGlobal.push(now);
        }

        const message = await Message.create({ room: room._id, sender: user._id, text });
        io.to(`room:${room._id}`).emit("message:new", message.toPublic(user));
        reply({ ok: true });
      } catch {
        reply({ error: "Could not send message" });
      }
    });
  });

  return io;
}

module.exports = { createSocketServer };
