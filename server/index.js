/**
 * Persistent Real-Time Synchronization Backend for DOBOT Magician Simulator
 * Coordinates authoritative state between ATHARV (Host) and TEST (Remote Controller).
 */

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3002;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dobot-magician-secret-key-2024-secure-jwt';
const SESSION_ID = 'dobot-main';

// Authoritative Session State
let sessionState = {
  sessionId: SESSION_ID,
  x: 250.72,
  y: 0,
  z: 67.47,
  r: 0,
  joints: { j1: 0, j2: 40, j3: 45, j4: 0 },
  velocity: 50,
  robotStatus: 'idle', // 'idle' | 'moving' | 'executing' | 'error' | 'stopped'
  activeTool: 'suction',
  suctionEnabled: false,
  attachedObjectName: null,
  hostConnected: false,
  controllerConnected: false,
  lastCommandId: null,
  lastCommandResult: null,
  stateVersion: 0,
  cycleStatus: null,
  isEmergencyStopped: false,
};

// Command deduplication cache (stores commandId -> timestamp)
const processedCommandIds = new Map();
const COMMAND_CACHE_TTL = 15000; // 15 seconds

function cleanCommandCache() {
  const now = Date.now();
  for (const [id, ts] of processedCommandIds.entries()) {
    if (now - ts > COMMAND_CACHE_TTL) {
      processedCommandIds.delete(id);
    }
  }
}
setInterval(cleanCommandCache, 10000);

// Basic HTTP server with health & status endpoint
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'dobot-magician-realtime-relay',
        sessionState,
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Socket Authentication Middleware
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      // In development fallback, allow handshake if username/role passed explicitly
      const devUsername = socket.handshake.auth?.username || socket.handshake.query?.username;
      const devRole = socket.handshake.auth?.role || socket.handshake.query?.role;
      if (devUsername && (devRole === 'host' || devRole === 'controller')) {
        socket.data.user = {
          username: devUsername,
          role: devRole,
          sessionId: SESSION_ID,
        };
        return next();
      }
      return next(new Error('Authentication required: No token provided'));
    }

    const decoded = jwt.verify(token, AUTH_SECRET);
    if (!decoded || !decoded.username || !decoded.role) {
      return next(new Error('Invalid authentication token payload'));
    }

    socket.data.user = {
      username: decoded.username,
      role: decoded.role,
      sessionId: decoded.sessionId || SESSION_ID,
    };

    next();
  } catch (err) {
    return next(new Error('Authentication failed: ' + err.message));
  }
});

// Connected sockets tracking by role
const hostSockets = new Set();
const controllerSockets = new Set();

io.on('connection', (socket) => {
  const user = socket.data.user;
  const isHost = user.role === 'host';
  const roleName = isHost ? 'HOST' : 'CONTROLLER';

  console.log(`[REALTIME] ${roleName} connected: ${user.username} (socket: ${socket.id})`);

  // Join shared session room
  socket.join(SESSION_ID);

  if (isHost) {
    hostSockets.add(socket.id);
    sessionState.hostConnected = true;
  } else {
    controllerSockets.add(socket.id);
    sessionState.controllerConnected = true;
  }

  // Notify room of connection
  io.to(SESSION_ID).emit('user:connected', {
    username: user.username,
    role: user.role,
    hostConnected: hostSockets.size > 0,
    controllerConnected: controllerSockets.size > 0,
    timestamp: Date.now(),
  });

  // Send current authoritative state to newly joined user
  socket.emit('session:state', {
    ...sessionState,
    hostConnected: hostSockets.size > 0,
    controllerConnected: controllerSockets.size > 0,
  });

  // -------------------------------------------------------------
  // HOST-ONLY: Publishes Authoritative State
  // -------------------------------------------------------------
  socket.on('robot:state:update', (incomingState) => {
    if (!isHost) {
      console.warn(`[SECURITY] Non-host socket ${user.username} attempted to publish robot:state:update!`);
      return;
    }

    if (!incomingState) return;

    // Check state version to prevent stale out-of-order updates
    if (incomingState.stateVersion !== undefined && incomingState.stateVersion < sessionState.stateVersion) {
      return;
    }

    sessionState = {
      ...sessionState,
      ...incomingState,
      sessionId: SESSION_ID,
      hostConnected: hostSockets.size > 0,
      controllerConnected: controllerSockets.size > 0,
      stateVersion: sessionState.stateVersion + 1,
    };

    // Broadcast to controllers in the session
    socket.to(SESSION_ID).emit('robot:state:update', sessionState);
  });

  // -------------------------------------------------------------
  // CONTROLLER (or Host): Sends Remote Robot Command
  // -------------------------------------------------------------
  socket.on('robot:command', (command, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    if (!command || !command.type) {
      return ack({ commandId: command?.commandId, status: 'rejected', reason: 'Invalid command payload' });
    }

    const { commandId, type, payload, timestamp } = command;

    // Deduplication check
    if (processedCommandIds.has(commandId)) {
      return ack({ commandId, status: 'rejected', reason: 'Duplicate command ignored' });
    }

    // Stale command check (> 12 seconds old)
    if (timestamp && Date.now() - timestamp > 12000) {
      return ack({ commandId, status: 'rejected', reason: 'Stale command discarded' });
    }

    // Check if host is online (Host is required to execute physical movement)
    if (hostSockets.size === 0) {
      return ack({
        commandId,
        status: 'rejected',
        reason: 'Host simulator is offline. Robot commands cannot be executed.',
      });
    }

    // Check emergency stop state
    if (sessionState.isEmergencyStopped && type !== 'RESET' && type !== 'EMERGENCY_STOP') {
      return ack({
        commandId,
        status: 'rejected',
        reason: 'Emergency Stop is active. Reset robot to clear.',
      });
    }

    // Validate coordinate boundaries for MOVE_TO
    if (type === 'MOVE_TO' && payload) {
      const { x, y, z, r } = payload;
      if (x !== undefined && (isNaN(x) || x < 120 || x > 330)) {
        return ack({ commandId, status: 'rejected', reason: `X coordinate (${x}) is out of safe range [120, 330]` });
      }
      if (y !== undefined && (isNaN(y) || y < -330 || y > 330)) {
        return ack({ commandId, status: 'rejected', reason: `Y coordinate (${y}) is out of safe range [-330, 330]` });
      }
      if (z !== undefined && (isNaN(z) || z < -60 || z > 180)) {
        return ack({ commandId, status: 'rejected', reason: `Z coordinate (${z}) is out of safe range [-60, 180]` });
      }
      if (r !== undefined && (isNaN(r) || r < -135 || r > 135)) {
        return ack({ commandId, status: 'rejected', reason: `R angle (${r}) is out of safe range [-135, 135]` });
      }
    }

    // Concurrency lock check
    const isBusy = sessionState.robotStatus === 'moving' || sessionState.robotStatus === 'executing';
    if (isBusy && type !== 'EMERGENCY_STOP' && type !== 'RESET') {
      return ack({
        commandId,
        status: 'rejected',
        reason: 'Robot is currently busy executing another operation. Please wait.',
      });
    }

    // Record command ID
    processedCommandIds.set(commandId, Date.now());
    sessionState.lastCommandId = commandId;

    if (type === 'RESET') {
      sessionState.isEmergencyStopped = false;
      sessionState.robotStatus = 'idle';
      sessionState.cycleStatus = null;
    }

    // Acknowledge acceptance to sender
    ack({ commandId, status: 'accepted', timestamp: Date.now() });

    // Send command to the Host simulator for execution
    io.to(SESSION_ID).emit('robot:command', {
      commandId,
      sessionId: SESSION_ID,
      type,
      payload,
      timestamp: Date.now(),
      sender: user.username,
    });

    console.log(`[COMMAND] Dispatched ${type} (ID: ${commandId}) from ${user.username} to Host`);
  });

  // -------------------------------------------------------------
  // Command Execution Life-Cycle Events (Reported by Host)
  // -------------------------------------------------------------
  socket.on('robot:command:started', (data) => {
    if (!isHost) return;
    sessionState.robotStatus = data.isCycle ? 'executing' : 'moving';
    sessionState.cycleStatus = data.step || null;
    io.to(SESSION_ID).emit('robot:command:started', data);
  });

  socket.on('robot:command:completed', (data) => {
    if (!isHost) return;
    sessionState.robotStatus = 'idle';
    sessionState.cycleStatus = data.step || null;
    sessionState.lastCommandResult = {
      commandId: data.commandId,
      type: data.type,
      status: 'completed',
      timestamp: Date.now(),
    };
    io.to(SESSION_ID).emit('robot:command:completed', data);
  });

  socket.on('robot:command:failed', (data) => {
    if (!isHost) return;
    sessionState.robotStatus = 'error';
    sessionState.cycleStatus = null;
    sessionState.lastCommandResult = {
      commandId: data.commandId,
      type: data.type,
      status: 'failed',
      error: data.error,
      timestamp: Date.now(),
    };
    io.to(SESSION_ID).emit('robot:command:failed', data);
  });

  // -------------------------------------------------------------
  // Emergency Stop Instant Broadcast
  // -------------------------------------------------------------
  socket.on('robot:emergency-stop', (data) => {
    sessionState.isEmergencyStopped = true;
    sessionState.robotStatus = 'stopped';
    sessionState.cycleStatus = 'EMERGENCY STOP ACTIVATED';
    io.to(SESSION_ID).emit('robot:emergency-stop', {
      by: user.username,
      timestamp: Date.now(),
    });
    console.warn(`[EMERGENCY STOP] Triggered by ${user.username}!`);
  });

  // -------------------------------------------------------------
  // Disconnect Handling
  // -------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[REALTIME] ${roleName} disconnected: ${user.username} (socket: ${socket.id})`);

    if (isHost) {
      hostSockets.delete(socket.id);
      if (hostSockets.size === 0) {
        sessionState.hostConnected = false;
      }
    } else {
      controllerSockets.delete(socket.id);
      if (controllerSockets.size === 0) {
        sessionState.controllerConnected = false;
      }
    }

    io.to(SESSION_ID).emit('user:disconnected', {
      username: user.username,
      role: user.role,
      hostConnected: hostSockets.size > 0,
      controllerConnected: controllerSockets.size > 0,
      timestamp: Date.now(),
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[DOBOT REALTIME SERVER] Running on port ${PORT}`);
  console.log(`[DOBOT REALTIME SERVER] Authorized session: ${SESSION_ID}`);
});
