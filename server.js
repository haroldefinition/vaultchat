// ============================================================
//  VaultChat Backend Server
//  Real-time encrypted messaging engine
//  Built for Harold — no coding knowledge needed to run this
// ============================================================

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const crypto     = require('crypto');
const cors       = require('cors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // ── Connection resilience ──────────────────────────────
  // These settings keep calls alive on weak networks
  pingTimeout:  60000,   // wait 60s before deciding someone disconnected
  pingInterval: 10000,   // check connection every 10s
  transports:   ['websocket', 'polling'], // fall back to polling if websocket drops
});

app.use(cors());
app.use(express.json());

// ============================================================
//  IN-MEMORY STORES
//  (In production these move to a database like PostgreSQL)
// ============================================================
const users    = new Map(); // userId  → { publicKey, socketId, username, online }
const rooms    = new Map(); // roomId  → { members[], messages[], channels[], type }
const sessions = new Map(); // socketId → userId
const reports  = [];        // fallback store for /report when Supabase is unavailable

// ============================================================
//  HEALTH CHECK — visit your Railway URL to confirm it works
// ============================================================
app.get('/', (req, res) => {
  res.json({
    app:     'VaultChat Server',
    status:  'online',
    version: '1.0.0',
    users:   users.size,
    rooms:   rooms.size,
    message: 'All systems operational 🔒',
  });
});

// ============================================================
//  REST ENDPOINTS
// ============================================================

// Register a new user + store their public key
app.post('/register', (req, res) => {
  const { userId, username, publicKey } = req.body;
  if (!userId || !username || !publicKey) {
    return res.status(400).json({ error: 'userId, username and publicKey are required' });
  }
  users.set(userId, { userId, username, publicKey, online: false, socketId: null });
  console.log(`✅ User registered: ${username} (${userId})`);
  res.json({ success: true, message: 'User registered. Keys stored — server cannot decrypt messages.' });
});

// Get a user's PUBLIC key (safe to share — used to encrypt messages TO them)
app.get('/key/:userId', (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Only return public key — private key never touches the server
  res.json({ userId: user.userId, username: user.username, publicKey: user.publicKey });
});

// Create a room or group
app.post('/room/create', (req, res) => {
  const { roomId, name, members, type, createdBy } = req.body;
  // type: 'direct' | 'group'
  if (rooms.has(roomId)) return res.status(409).json({ error: 'Room already exists' });
  rooms.set(roomId, {
    roomId, name, type: type || 'direct',
    members:  members || [],
    messages: [],
    channels: type === 'group' ? [
      { id: 'general',       name: 'general',       icon: '💬' },
      { id: 'announcements', name: 'announcements', icon: '📢' },
    ] : [],
    createdBy,
    createdAt: new Date().toISOString(),
  });
  console.log(`🏠 Room created: ${name} (${type})`);
  res.json({ success: true, roomId });
});

// Add a channel to a group room
app.post('/room/:roomId/channel', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { channelId, name, icon } = req.body;
  const exists = room.channels.find(c => c.id === channelId);
  if (exists) return res.status(409).json({ error: 'Channel already exists' });
  room.channels.push({ id: channelId, name, icon: icon || '📌', createdAt: new Date().toISOString() });
  io.to(req.params.roomId).emit('channel:added', { channelId, name, icon });
  res.json({ success: true, channels: room.channels });
});

// Edit a channel name
app.put('/room/:roomId/channel/:channelId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const ch = room.channels.find(c => c.id === req.params.channelId);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  ch.name = req.body.name || ch.name;
  ch.icon = req.body.icon || ch.icon;
  io.to(req.params.roomId).emit('channel:updated', { channelId: ch.id, name: ch.name, icon: ch.icon });
  res.json({ success: true, channel: ch });
});

// Delete a channel
app.delete('/room/:roomId/channel/:channelId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.channels = room.channels.filter(c => c.id !== req.params.channelId);
  io.to(req.params.roomId).emit('channel:deleted', { channelId: req.params.channelId });
  res.json({ success: true });
});

// ============================================================
//  SAFETY — USER REPORTS
//  Clients POST /report when a user uses the in-app
//  "Report message" flow. Primary path is Supabase directly;
//  this endpoint is a fallback so reports are never lost if
//  Supabase is unreachable from the device. CSAM reports are
//  logged to stderr so they surface in Railway logs and can
//  be wired to an email/pager alert.
// ============================================================
const ALLOWED_REASONS = new Set([
  'csam','harassment','violence_self_harm','hate',
  'spam','impersonation','other',
]);

app.post('/report', (req, res) => {
  const body = req.body || {};
  if (!ALLOWED_REASONS.has(body.reason_category)) {
    return res.status(400).json({ error: 'Invalid reason_category' });
  }
  const report = {
    id: crypto.randomUUID(),
    reporter_id:          body.reporter_id          || null,
    reporter_handle:      body.reporter_handle      || null,
    reported_user_id:     body.reported_user_id     || null,
    reported_user_name:   body.reported_user_name   || null,
    reported_message_id:  body.reported_message_id  || null,
    room_id:              body.room_id              || null,
    room_type:            body.room_type            || null,
    reason_category:      body.reason_category,
    reason_detail:        body.reason_detail        || null,
    priority:             body.priority             || 'normal',
    consent_to_forward:   !!body.consent_to_forward,
    forwarded_content:    body.consent_to_forward ? (body.forwarded_content || null) : null,
    forwarded_media_url:  body.consent_to_forward ? (body.forwarded_media_url || null) : null,
    status:               'pending',
    created_at:           new Date().toISOString(),
  };
  reports.push(report);

  if (report.reason_category === 'csam') {
    // Stderr so Railway surfaces it loudly. Wire an alert here.
    console.error(`🚨 CSAM REPORT RECEIVED — id=${report.id} reporter=${report.reporter_id} target=${report.reported_user_id} room=${report.room_id}`);
  } else {
    console.log(`🛡️  Report received: ${report.reason_category} (priority=${report.priority}) id=${report.id}`);
  }

  res.json({ success: true, id: report.id });
});

// Internal triage endpoint — gated by a shared admin token.
// Set ADMIN_TOKEN in Railway env. Call: GET /admin/reports?token=...
app.get('/admin/reports', (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { status, reason } = req.query;
  let out = reports.slice().reverse();
  if (status) out = out.filter(r => r.status === status);
  if (reason) out = out.filter(r => r.reason_category === reason);
  res.json({ count: out.length, reports: out.slice(0, 200) });
});

app.post('/admin/reports/:id/status', (req, res) => {
  const token = req.body?.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const r = reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  r.status = req.body.status || r.status;
  r.action_taken = req.body.action_taken || r.action_taken;
  r.reviewed_at = new Date().toISOString();
  res.json({ success: true, report: r });
});

// ============================================================
//  WEBSOCKET — REAL-TIME ENGINE
//  This is what makes messages instant
// ============================================================
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ── User comes online ──────────────────────────────────
  socket.on('user:online', ({ userId }) => {
    const user = users.get(userId);
    if (!user) return;
    user.online   = true;
    user.socketId = socket.id;
    sessions.set(socket.id, userId);
    socket.userId = userId;
    console.log(`🟢 ${user.username} is online`);
    // Tell everyone in their rooms this user is online
    socket.rooms.forEach(roomId => {
      io.to(roomId).emit('user:status', { userId, status: 'online' });
    });
  });

  // ── Join a room (conversation or group) ───────────────
  socket.on('room:join', ({ roomId, userId }) => {
    socket.join(roomId);
    const room = rooms.get(roomId);
    if (room) {
      socket.emit('room:history', {
        roomId,
        messages: room.messages.slice(-50), // last 50 messages
        channels: room.channels,
      });
    }
    console.log(`🚪 ${userId} joined room: ${roomId}`);
  });

  // ── Send a message ─────────────────────────────────────
  // NOTE: payload.content is already encrypted by the sender's device
  // The server NEVER sees the plaintext — only passes the encrypted blob
  socket.on('message:send', (payload) => {
    const {
      roomId, messageId, senderId, senderName,
      content,      // ← AES-256 encrypted ciphertext (server cannot read this)
      channelId,    // optional — for group channels
      type,         // 'text' | 'image' | 'video' | 'file' | 'gif' | 'vanish' | 'audio'
      vanish,       // true = view-once, self-destruct after opening
      replyTo,      // messageId being replied to
      timestamp,
    } = payload;

    const message = {
      messageId: messageId || crypto.randomUUID(),
      senderId, senderName,
      content,       // encrypted — server stores ciphertext only
      channelId: channelId || 'general',
      type:      type || 'text',
      vanish:    vanish || false,
      viewed:    false,
      replyTo:   replyTo || null,
      timestamp: timestamp || new Date().toISOString(),
      edited:    false,
      editedAt:  null,
      edits:     [],
    };

    // Store in room (encrypted blob only)
    const room = rooms.get(roomId);
    if (room && !vanish) {
      room.messages.push(message);
      // Keep only last 500 messages in memory
      if (room.messages.length > 500) room.messages.shift();
    }

    // Deliver to everyone in the room
    io.to(roomId).emit('message:received', message);
    console.log(`📨 Message [${type}] → room:${roomId} channel:${channelId || 'direct'}`);
  });

  // ── Edit a message (24-hour window enforced) ──────────
  socket.on('message:edit', ({ roomId, messageId, newContent, editedBy }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.messageId === messageId);
    if (!msg) return;

    // Enforce 24-hour edit window
    const age = Date.now() - new Date(msg.timestamp).getTime();
    if (age > 86400000) { // 86400000ms = 24 hours
      socket.emit('message:edit:denied', { messageId, reason: '24-hour edit window has expired' });
      return;
    }

    msg.edits.push({ content: msg.content, editedAt: new Date().toISOString() });
    msg.content  = newContent; // still encrypted
    msg.edited   = true;
    msg.editedAt = new Date().toISOString();

    io.to(roomId).emit('message:edited', { messageId, newContent, editedAt: msg.editedAt });
    console.log(`✏️  Message edited: ${messageId}`);
  });

  // ── Vanish message — mark as viewed & destroy ─────────
  socket.on('message:vanish:viewed', ({ roomId, messageId, viewerId }) => {
    // Remove the vanish message from any store — key is gone, unreadable forever
    const room = rooms.get(roomId);
    if (room) room.messages = room.messages.filter(m => m.messageId !== messageId);
    io.to(roomId).emit('message:vanish:destroyed', { messageId, viewedBy: viewerId });
    console.log(`👻 Vanish message destroyed: ${messageId}`);
  });

  // ── Typing indicator ───────────────────────────────────
  socket.on('typing:start', ({ roomId, userId, username }) => {
    socket.to(roomId).emit('typing:start', { userId, username });
  });
  socket.on('typing:stop', ({ roomId, userId }) => {
    socket.to(roomId).emit('typing:stop', { userId });
  });

  // ── Read receipts ──────────────────────────────────────
  socket.on('message:read', ({ roomId, messageId, userId }) => {
    io.to(roomId).emit('message:read', { messageId, userId, readAt: new Date().toISOString() });
  });

  // ── WebRTC Video/Voice Call Signaling ─────────────────
  // Server just passes signals between devices — never sees call content

  socket.on('call:invite', ({ roomId, callId, callerId, callerName, type, participants }) => {
    socket.to(roomId).emit('call:incoming', { callId, callerId, callerName, type, participants });
    console.log(`📞 Call invite: ${callerName} → room:${roomId} [${type}]`);
  });

  socket.on('call:accept', ({ callId, roomId, userId }) => {
    io.to(roomId).emit('call:accepted', { callId, userId });
  });

  socket.on('call:decline', ({ callId, roomId, userId }) => {
    io.to(roomId).emit('call:declined', { callId, userId });
  });

  socket.on('call:end', ({ callId, roomId, userId }) => {
    io.to(roomId).emit('call:ended', { callId, endedBy: userId });
    console.log(`📵 Call ended: ${callId}`);
  });

  // WebRTC offer/answer/ICE — the technical handshake that sets up the call
  socket.on('webrtc:offer',     (data) => socket.to(data.targetId).emit('webrtc:offer',     data));
  socket.on('webrtc:answer',    (data) => socket.to(data.targetId).emit('webrtc:answer',    data));
  socket.on('webrtc:ice',       (data) => socket.to(data.targetId).emit('webrtc:ice',       data));

  // ── Mute/unmute broadcast ──────────────────────────────
  socket.on('call:mute',   ({ callId, roomId, userId, track }) => {
    io.to(roomId).emit('call:mute',   { callId, userId, track }); // track: 'audio'|'video'
  });
  socket.on('call:unmute', ({ callId, roomId, userId, track }) => {
    io.to(roomId).emit('call:unmute', { callId, userId, track });
  });

  // ── Disconnect — mark user offline ────────────────────
  socket.on('disconnect', () => {
    const userId = sessions.get(socket.id);
    if (userId) {
      const user = users.get(userId);
      if (user) {
        user.online   = false;
        user.socketId = null;
        console.log(`🔴 ${user.username} disconnected`);
        socket.rooms.forEach(roomId => {
          io.to(roomId).emit('user:status', { userId, status: 'offline' });
        });
      }
      sessions.delete(socket.id);
    }
  });
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   VaultChat Server — ONLINE 🔒       ║
  ║   Port: ${PORT}                          ║
  ║   E2EE: Server sees zero plaintext   ║
  ╚══════════════════════════════════════╝
  `);
});
