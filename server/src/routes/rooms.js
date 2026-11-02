const express = require("express");
const { z } = require("zod");

const Room = require("../models/Room");
const Message = require("../models/Message");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

// `io` is passed in so room changes can be announced to everyone in real time.
module.exports = function roomRoutes(io) {
  const router = express.Router();
  router.use(requireAuth); // every route below needs a logged-in user

  const createSchema = z.object({
    name: z.string().trim().min(3, "Room name must be at least 3 characters").max(30),
    description: z.string().trim().max(120).default(""),
  });

  // Loads :id or answers 404. Used by the routes that need a room.
  async function findRoom(req, res) {
    const room = await Room.findById(req.params.id);
    if (!room) res.status(404).json({ error: "Room not found" });
    return room;
  }

  // List ALL rooms (everyone can see and join any room).
  router.get("/", async (req, res) => {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json({ rooms: rooms.map((r) => r.toPublic(req.user._id)) });
  });

  // Create a room. The creator becomes owner and first member.
  router.post("/", validate(createSchema), async (req, res) => {
    const { name, description } = req.body;

    if (await Room.exists({ nameLower: name.toLowerCase() })) {
      return res.status(409).json({ error: "A room with that name already exists" });
    }

    const room = await Room.create({
      name,
      nameLower: name.toLowerCase(),
      description,
      owner: req.user._id,
      members: [req.user._id],
    });

    io.emit("room:created", { id: room._id.toString() }); // tell every client to refresh its list
    res.status(201).json({ room: room.toPublic(req.user._id) });
  });

  router.post("/:id/join", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    // $addToSet = add only if not already there (safe to call twice).
    await Room.updateOne({ _id: room._id }, { $addToSet: { members: req.user._id } });
    const updated = await Room.findById(room._id);

    io.emit("room:updated", { id: room._id.toString() });
    res.json({ room: updated.toPublic(req.user._id) });
  });

  router.post("/:id/leave", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    // The owner can't abandon their own room; they can delete it instead.
    if (room.owner.equals(req.user._id)) {
      return res.status(400).json({ error: "Owners can't leave. Delete the room instead." });
    }

    await Room.updateOne({ _id: room._id }, { $pull: { members: req.user._id } });
    const updated = await Room.findById(room._id);

    io.emit("room:updated", { id: room._id.toString() });
    res.json({ room: updated.toPublic(req.user._id) });
  });

  // Only the owner may delete a room (authorization check).
  router.delete("/:id", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    if (!room.owner.equals(req.user._id)) {
      return res.status(403).json({ error: "Only the room owner can delete it" });
    }

    await Message.deleteMany({ room: room._id });
    await room.deleteOne();

    io.emit("room:deleted", { id: room._id.toString() });
    res.json({ ok: true });
  });

  // Message history. Members only — joining is what grants read access.
  router.get("/:id/messages", async (req, res) => {
    const room = await findRoom(req, res);
    if (!room) return;

    if (!room.members.some((m) => m.equals(req.user._id))) {
      return res.status(403).json({ error: "Join this room to see its messages" });
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
