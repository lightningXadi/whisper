# Whisper — a quiet, real-time chat app

Real-time messaging + audio calling, built around a misty-forest visual identity
(matches your Stitch screens: landing, login/signup, chat, call).

## Stack
- **Backend**: Node/Express, Socket.IO (chat + WebRTC signaling), MongoDB (Mongoose), JWT + Google OAuth
- **Frontend**: Plain HTML/CSS/JS (no build step needed) — `client/` is deployable as-is on Vercel
- **Calling**: WebRTC (audio-only), signaled over the same socket connection

## 1. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — a free MongoDB Atlas cluster connection string (Atlas → free tier is enough)
- `JWT_SECRET` — any long random string
- `CLIENT_URL` — `http://localhost:5173` for local dev, or your deployed Vercel URL later
- `GOOGLE_CLIENT_ID` — from Google Cloud Console → OAuth 2.0 Client (Web application), needed for the "Sign in with Google" button. Add `http://localhost:5173` and your Vercel domain as authorized JavaScript origins.

Run it:
```bash
npm run dev     # nodemon, auto-restart
# or
npm start
```
Server runs on `http://localhost:5000` by default. Visit `http://localhost:5000/api/health` to confirm it's up.

## 2. Frontend setup

The frontend is static — no build step. Easiest local run:
```bash
cd client
npx serve . -l 5173
```
Then open `http://localhost:5173`.

Before running, edit `client/js/config.js`:
```js
window.WHISPER_API_URL = 'http://localhost:5000';       // your backend URL
window.WHISPER_GOOGLE_CLIENT_ID = 'xxxx.apps.googleusercontent.com'; // same one as backend
```

## 3. Try it end-to-end
1. Sign up two different accounts (use two browser profiles/incognito windows).
2. Search for the other user by name/email in the sidebar, start a conversation.
3. Send messages — they arrive in real time via Socket.IO.
4. Hit the 📞 icon in the chat header to start a real WebRTC audio call. The other
   tab should get an incoming-call banner; accept it and you'll hear each other live
   (needs mic permission in both browser tabs).

## 4. Deploying
- **Backend → Render**: New Web Service, root dir `server/`, build `npm install`, start `npm start`.
  Set the same env vars as `.env` in Render's dashboard. Update `CLIENT_URL` to your live Vercel URL.
- **Frontend → Vercel**: import the `client/` folder as a static site. Update `client/js/config.js`
  (or better, inject `WHISPER_API_URL`/`WHISPER_GOOGLE_CLIENT_ID` via a small build step or Vercel env + a
  tiny script tag) to point at your Render backend URL.

## Notes on design decisions
- **Avatars**: no image assets — a deterministic fox/owl/rabbit/deer emoji + gradient,
  assigned per-user by hashing their email server-side. Consistent, distinctive, zero asset cost.
- **Backgrounds**: the misty fog you see on landing/auth/call screens is a small WebGL
  shader (`client/js/fog.js`), not a stock photo — procedural, on-brand, free to render.
- **Everything is real**: no demo/mock data. Messages, users, and presence are all live
  through MongoDB + Socket.IO. Calls are genuine WebRTC peer connections (STUN only —
  fine for most home/office networks; add a TURN server later if calls fail behind
  strict NATs).

## What's not included (flagged, not hidden)
- No message read-receipts UI (data model supports it — `readBy` array is there, just not wired to UI)
- No push notifications / offline delivery — messages only arrive live while both tabs are open
- No TURN server — calls may fail on some restrictive corporate/mobile networks
