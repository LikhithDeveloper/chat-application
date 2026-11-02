// Runs once at startup: makes sure indexes, the Global room and old data are in the right shape.
const Room = require("./models/Room");
const Channel = require("./models/Channel");
const JoinRequest = require("./models/JoinRequest");

// Before channels existed, rooms floated around on their own. Rooms may no longer exist outside
// a channel, so we gather those old rooms into one public channel called "Community".
async function moveLegacyRooms() {
  // (Very old documents have no isGlobal field at all, so match "anything that is not true".)
  const legacy = await Room.find({ isGlobal: { $ne: true }, channel: null }).sort({ createdAt: 1 });
  if (!legacy.length) return;

  const people = new Set();
  legacy.forEach((r) => {
    people.add(String(r.owner));
    r.members.forEach((m) => people.add(String(m)));
  });

  let channel = await Channel.findOne({ nameLower: "community" });
  if (!channel) {
    channel = await Channel.create({
      name: "Community",
      nameLower: "community",
      description: "Rooms that were created before channels existed",
      type: "public",
      owner: legacy[0].owner, // the person who made the oldest room becomes the admin
      members: [],
    });
  }
  await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: { $each: [...people] } } });

  for (const room of legacy) {
    room.channel = channel._id;
    room.isPrivate = false;
    await room.save();
  }
  console.log(`Moved ${legacy.length} old room(s) into the "Community" channel`);
}

async function prepareDatabase() {
  // syncIndexes also removes the old "room names are unique everywhere" index.
  await Promise.all([Room.syncIndexes(), Channel.syncIndexes(), JoinRequest.syncIndexes()]);
  await Room.ensureGlobal();
  await moveLegacyRooms();
}

module.exports = { prepareDatabase };
