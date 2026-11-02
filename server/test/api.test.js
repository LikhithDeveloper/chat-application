// End-to-end test: real HTTP + real sockets against a throwaway local MongoDB database.
// (Needs MongoDB running; set TEST_MONGODB_URI to override the default.)
// Run with:  npm test
process.env.JWT_ACCESS_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGODB_URI = "mongodb://placeholder"; // replaced below
process.env.AUTH_RATE_LIMIT = "1000"; // the tests register many users from one IP

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { io: connect } = require("socket.io-client");

let server, base;

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/like-chat-test");
  await mongoose.connection.dropDatabase(); // start clean
  await require("../src/prepareDatabase").prepareDatabase(); // indexes + Global room
  const { createApp } = require("../src/app");
  server = createApp().server;
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// Small helper: call the API, return { status, body, cookie }.
async function api(path, { method = "GET", body, token, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: cookie }),
    },
    body: body && JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.()[0]?.split(";")[0];
  return { status: res.status, body: await res.json(), cookie: setCookie };
}

const register = (name) =>
  api("/api/auth/register", {
    method: "POST",
    body: { username: name, email: `${name}@test.com`, password: "password1" },
  });

// ---------- helpers for the channel tests ----------
const as = (user) => ({ token: user.accessToken });
const makeChannel = (user, name, type = "public") =>
  api("/api/channels", { method: "POST", ...as(user), body: { name, type } });
const makeRoom = (user, channelId, name, isPrivate = false) =>
  api(`/api/channels/${channelId}/rooms`, { method: "POST", ...as(user), body: { name, isPrivate } });
const post = (user, path) => api(path, { method: "POST", ...as(user) });
const openSocket = async (user) => {
  const s = connect(base, { auth: { token: user.accessToken }, transports: ["websocket"] });
  await new Promise((r) => s.on("connect", r));
  return s;
};
const listChannel = async (user, channelId) =>
  (await api("/api/channels", as(user))).body.channels.find((c) => c.id === channelId);

// =====================================================================
//  Authentication
// =====================================================================
test("register, login, wrong password, refresh rotation", async () => {
  const reg = await register("alice");
  assert.equal(reg.status, 201);
  assert.ok(reg.body.accessToken);
  assert.equal(reg.body.user.passwordHash, undefined, "hash must never leak");

  assert.equal((await register("alice")).status, 409, "duplicate rejected");

  const bad = await api("/api/auth/login", { method: "POST", body: { email: "alice@test.com", password: "wrong" } });
  assert.equal(bad.status, 401);

  const ok = await api("/api/auth/login", { method: "POST", body: { email: "alice@test.com", password: "password1" } });
  assert.equal(ok.status, 200);

  const r1 = await api("/api/auth/refresh", { method: "POST", cookie: ok.cookie });
  assert.equal(r1.status, 200);
  const replay = await api("/api/auth/refresh", { method: "POST", cookie: ok.cookie });
  assert.equal(replay.status, 401, "old refresh token cannot be reused");
});

test("weak passwords and NoSQL injection are rejected", async () => {
  const weak = await api("/api/auth/register", {
    method: "POST",
    body: { username: "weak", email: "weak@test.com", password: "short" },
  });
  assert.equal(weak.status, 400);

  const inject = await api("/api/auth/login", {
    method: "POST",
    body: { email: { $gt: "" }, password: { $gt: "" } },
  });
  assert.equal(inject.status, 400);
});

test("account locks after repeated failures", async () => {
  await register("locky");
  const attempt = () =>
    api("/api/auth/login", { method: "POST", body: { email: "locky@test.com", password: "nope-nope1" } });
  for (let i = 0; i < 5; i++) await attempt();
  const good = await api("/api/auth/login", { method: "POST", body: { email: "locky@test.com", password: "password1" } });
  assert.equal(good.status, 423);
});

test("protected routes need a valid token", async () => {
  assert.equal((await api("/api/channels")).status, 401);
  assert.equal((await api("/api/channels", { token: "garbage" })).status, 401);
  assert.equal((await api("/api/rooms/123/messages")).status, 401);
});

// =====================================================================
//  Channels and rooms
// =====================================================================
test("rooms cannot be created outside a channel", async () => {
  const gina = (await register("gina")).body;
  const res = await api("/api/rooms", { method: "POST", ...as(gina), body: { name: "loose-room" } });
  assert.equal(res.status, 404, "there is no endpoint that creates a room without a channel");
});

test("public channel: join directly, only the admin creates rooms, rooms are hidden from outsiders", async () => {
  const bob = (await register("bob")).body; // channel admin
  const carol = (await register("carol")).body; // regular user

  const ch = await makeChannel(bob, "Lounge");
  assert.equal(ch.status, 201);
  const channelId = ch.body.channel.id;
  assert.equal((await makeChannel(carol, "lounge")).status, 409, "channel names are unique");

  const pub = await makeRoom(bob, channelId, "chat");
  const priv = await makeRoom(bob, channelId, "vip", true);
  assert.equal(pub.status, 201);
  assert.equal((await makeRoom(bob, channelId, "CHAT")).status, 409, "room names are unique inside a channel");

  // Carol is not a member: she sees the channel but none of its rooms.
  const before = await listChannel(carol, channelId);
  assert.equal(before.isMember, false);
  assert.equal(before.rooms.length, 0);
  assert.equal((await post(carol, `/api/rooms/${pub.body.room.id}/join`)).status, 403, "must join the channel first");

  // Only the admin can create rooms.
  assert.equal((await makeRoom(carol, channelId, "hacked")).status, 403);

  // Public channel: join directly. Now she sees the rooms.
  assert.equal((await post(carol, `/api/channels/${channelId}/join`)).status, 200);
  const after = await listChannel(carol, channelId);
  assert.equal(after.isMember, true);
  assert.equal(after.rooms.length, 2);

  // Public room: join directly. Private room: refused (must request).
  assert.equal((await post(carol, `/api/rooms/${pub.body.room.id}/join`)).status, 200);
  assert.equal((await post(carol, `/api/rooms/${priv.body.room.id}/join`)).status, 403);

  // The admin cannot leave. Only the admin deletes.
  assert.equal((await post(bob, `/api/channels/${channelId}/leave`)).status, 400);
  assert.equal((await api(`/api/channels/${channelId}`, { method: "DELETE", ...as(carol) })).status, 403);
});

test("private channel: join needs a request that only that channel's admin can approve", async () => {
  const hank = (await register("hank")).body; // admin of "Secret"
  const ivy = (await register("ivy")).body; // wants in
  const jack = (await register("jack")).body; // wants in, gets rejected
  const kim = (await register("kim")).body; // admin of a DIFFERENT channel

  const channelId = (await makeChannel(hank, "Secret", "private")).body.channel.id;
  const otherId = (await makeChannel(kim, "Other", "private")).body.channel.id;
  await makeRoom(hank, channelId, "plans");

  // No direct join for private channels.
  assert.equal((await post(ivy, `/api/channels/${channelId}/join`)).status, 403);

  // Send a request. A second one is refused.
  assert.equal((await post(ivy, `/api/channels/${channelId}/request`)).status, 201);
  assert.equal((await post(ivy, `/api/channels/${channelId}/request`)).status, 409);
  assert.equal((await listChannel(ivy, channelId)).requestStatus, "pending");
  assert.equal((await listChannel(ivy, channelId)).rooms.length, 0, "still can't see rooms");
  assert.equal((await listChannel(hank, channelId)).pendingCount, 1);

  // Nobody except the channel admin can read or answer requests.
  const inbox = await api(`/api/channels/${channelId}/requests`, as(hank));
  assert.equal(inbox.body.requests.length, 1);
  const reqId = inbox.body.requests[0].id;
  assert.equal(inbox.body.requests[0].user.username, "ivy");
  assert.equal((await api(`/api/channels/${channelId}/requests`, as(ivy))).status, 403, "requester can't read the inbox");
  assert.equal((await post(ivy, `/api/channels/${channelId}/requests/${reqId}/approve`)).status, 403, "can't approve yourself");
  assert.equal((await post(kim, `/api/channels/${channelId}/requests/${reqId}/approve`)).status, 403, "another channel's admin can't approve");
  assert.equal((await post(kim, `/api/channels/${otherId}/requests/${reqId}/approve`)).status, 404, "request id from another channel is not found");

  // The admin approves: now she is in and sees the rooms.
  assert.equal((await post(hank, `/api/channels/${channelId}/requests/${reqId}/approve`)).status, 200);
  assert.equal((await post(hank, `/api/channels/${channelId}/requests/${reqId}/approve`)).status, 404, "can't answer twice");
  const joined = await listChannel(ivy, channelId);
  assert.equal(joined.isMember, true);
  assert.equal(joined.rooms.length, 1);

  // Rejection keeps the user out, shows "rejected", and they may ask again.
  await post(jack, `/api/channels/${channelId}/request`);
  const jackReq = (await api(`/api/channels/${channelId}/requests`, as(hank))).body.requests[0].id;
  assert.equal((await post(hank, `/api/channels/${channelId}/requests/${jackReq}/reject`)).status, 200);
  const rejected = await listChannel(jack, channelId);
  assert.equal(rejected.isMember, false);
  assert.equal(rejected.requestStatus, "rejected");
  assert.equal((await post(jack, `/api/channels/${channelId}/request`)).status, 201, "can ask again");
});

test("private room: request, admin approves, then live chat; leaving the channel removes access", async () => {
  const lena = (await register("lena")).body; // admin
  const mo = (await register("moe")).body; // member of the channel

  const channelId = (await makeChannel(lena, "Hub")).body.channel.id;
  const roomId = (await makeRoom(lena, channelId, "vip-lounge", true)).body.room.id;
  await post(mo, `/api/channels/${channelId}/join`);

  const sock = await openSocket(mo);
  assert.ok((await sock.emitWithAck("room:open", roomId)).error, "channel member is not yet in the private room");
  assert.equal((await api(`/api/rooms/${roomId}/messages`, as(mo))).status, 403);

  // Request -> pending -> admin approves
  assert.equal((await post(mo, `/api/rooms/${roomId}/request`)).status, 201);
  assert.equal((await post(mo, `/api/rooms/${roomId}/request`)).status, 409);
  const inbox = (await api(`/api/channels/${channelId}/requests`, as(lena))).body.requests;
  assert.equal(inbox[0].kind, "room");
  assert.equal(inbox[0].room.name, "vip-lounge");
  assert.equal((await post(mo, `/api/channels/${channelId}/requests/${inbox[0].id}/approve`)).status, 403);
  assert.equal((await post(lena, `/api/channels/${channelId}/requests/${inbox[0].id}/approve`)).status, 200);

  // Now Mo can chat live and read history.
  assert.ok((await sock.emitWithAck("room:open", roomId)).ok);
  const heard = new Promise((r) => sock.on("message:new", r));
  assert.ok((await sock.emitWithAck("message:send", { roomId, text: "hi vip" })).ok);
  assert.equal((await heard).text, "hi vip");
  assert.equal((await api(`/api/rooms/${roomId}/messages`, as(mo))).body.messages.length, 1);

  // Leaving the channel cuts off the room too, immediately.
  assert.equal((await post(mo, `/api/channels/${channelId}/leave`)).status, 200);
  assert.ok((await sock.emitWithAck("message:send", { roomId, text: "still here?" })).error);
  assert.equal((await api(`/api/rooms/${roomId}/messages`, as(mo))).status, 403);
  sock.close();

  // Only the channel admin may delete the room.
  assert.equal((await api(`/api/rooms/${roomId}`, { method: "DELETE", ...as(mo) })).status, 403);
  assert.equal((await api(`/api/rooms/${roomId}`, { method: "DELETE", ...as(lena) })).status, 200);
});

// =====================================================================
//  Sockets: hardening and the Global room
// =====================================================================
test("bad socket token is refused", async () => {
  const bad = connect(base, { auth: { token: "garbage" }, transports: ["websocket"] });
  const err = await new Promise((r) => bad.on("connect_error", r));
  assert.equal(err.message, "Unauthorized");
  bad.close();
});

test("sockets survive malformed payloads and reject operator injection", async () => {
  const dave = (await register("dave")).body;
  const channelId = (await makeChannel(dave, "Hardening")).body.channel.id;
  const roomId = (await makeRoom(dave, channelId, "tests")).body.room.id;

  const sock = await openSocket(dave);

  // Garbage that used to crash the server or slip into the database query.
  sock.emit("message:send", null);
  sock.emit("message:send", "not an object");
  sock.emit("message:send", { roomId: { $ne: null }, text: "x" }, "not a function");
  sock.emit("room:close", { weird: true });
  const injected = await sock.emitWithAck("room:open", { $ne: null });
  assert.equal(injected.error, "Invalid room", "operator objects are rejected");
  const notString = await sock.emitWithAck("message:send", { roomId, text: { $gt: "" } });
  assert.ok(notString.error, "non-string text is rejected");

  // The server is still alive and works normally.
  assert.ok((await sock.emitWithAck("room:open", roomId)).ok);
  assert.ok((await sock.emitWithAck("message:send", { roomId, text: "still fine" })).ok);
  sock.close();
});

test("global chat: everyone can read and write without joining, nobody can delete or leave it", async () => {
  const Room = require("../src/models/Room");
  const global = await Room.ensureGlobal();
  const globalId = global._id.toString();
  assert.equal((await Room.ensureGlobal())._id.toString(), globalId, "only one Global room is ever made");

  const erin = (await register("erin")).body; // brand-new users, never joined anything
  const frank = (await register("frank")).body;

  const list = await api("/api/channels", as(erin));
  assert.equal(list.body.global.isGlobal, true);
  assert.equal(list.body.global.isMember, true);

  const a = await openSocket(erin);
  const b = await openSocket(frank);
  assert.ok((await a.emitWithAck("room:open", globalId)).ok);
  assert.ok((await b.emitWithAck("room:open", globalId)).ok);

  const heard = new Promise((r) => b.on("message:new", r));
  assert.ok((await a.emitWithAck("message:send", { roomId: globalId, text: "hello world" })).ok);
  assert.equal((await heard).text, "hello world");

  const history = await api(`/api/rooms/${globalId}/messages`, as(frank));
  assert.equal(history.status, 200);
  assert.equal(history.body.messages.length, 1);

  // Stricter flood limit: only 5 messages per 10 s in Global.
  let blocked = 0;
  for (let i = 0; i < 8; i++) {
    const res = await a.emitWithAck("message:send", { roomId: globalId, text: "spam " + i });
    if (res.error) blocked++;
  }
  assert.ok(blocked >= 3, "global flood limit kicks in");

  assert.equal((await post(erin, `/api/rooms/${globalId}/leave`)).status, 400);
  assert.equal((await api(`/api/rooms/${globalId}`, { method: "DELETE", ...as(erin) })).status, 403);
  a.close();
  b.close();
});

// =====================================================================
//  Upgrading an existing database
// =====================================================================
test("old rooms from before channels are moved into a public 'Community' channel", async () => {
  const Room = require("../src/models/Room");
  const Channel = require("../src/models/Channel");
  const { prepareDatabase } = require("../src/prepareDatabase");

  const olga = (await register("olga")).body;
  const olgaId = new mongoose.Types.ObjectId(olga.user.id);
  // Insert a room the way the OLD app stored it: no channel field at all.
  await Room.collection.insertOne({
    name: "legacy", nameLower: "legacy", description: "",   // note: no isGlobal field, like very old data
    owner: olgaId, members: [olgaId], createdAt: new Date(), updatedAt: new Date(),
  });

  await prepareDatabase();

  const community = await Channel.findOne({ nameLower: "community" });
  assert.ok(community, "Community channel was created");
  assert.equal(community.type, "public");
  const moved = await Room.findOne({ nameLower: "legacy" });
  assert.equal(String(moved.channel), String(community._id));
  assert.ok(community.hasMember(olgaId));
  assert.equal(await Room.countDocuments({ isGlobal: { $ne: true }, channel: null }), 0, "no room is left outside a channel");
});
