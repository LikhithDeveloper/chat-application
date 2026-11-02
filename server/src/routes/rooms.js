const express = require("express");

const Room = require("../models/Room");
const Channel = require("../models/Channel");
const Message = require("../models/Message");
const JoinRequest = require("../models/JoinRequest");
const { requireAuth } = require("../middleware/auth");

/*
 * Routes for ONE existing room. (Rooms are created inside a channel: POST /api/channels/:id/rooms.)
 *
 *   public  room: a member of the channel joins directly
 *   private room: a member of the channel sends a request, the channel admin approves
 */
module.exports = function roomRoutes(io) {
  const router = express.Router();
  router.use(requireAuth);

  async function findRoom(req, res) {
    const room = await Room.findById(req.params.id);
    if (!room) res.status(404).json({ error: "Room not found" });
    return room;
  }

  // Loads the room AND its channel, and makes sure the user is a member of that channel.
  // Returns { room, channel } or answers the request with an error and returns null.
  async function findRoomInMyChannel(req, res) {
    const room = await findRoom(req, res);
    if (!room) return null;

    if (room.isGlobal) {
      res.status(400).json({ error: "Everyone is already in the Global room" });
      return null;
    }

    const channel = await Channel.findById(room.channel);
    if (!channel || !channel.hasMember(req.user._id)) {
      res.status(403).json({ error: "Join the channel first" });
      return null;
    }
    return { room, channel };
  }

  const refresh = (channelId) => io.to(`channel:${channelId}`).emit("rooms:changed");

  // PUBLIC room: join directly.
  router.post("/:id/join", async (req, res) => {
    const found = await findRoomInMyChannel(req, res);
    if (!found) return;
    const { room, channel } = found;

    if (room.isPrivate) {
      return res.status(403).json({ error: "This room is private. Send a join request instead." });
    }

    await Room.updateOne({ _id: room._id }, { $addToSet: { members: req.user._id } }); // safe to repeat
    refresh(channel._id);
    res.json({ ok: true });
  });

  // PRIVATE room: ask the channel admin.
  router.post("/:id/request", async (req, res) => {
    const found = await findRoomInMyChannel(req, res);
    if (!found) return;
    const { room, channel } = found;

    if (!room.isPrivate) return res.status(400).json({ error: "This room is public, just join it" });
    if (room.members.some((m) => m.equals(req.user._id))) {
      return res.status(400).json({ error: "You are already a member" });
    }

    try {
      await JoinRequest.create({ user: req.user._id, channel: channel._id, room: room._id });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "You already have a pending request" });
      throw err;
    }

    io.to(`user:${channel.owner}`).emit("requests:changed"); // ping the admin
    io.to(`user:${req.user._id}`).emit("requests:changed");
    res.status(201).json({ ok: true });
  });

  router.delete("/:id/request", async (req, res) => {
    const found = await findRoomInMyChannel(req, res);
    if (!found) return;
    const { room, channel } = found;

    await JoinRequest.deleteOne({ user: req.user._id, channel: channel._id, room: room._id, status: "pending" });
    io.to(`user:${channel.owner}`).emit("requests:changed");
    io.to(`user:${req.user._id}`).emit("requests:changed");
    res.json({ ok: true });
  });

  router.post("/:id/leave", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    if (room.isGlobal) return res.status(400).json({ error: "Everyone stays in the Global room" });
    // The admin created the room, so they delete it instead of leaving it.
    if (room.owner.equals(req.user._id)) {
      return res.status(400).json({ error: "Admins can't leave. Delete the room instead." });
    }

    await Room.updateOne({ _id: room._id }, { $pull: { members: req.user._id } });
    io.in(`user:${req.user._id}`).socketsLeave(`room:${room._id}`); // stop live messages at once
    refresh(room.channel);
    res.json({ ok: true });
  });

  // Only the admin of the room's channel may delete it.
  router.delete("/:id", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    const channel = room.isGlobal ? null : await Channel.findById(room.channel);
    if (!channel || !channel.owner.equals(req.user._id)) {
      return res.status(403).json({ error: "Only the channel admin can delete a room" });
    }

    await Message.deleteMany({ room: room._id });
    await JoinRequest.deleteMany({ room: room._id });
    await room.deleteOne();

    io.socketsLeave(`room:${room._id}`);
    refresh(channel._id);
    res.json({ ok: true });
  });

  // Message history: only for people who may read the room (see Room.findAccessible).
  router.get("/:id/messages", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    if (!(await Room.findAccessible(room._id, req.user._id))) {
      return res.status(403).json({ error: "You don't have access to this room" });
    }

    const messages = await Message.find({ room: room._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("sender", "username");

    // Reverse so the oldest of the last 100 comes first.
    res.json({ messages: messages.reverse().map((m) => m.toPublic(m.sender)) });
  });

  return router;
};
