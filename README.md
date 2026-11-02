# Like Chat

A real-time chat app: sign up, log in, create public rooms, join any room, and talk live.

**Stack:** React + Vite · Node/Express 5 · Socket.IO · MongoDB (Mongoose) · JWT auth

## Capstone contents

| Part | Where | What it is |
|---|---|---|
| Chat application | `client/`, `server/` | Full-stack real-time chat with secure JWT auth, public rooms and live messaging |
| Security documentation | `docs/SECURITY.md` | How authentication and authorization work, and why |
| Socket learning notes | `notes-to-sockets/` | An animated, beginner-to-advanced guide to sockets, Socket.IO and socket security. Open `notes-to-sockets/index.html` in a browser (no install needed) |
| Automated tests | `server/test/` | End-to-end tests for auth, authorization, and socket hardening (`npm test`) |

## Run it

1. **MongoDB** – run it locally (`mongodb://127.0.0.1:27017`) or use a free Atlas cluster.
2. **Server**
   ```bash
   cd server
   npm install
   cp .env.example .env      # then fill in JWT_ACCESS_SECRET (command is inside the file)
   npm run dev               # http://localhost:5000
   ```
3. **Client**
   ```bash
   cd client
   npm install
   npm run dev               # http://localhost:5173
   ```
4. Open http://localhost:5173, create two accounts (use a private window for the second), make a room, join it, chat.

Tests: `cd server && npm test`

## Project layout

```
server/
  index.js              start: connect MongoDB, listen
  src/
    config.js           reads .env, fails fast on bad config
    app.js              Express setup (security middleware, routes)
    socket.js           Socket.IO: auth + live messages
    tokens.js           JWT + refresh token logic
    models/             User, Room, Message, RefreshToken
    routes/auth.js      register / login / refresh / logout / me
    routes/rooms.js     list / create / join / leave / delete / history
    middleware/         requireAuth, validate (zod), error handling
  test/api.test.js      end-to-end tests
client/src/
  api.js                fetch wrapper + automatic token refresh
  socket.js             Socket.IO client
  App.jsx               login gate
  components/           AuthPage, ChatApp, Sidebar, ChatWindow, CreateRoomModal, Avatar
docs/SECURITY.md        how auth & authorization work
```

## API summary

| Method & path | Purpose | Access |
|---|---|---|
| POST `/api/auth/register` · `/login` | create account / sign in | public (rate-limited) |
| POST `/api/auth/refresh` · `/logout` | rotate session / sign out | refresh cookie |
| GET `/api/auth/me` | current user | logged in |
| GET `/api/rooms` | all rooms | logged in |
| POST `/api/rooms` | create a room | logged in |
| POST `/api/rooms/:id/join` · `/leave` | membership | logged in |
| DELETE `/api/rooms/:id` | delete room | owner only |
| GET `/api/rooms/:id/messages` | last 100 messages | members only |

Socket events: `room:open`, `message:send` (client→server); `message:new`, `room:created|updated|deleted` (server→client).

See [docs/SECURITY.md](docs/SECURITY.md) for the security design.
