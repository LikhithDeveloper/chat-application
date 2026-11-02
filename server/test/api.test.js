// End-to-end test: real HTTP + real sockets against a throwaway local MongoDB database.
// (Needs MongoDB running; set TEST_MONGODB_URI to override the default.)
// Run with:  npm test
process.env.JWT_ACCESS_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGODB_URI = "mongodb://placeholder"; // replaced below

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { io: connect } = require("socket.io-client");

let server, base;

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/like-chat-test");
  await mongoose.connection.dropDatabase(); // start clean
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
  assert.equal((await api("/api/rooms")).status, 401);
  assert.equal((await api("/api/rooms", { token: "garbage" })).status, 401);
});

test("rooms: create, join, authorization, live chat", async () => {
  const bob = (await register("bob")).body;
  const carol = (await register("carol")).body;

  const created = await api("/api/rooms", { method: "POST", token: bob.accessToken, body: { name: "General" } });
  assert.equal(created.status, 201);
  const roomId = created.body.room.id;

  // Carol sees the room but is not a member yet.
  const list = await api("/api/rooms", { token: carol.accessToken });
  assert.equal(list.body.rooms[0].isMember, false);

  // Not a member => no history, no socket access.
  assert.equal((await api(`/api/rooms/${roomId}/messages`, { token: carol.accessToken })).status, 403);

  const open = (token) => connect(base, { auth: { token }, transports: ["websocket"] });
  const sock = open(carol.accessToken);
  await new Promise((r) => sock.on("connect", r));
  const denied = await sock.emitWithAck("room:open", roomId);
  assert.ok(denied.error, "non-member can't open room");

  // Carol joins, now it works.
  await api(`/api/rooms/${roomId}/join`, { method: "POST", token: carol.accessToken });
  assert.ok((await sock.emitWithAck("room:open", roomId)).ok);

  const got = new Promise((r) => sock.on("message:new", r));
  await sock.emitWithAck("message:send", { roomId, text: "hello <b>world</b>" });
  const msg = await got;
  assert.equal(msg.sender.username, "carol");

  const history = await api(`/api/rooms/${roomId}/messages`, { token: carol.accessToken });
  assert.equal(history.body.messages.length, 1);
  sock.close();

  // Bad socket token is refused.
  const bad = open("garbage");
  const err = await new Promise((r) => bad.on("connect_error", r));
  assert.equal(err.message, "Unauthorized");
  bad.close();

  // Only the owner can delete.
  assert.equal((await api(`/api/rooms/${roomId}`, { method: "DELETE", token: carol.accessToken })).status, 403);
  assert.equal((await api(`/api/rooms/${roomId}`, { method: "DELETE", token: bob.accessToken })).status, 200);
});
