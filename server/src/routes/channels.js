const express = require("express");
const { z } = require("zod");

const Channel = require("../models/Channel");
const Room = require("../models/Room");
const Message = require("../models/Message");
const JoinRequest = require("../models/JoinRequest");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

/*
 * Who may do what (the "admin" of a channel is its owner):
 *
 *   action                         public channel        private channel
 *   ------------------------------ --------------------- ---------------------------------
 *   see it in the list             everyone              everyone (name + description only)
 *   become a member                join directly         send a request -> admin approves
 *   see its rooms                  members               members
 *   create rooms                   admin only            admin only
 *   delete the channel             admin only            admin only
 *
 * Rooms inside a channel follow the same pattern (public = join, private = request).
 * Everything below is checked on the SERVER; the buttons in the UI are only a convenience.
 */
module.exports = function channelRoutes(io) {
  const router = express.Router();
  router.use(requireAuth);

  const channelSchema = z.object({
    name: z.string().trim().min(3, "Channel name must be at least 3 characters").max(30),
    description: z.string().trim().max(120).default(""),
    type: z.enum(["public", "private"]).default("public"),
  });

  const roomSchema = z.object({
    name: z.string().trim().min(2, "Room name must be at least 2 characters").max(30),
    description: z.string().trim().max(120).default(""),
    isPrivate: z.boolean().default(false),
  });

  // ---------- small helpers ----------
  async function findChannel(req, res) {
    const channel = await Channel.findById(req.params.id);
    if (!channel) res.status(404).json({ error: "Channel not found" });
    return channel;
  }

  // Answers 403 unless the logged-in user is this channel's admin. Returns true when allowed.
  function requireOwner(channel, req, res, message = "Only the channel admin can do this") {
    if (channel.owner.equals(req.user._id)) return true;
    res.status(403).json({ error: message });
    return false;
  }

  const tell = {
    everyone: () => io.emit("channels:changed"),                              // the channel list changed
    channelMembers: (id) => io.to(`channel:${id}`).emit("rooms:changed"),     // rooms/members changed
    user: (id) => io.to(`user:${id}`).emit("requests:changed"),               // a request needs attention
  };

  // Puts / removes all live sockets of a user in a channel's notification room.
  const subscribe = (userId, channelId) => io.in(`user:${userId}`).socketsJoin(`channel:${channelId}`);
  const unsubscribe = (userId, channelId) => io.in(`user:${userId}`).socketsLeave(`channel:${channelId}`);

  // Stops a user's live sockets from receiving messages of these rooms.
  const stopListening = (userId, roomIds) =>
    roomIds.forEach((rid) => io.in(`user:${userId}`).socketsLeave(`room:${rid}`));

  // ---------- list everything the viewer can see ----------
  router.get("/", async (req, res) => {
    const uid = req.user._id;

    const [channels, globalRoom, myRequests] = await Promise.all([
      Channel.find().sort({ createdAt: -1 }),
      Room.findOne({ isGlobal: true }),
      JoinRequest.find({ user: uid }).sort({ createdAt: 1 }),
    ]);

    // The viewer's latest request per target. "approved" is dropped (they are in already).
    const requestStatus = new Map();
    for (const r of myRequests) requestStatus.set(`${r.channel}:${r.room || ""}`, r.status);
    const statusFor = (channelId, roomId = "") => {
      const s = requestStatus.get(`${channelId}:${roomId}`);
      return s === "pending" || s === "rejected" ? s : null;
    };

    // Rooms are only shown to members of the channel.
    const memberChannelIds = channels.filter((c) => c.hasMember(uid)).map((c) => c._id);
    const rooms = await Room.find({ channel: { $in: memberChannelIds } }).sort({ createdAt: 1 });
    const roomsByChannel = new Map();
    for (const room of rooms) {
      const key = room.channel.toString();
      if (!roomsByChannel.has(key)) roomsByChannel.set(key, []);
      roomsByChannel.get(key).push(room.toPublic(uid, statusFor(room.channel, room._id)));
    }

    // How many requests are waiting for the channels this user administers.
    const ownedIds = channels.filter((c) => c.owner.equals(uid)).map((c) => c._id);
    const pending = await JoinRequest.aggregate([
      { $match: { channel: { $in: ownedIds }, status: "pending" } },
      { $group: { _id: "$channel", count: { $sum: 1 } } },
    ]);
    const pendingByChannel = new Map(pending.map((p) => [p._id.toString(), p.count]));

    res.json({
      global: globalRoom ? globalRoom.toPublic(uid) : null,
      channels: channels.map((c) =>
        c.toPublic(uid, {
          requestStatus: statusFor(c._id),
          rooms: roomsByChannel.get(c._id.toString()) || [],
          pendingCount: pendingByChannel.get(c._id.toString()) || 0,
        })
      ),
    });
  });

  // ---------- create a channel (the creator becomes its admin) ----------
  router.post("/", validate(channelSchema), async (req, res) => {
    const { name, description, type } = req.body;

    if (await Channel.exists({ nameLower: name.toLowerCase() })) {
      return res.status(409).json({ error: "A channel with that name already exists" });
    }

    const channel = await Channel.create({
      name,
      nameLower: name.toLowerCase(),
      description,
      type,
      owner: req.user._id,
      members: [req.user._id],
    });

    subscribe(req.user._id, channel._id);
    tell.everyone();
    res.status(201).json({ channel: channel.toPublic(req.user._id) });
  });

  // ---------- become a member ----------
  // PUBLIC channel: join directly.
  router.post("/:id/join", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;

    if (channel.type === "private") {
      return res.status(403).json({ error: "This channel is private. Send a join request instead." });
    }

    await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: req.user._id } }); // safe to repeat
    subscribe(req.user._id, channel._id);
    tell.everyone();
    res.json({ ok: true });
  });

  // PRIVATE channel: ask the admin.
  router.post("/:id/request", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;

    if (channel.type !== "private") return res.status(400).json({ error: "This channel is public, just join it" });
    if (channel.hasMember(req.user._id)) return res.status(400).json({ error: "You are already a member" });

    try {
      await JoinRequest.create({ user: req.user._id, channel: channel._id, room: null });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "You already have a pending request" });
      throw err;
    }

    tell.user(channel.owner);        // ping the admin
    tell.user(req.user._id);         // refresh the requester's other tabs
    res.status(201).json({ ok: true });
  });

  router.delete("/:id/request", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;
    await JoinRequest.deleteOne({ user: req.user._id, channel: channel._id, room: null, status: "pending" });
    tell.user(channel.owner);
    res.json({ ok: true });
  });

  // ---------- leave / delete ----------
  router.post("/:id/leave", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;

    if (channel.owner.equals(req.user._id)) {
      return res.status(400).json({ error: "Admins can't leave. Delete the channel instead." });
    }

    // Leaving the channel also means leaving every room inside it.
    const rooms = await Room.find({ channel: channel._id }).select("_id");
    const roomIds = rooms.map((r) => r._id);
    await Promise.all([
      Channel.updateOne({ _id: channel._id }, { $pull: { members: req.user._id } }),
      Room.updateMany({ channel: channel._id }, { $pull: { members: req.user._id } }),
      JoinRequest.deleteMany({ user: req.user._id, channel: channel._id, status: "pending" }),
    ]);

    stopListening(req.user._id, roomIds);
    unsubscribe(req.user._id, channel._id);
    tell.everyone();
    res.json({ ok: true });
  });

  router.delete("/:id", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;
    if (!requireOwner(channel, req, res, "Only the channel admin can delete it")) return;

    const rooms = await Room.find({ channel: channel._id }).select("_id");
    const roomIds = rooms.map((r) => r._id);
    await Message.deleteMany({ room: { $in: roomIds } });
    await Room.deleteMany({ channel: channel._id });
    await JoinRequest.deleteMany({ channel: channel._id });
    await channel.deleteOne();

    roomIds.forEach((rid) => io.socketsLeave(`room:${rid}`));
    io.socketsLeave(`channel:${channel._id}`);
    tell.everyone();
    res.json({ ok: true });
  });

  // ---------- admin only: create a room inside the channel ----------
  router.post("/:id/rooms", validate(roomSchema), async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;
    if (!requireOwner(channel, req, res, "Only the channel admin can create rooms")) return;

    const { name, description, isPrivate } = req.body;
    if (await Room.exists({ channel: channel._id, nameLower: name.toLowerCase() })) {
      return res.status(409).json({ error: "This channel already has a room with that name" });
    }

    const room = await Room.create({
      name,
      nameLower: name.toLowerCase(),
      description,
      isPrivate,
      channel: channel._id,
      owner: req.user._id,
      members: [req.user._id],
    });

    tell.channelMembers(channel._id);
    res.status(201).json({ room: room.toPublic(req.user._id) });
  });

  // ---------- admin only: the approval inbox ----------
  router.get("/:id/requests", async (req, res) => {
    const channel = await findChannel(req, res);
    if (!channel) return;
    if (!requireOwner(channel, req, res, "Only the channel admin can see requests")) return;

    const requests = await JoinRequest.find({ channel: channel._id, status: "pending" })
      .sort({ createdAt: 1 })
      .populate("user", "username")
      .populate("room", "name");

    res.json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        kind: r.room ? "room" : "channel",
        user: { id: r.user._id.toString(), username: r.user.username },
        room: r.room ? { id: r.room._id.toString(), name: r.room.name } : null,
        createdAt: r.createdAt,
      })),
    });
  });

  // Approve or reject. Only the admin of THIS channel, and only for requests that belong to it.
  async function decide(req, res, approve) {
    const channel = await findChannel(req, res);
    if (!channel) return;
    if (!requireOwner(channel, req, res, "Only the channel admin can answer requests")) return;

    // findOneAndUpdate makes the decision atomic: two clicks can't both succeed.
    const request = await JoinRequest.findOneAndUpdate(
      { _id: req.params.reqId, channel: channel._id, status: "pending" },
      { status: approve ? "approved" : "rejected", decidedAt: new Date() },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: "Request not found or already answered" });

    if (approve && !request.room) {
      // channel request -> becomes a channel member
      await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: request.user } });
      subscribe(request.user, channel._id);
    } else if (approve && request.room) {
      // room request -> becomes a room member (only if still in the channel)
      if (channel.hasMember(request.user)) {
        await Room.updateOne({ _id: request.room }, { $addToSet: { members: request.user } });
      }
    }

    tell.user(request.user);          // tell the requester the answer arrived
    tell.user(channel.owner);
    tell.everyone();
    tell.channelMembers(channel._id);
    res.json({ ok: true });
  }
  router.post("/:id/requests/:reqId/approve", (req, res) => decide(req, res, true));
  router.post("/:id/requests/:reqId/reject", (req, res) => decide(req, res, false));

  return router;
};
