# Authentication & Authorization

This document explains how users are identified (**authentication**) and what they are
allowed to do (**authorization**), and why each choice was made.

> No system is literally "unbreakable". What this design does is close every common attack
> path (brute force, token theft, injection, privilege escalation) and keep the code small
> enough to audit. Section 7 lists what to add before a real production launch.

---

## 1. The big picture

```
 Browser                                   Server                          MongoDB
 ───────                                   ──────                          ───────
 POST /api/auth/login  ───────────────▶  check password (bcrypt)
                                         create tokens            ─────▶  store HASH of refresh token
 ◀─ access token (JSON, 15 min)
 ◀─ refresh token (httpOnly cookie, 7 days)

 GET /api/rooms
   Authorization: Bearer <access>  ───▶  verify JWT signature + expiry
                                         load user from DB          ◀───▶ users
 ◀─ data

 (15 min later: 401)
 POST /api/auth/refresh (cookie) ─────▶  token valid & unused? → delete it,
 ◀─ NEW access + NEW refresh cookie      issue a brand-new pair (rotation)
```

Two tokens, two jobs:

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (HS256), signed with `JWT_ACCESS_SECRET` | 48 random bytes (hex) |
| Lifetime | **15 minutes** | **7 days**, single-use |
| Stored in browser | JavaScript memory only | `httpOnly` cookie |
| Stored on server | nothing (stateless) | **SHA-256 hash** in MongoDB |
| Sent with | `Authorization: Bearer …` header / socket handshake | automatically, only to `/api/auth/*` |

Why this split? A stolen access token dies in 15 minutes. The long-lived token can't be
read by JavaScript (so XSS can't steal it) and can't be sent from other websites (so CSRF
can't use it).

Code: [`server/src/tokens.js`](../server/src/tokens.js), [`server/src/routes/auth.js`](../server/src/routes/auth.js)

---

## 2. Authentication

### Passwords
- Hashed with **bcrypt, cost 12** (`bcryptjs`) – slow on purpose, salted automatically.
- Policy: 8–72 characters, at least one letter and one number (72 is bcrypt's byte limit).
- The hash column is `select: false`, so it is never loaded or returned by accident.

### Login protections
| Attack | Defence |
|---|---|
| Brute force from one IP | `express-rate-limit`: 20 login/register attempts per 15 min per IP |
| Brute force on one account | **Account lock**: 5 wrong passwords → locked for 15 min (HTTP 423) |
| Finding which emails exist | Same message for "no such email" and "wrong password"; a dummy bcrypt compare keeps response time equal |
| Duplicate / look-alike accounts | Usernames compared case-insensitively (`usernameLower`), emails lower-cased |

### JWT hardening
- Algorithm is **pinned to HS256** when verifying (blocks the `alg: none` trick).
- Secret must be ≥ 32 characters or the server refuses to start (`config.js`).
- The token carries only the user id (`sub`). Permissions are **never** stored in the token.
- On every request the user is re-loaded from MongoDB, so a deleted user loses access at once.

### Refresh-token rotation
1. Every refresh deletes the used token and issues a new one (`findOneAndDelete` is atomic).
2. If an old token is replayed (e.g. an attacker copied it), it no longer exists → `401`.
3. Tokens are stored hashed, so a database leak doesn't hand out sessions.
4. MongoDB's TTL index removes expired tokens automatically.
5. Logout deletes the token and clears the cookie.

### Cookie flags
`httpOnly` (no JS access) · `secure` (HTTPS only in production) · `sameSite=strict`
(never sent cross-site → CSRF protection) · `path=/api/auth` (not sent with ordinary API calls).

---

## 3. Authorization

Authentication answers *"who are you?"*. Authorization answers *"may you do this?"*.

| Action | Rule | Where |
|---|---|---|
| Any `/api/channels/*` or `/api/rooms/*` route | Must have a valid access token | `requireAuth` middleware |
| See the channel list | Any logged-in user (private channels show only name + description) | `GET /api/channels` |
| Join a **public** channel | Any logged-in user, directly | `POST /channels/:id/join` |
| Join a **private** channel | Send a request; **only that channel's admin** can approve, then the user becomes a member | `/request`, `/requests/:reqId/approve` |
| See a channel's rooms | **Channel members only** (others get an empty list) | `GET /api/channels` |
| Create a room | **Channel admin only**, and always inside a channel (no endpoint creates a loose room) | `POST /channels/:id/rooms` |
| Join a **public** room | Member of its channel | `POST /rooms/:id/join` |
| Join a **private** room | Member of its channel, then request + **channel admin** approval | `/rooms/:id/request` |
| Read history / open a live room / send | Member of the **room AND its channel**, re-checked in the DB on every action | `Room.findAccessible()` |
| Read or answer join requests | **Channel admin only**; a request id from another channel returns 404 | `/channels/:id/requests*` |
| Delete a room / channel | **Channel admin only** | `DELETE` routes |
| Leave a channel | Members (not the admin); also removes the user from all its rooms and stops live messages immediately | `POST /channels/:id/leave` |
| Global room | Any logged-in user can read and write; nobody can leave or delete it | `isGlobal` |

Details that matter:
- **One rule for access.** `Room.findAccessible(roomId, userId)` is used by both the HTTP routes and the sockets, so they cannot disagree.
- **Requests can't be duplicated or replayed.** A partial unique index allows only one *pending* request per user and target, and approving/rejecting uses an atomic `findOneAndUpdate` on `status: "pending"`.
- **Leaving a channel is instant.** The user's live sockets are removed from the room's socket.io channel (`socketsLeave`), not just from the database.
- **Per-user and per-channel socket rooms** (`user:<id>`, `channel:<id>`) are used only for notifications ("something changed, reload"); they carry no message data.

Key principles used:
- **Never trust the client.** The sender of a message is `socket.data.user` (from the verified
  token), not something the client claims. Same for room ownership.
- **Check on the server, every time.** Membership is queried from MongoDB at the moment of the
  action, so leaving a room immediately stops you from posting.
- **Deny by default.** Routers call `requireAuth` first; sockets without a valid token are refused at connect.

### Real-time (Socket.IO)
- `io.use(...)` verifies the JWT during the handshake; invalid → `Unauthorized`, no connection.
- Joining the Socket.IO room channel happens only after the membership check.
- Flood control: max 15 messages / 10 s per connection; messages limited to 1000 characters.
- **Every socket payload is validated with zod** (`roomId` must be a 24-hex string, `text` a 1-1000 char string) and the acknowledgement callback is treated as optional. Without this a client could crash the server with `null` or inject Mongo operators like `{"$ne":null}`; both bugs were found by testing and are now covered by a regression test.

---

## 4. Injection & input safety

| Threat | Defence |
|---|---|
| **NoSQL injection** (`{"email": {"$gt": ""}}`) | Every body is validated with **zod**; fields must be plain strings, unknown fields are dropped. Covered by a test. |
| **XSS** | React escapes message text; there is no `dangerouslySetInnerHTML`. Helmet adds CSP and other headers. |
| **Oversized payloads** | `express.json({ limit: "10kb" })` |
| **Information leaks** | Central error handler returns generic messages, never stack traces. |
| **Other websites calling the API** | CORS allows only `CLIENT_ORIGIN`. |

---

## 5. Configuration (`server/.env`)

| Variable | Meaning |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | ≥ 32 random chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | Allowed frontend origin |
| `NODE_ENV` | Set to `production` to make cookies `secure` |

`.env` is git-ignored. **Never commit secrets.** Rotating `JWT_ACCESS_SECRET` instantly invalidates all access tokens.

---

## 6. Automated tests

`npm test` (in `server/`) spins up an in-memory MongoDB and verifies, among others:
password hash never leaks · duplicate users rejected · weak passwords rejected ·
NoSQL injection rejected · refresh token can't be replayed · account locks after 5 failures ·
routes reject missing/garbage tokens · non-members can't read/open/post · sockets reject bad tokens ·
only owners can delete rooms.

---

## 7. Before going to production

- Serve everything over **HTTPS** and set `NODE_ENV=production`.
- Put the API behind a reverse proxy and set `app.set("trust proxy", 1)` so rate limiting sees real client IPs.
- Use a managed MongoDB (Atlas) with authentication and network allow-listing.
- Optional extras: email verification, password reset, 2-factor auth, and a shared rate-limit store (Redis) if you run multiple server instances.
