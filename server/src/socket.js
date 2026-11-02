const { Server } = require("socket.io");

const config = require("./config");
const User = require("./models/User");
const Room = require("./models/Room");
const Message = require("./models/Message");
const { verifyAccessToken } = require("./tokens");

const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES_PER_10S = 15;

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

    // Start listening to a room's live messages. 2) AUTHORIZATION: members only.
    socket.on("room:open", async (roomId, ack) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: user._id });
        if (!room) return ack?.({ error: "You are not a member of this room" });
        socket.join(`room:${room._id}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ error: "Invalid room" });
      }
    });

    socket.on("room:close", (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    socket.on("message:send", async ({ roomId, text } = {}, ack) => {
      try {
        if (typeof text !== "string" || !text.trim() || text.length > MAX_MESSAGE_LENGTH) {
          return ack?.({ error: "Message must be 1-1000 characters" });
        }

        // Allow at most 15 messages per 10 seconds per connection.
        const now = Date.now();
        recentMessages = recentMessages.filter((t) => now - t < 10_000);
        if (recentMessages.length >= MAX_MESSAGES_PER_10S) {
          return ack?.({ error: "You are sending messages too fast" });
        }
        recentMessages.push(now);

        // Check membership against the DB every time (they might have left since).
        const room = await Room.findOne({ _id: roomId, members: user._id });
        if (!room) return ack?.({ error: "You are not a member of this room" });

        const message = await Message.create({ room: room._id, sender: user._id, text: text.trim() });
        io.to(`room:${room._id}`).emit("message:new", message.toPublic(user));
        ack?.({ ok: true });
      } catch {
        ack?.({ error: "Could not send message" });
      }
    });
  });

  return io;
}

module.exports = { createSocketServer };
