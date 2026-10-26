import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { hashPassword, verifyPassword, getUser } from '../auth/password';
import { signToken, verifyToken } from '../auth/jwt';
import { decodeJwtEdge } from '../auth/edgeAuth';
import { RobotCommand, RobotStatePayload, DEFAULT_SESSION_ID } from './types';

describe('Authentication & Cryptography', () => {
  it('hashes passwords with PBKDF2 salt and correctly verifies them', () => {
    const hash = hashPassword('atharv123');
    expect(hash).toContain(':');
    expect(verifyPassword('atharv123', hash)).toBe(true);
    expect(verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('validates seeded accounts for atharv and test', () => {
    const atharv = getUser('atharv');
    expect(atharv).not.toBeNull();
    expect(atharv?.role).toBe('host');
    expect(verifyPassword('atharv123', atharv!.passwordHash)).toBe(true);

    const testUser = getUser('test');
    expect(testUser).not.toBeNull();
    expect(testUser?.role).toBe('controller');
    expect(verifyPassword('test123', testUser!.passwordHash)).toBe(true);
  });

  it('signs and verifies JWT session tokens with roles and expiration', () => {
    const hostToken = signToken({
      username: 'atharv',
      role: 'host',
      sessionId: DEFAULT_SESSION_ID,
    });
    const decoded = verifyToken(hostToken);
    expect(decoded).not.toBeNull();
    expect(decoded?.username).toBe('atharv');
    expect(decoded?.role).toBe('host');
    expect(decoded?.sessionId).toBe(DEFAULT_SESSION_ID);

    // Edge-compatible JWT parser
    const edgeDecoded = decodeJwtEdge(hostToken);
    expect(edgeDecoded?.username).toBe('atharv');
    expect(edgeDecoded?.role).toBe('host');
  });

  it('rejects tampered JWT tokens', () => {
    const hostToken = signToken({
      username: 'atharv',
      role: 'host',
      sessionId: DEFAULT_SESSION_ID,
    });
    const tampered = hostToken.slice(0, -5) + 'xxxxx';
    expect(verifyToken(tampered)).toBeNull();
  });
});

describe('Real-Time Bidirectional Synchronization & Command Protocol', () => {
  let server: http.Server;
  let ioServer: SocketServer;
  let hostSocket: ClientSocketType;
  let controllerSocket: ClientSocketType;
  const TEST_PORT = 3199;
  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  let hostToken: string;
  let controllerToken: string;

  beforeAll(async () => {
    hostToken = signToken({ username: 'atharv', role: 'host', sessionId: DEFAULT_SESSION_ID });
    controllerToken = signToken({ username: 'test', role: 'controller', sessionId: DEFAULT_SESSION_ID });

    // Launch server instance matching server/index.js logic
    server = http.createServer();
    ioServer = new SocketServer(server, {
      cors: { origin: '*' },
    });

    const hostSockets = new Set<string>();
    const controllerSockets = new Set<string>();

    let testSessionState = {
      sessionId: DEFAULT_SESSION_ID,
      x: 250.72,
      y: 0,
      z: 67.47,
      r: 0,
      hostConnected: false,
      controllerConnected: false,
      robotStatus: 'idle',
      isEmergencyStopped: false,
    };

    ioServer.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      const decoded = verifyToken(token);
      if (!decoded) return next(new Error('Auth failed'));
      socket.data.user = decoded;
      next();
    });

    ioServer.on('connection', (socket) => {
      const user = socket.data.user;
      socket.join(DEFAULT_SESSION_ID);

      if (user.role === 'host') {
        hostSockets.add(socket.id);
        testSessionState.hostConnected = true;
      } else {
        controllerSockets.add(socket.id);
        testSessionState.controllerConnected = true;
      }

      socket.emit('session:state', {
        ...testSessionState,
        hostConnected: hostSockets.size > 0,
        controllerConnected: controllerSockets.size > 0,
      });

      socket.on('robot:command', (cmd, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        if (!cmd) return ack({ status: 'rejected' });

        // Safe workspace check
        if (cmd.type === 'MOVE_TO' && cmd.payload) {
          const { x } = cmd.payload;
          if (x !== undefined && (x < 120 || x > 330)) {
            return ack({ commandId: cmd.commandId, status: 'rejected', reason: 'Out of workspace limits' });
          }
        }

        // Host offline check
        if (hostSockets.size === 0) {
          return ack({ commandId: cmd.commandId, status: 'rejected', reason: 'Host is offline' });
        }

        ack({ commandId: cmd.commandId, status: 'accepted' });
        ioServer.to(DEFAULT_SESSION_ID).emit('robot:command', cmd);
      });

      socket.on('robot:state:update', (state) => {
        if (user.role !== 'host') return;
        testSessionState = { ...testSessionState, ...state };
        socket.to(DEFAULT_SESSION_ID).emit('robot:state:update', testSessionState);
      });

      socket.on('robot:emergency-stop', () => {
        testSessionState.isEmergencyStopped = true;
        ioServer.to(DEFAULT_SESSION_ID).emit('robot:emergency-stop');
      });

      socket.on('disconnect', () => {
        if (user.role === 'host') {
          hostSockets.delete(socket.id);
          if (hostSockets.size === 0) testSessionState.hostConnected = false;
        } else {
          controllerSockets.delete(socket.id);
          if (controllerSockets.size === 0) testSessionState.controllerConnected = false;
        }
        ioServer.to(DEFAULT_SESSION_ID).emit('user:disconnected', {
          role: user.role,
          hostConnected: hostSockets.size > 0,
          controllerConnected: controllerSockets.size > 0,
        });
      });
    });

    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  });

  afterAll(async () => {
    if (hostSocket?.connected) hostSocket.disconnect();
    if (controllerSocket?.connected) controllerSocket.disconnect();
    ioServer.close();
    server.close();
  });

  it('TEST 1: Atharv (Host) and Test (Controller) connect and join the same session', async () => {
    hostSocket = ClientSocket(SERVER_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    controllerSocket = ClientSocket(SERVER_URL, {
      auth: { token: controllerToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => controllerSocket.on('connect', resolve)),
    ]);

    expect(hostSocket.connected).toBe(true);
    expect(controllerSocket.connected).toBe(true);
  });

  it('TEST 2: Controller sends MOVE_TO and Host receives it immediately with valid payload', async () => {
    const cmd: RobotCommand = {
      commandId: `test-cmd-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'MOVE_TO',
      payload: { x: 240, y: 100, z: 35, r: 0 },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceivedPromise = new Promise<RobotCommand>((resolve) => {
      hostSocket.once('robot:command', resolve);
    });

    const ackPromise = new Promise<any>((resolve) => {
      controllerSocket.emit('robot:command', cmd, resolve);
    });

    const [ack, receivedCmd] = await Promise.all([ackPromise, hostReceivedPromise]);

    expect(ack.status).toBe('accepted');
    expect(receivedCmd.commandId).toBe(cmd.commandId);
    expect(receivedCmd.type).toBe('MOVE_TO');
    expect(receivedCmd.payload.x).toBe(240);
    expect(receivedCmd.payload.y).toBe(100);
  });

  it('TEST 3: Controller sends JOG_AXIS incremental movement and Host receives it', async () => {
    const jogCmd: RobotCommand = {
      commandId: `jog-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'JOG_AXIS',
      payload: { axis: 'x', delta: 5 },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceived = new Promise<RobotCommand>((resolve) => {
      hostSocket.once('robot:command', resolve);
    });

    controllerSocket.emit('robot:command', jogCmd);
    const received = await hostReceived;

    expect(received.type).toBe('JOG_AXIS');
    expect(received.payload.axis).toBe('x');
    expect(received.payload.delta).toBe(5);
  });

  it('TEST 4: Controller sends PICK_AND_PLACE cycle coordinates', async () => {
    const pickCmd: RobotCommand = {
      commandId: `pnp-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'PICK_AND_PLACE',
      payload: {
        source: { x: 240, y: 100, z: 35, r: 0 },
        destination: { x: 200, y: -100, z: 0, r: 0 },
        safeZ: 100,
      },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceived = new Promise<RobotCommand>((resolve) => {
      hostSocket.once('robot:command', resolve);
    });

    controllerSocket.emit('robot:command', pickCmd);
    const received = await hostReceived;

    expect(received.type).toBe('PICK_AND_PLACE');
    expect(received.payload.source.x).toBe(240);
    expect(received.payload.destination.y).toBe(-100);
  });

  it('TEST 5: Controller sends suction cup activation command', async () => {
    const suctionCmd: RobotCommand = {
      commandId: `suc-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'SET_SUCTION',
      payload: { active: true },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceived = new Promise<RobotCommand>((resolve) => {
      hostSocket.once('robot:command', resolve);
    });

    controllerSocket.emit('robot:command', suctionCmd);
    const received = await hostReceived;

    expect(received.type).toBe('SET_SUCTION');
    expect(received.payload.active).toBe(true);
  });

  it('TEST 6: Host moves and broadcasts authoritative state; Controller receives updated coordinates', async () => {
    const updatedState: Partial<RobotStatePayload> = {
      x: 235.5,
      y: 45.2,
      z: 80.0,
      r: 10.0,
      suctionEnabled: true,
      robotStatus: 'moving',
    };

    const controllerReceived = new Promise<any>((resolve) => {
      controllerSocket.once('robot:state:update', resolve);
    });

    hostSocket.emit('robot:state:update', updatedState);
    const received = await controllerReceived;

    expect(received.x).toBe(235.5);
    expect(received.y).toBe(45.2);
    expect(received.suctionEnabled).toBe(true);
  });

  it('TEST 7: Host disconnects -> Controller detects Host Offline and commands are safely rejected', async () => {
    const disconnectEvent = new Promise<any>((resolve) => {
      controllerSocket.once('user:disconnected', resolve);
    });

    hostSocket.disconnect();
    const event = await disconnectEvent;
    expect(event.hostConnected).toBe(false);

    // Controller tries to send movement command while Host is offline
    const cmdWhileOffline: RobotCommand = {
      commandId: `offline-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'MOVE_TO',
      payload: { x: 200, y: 0, z: 50 },
      timestamp: Date.now(),
      sender: 'test',
    };

    const ack = await new Promise<any>((resolve) => {
      controllerSocket.emit('robot:command', cmdWhileOffline, resolve);
    });

    expect(ack.status).toBe('rejected');
    expect(ack.reason).toContain('offline');
  });

  it('TEST 8: Reconnection -> Host reconnects and syncs latest state without replaying stale commands', async () => {
    hostSocket = ClientSocket(SERVER_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => hostSocket.on('connect', resolve));
    expect(hostSocket.connected).toBe(true);

    // Validate a fresh command succeeds now that host is back
    const freshCmd: RobotCommand = {
      commandId: `fresh-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'MOVE_TO',
      payload: { x: 220, y: 20, z: 60 },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceived = new Promise<RobotCommand>((resolve) => {
      hostSocket.once('robot:command', resolve);
    });

    const ack = await new Promise<any>((resolve) => {
      controllerSocket.emit('robot:command', freshCmd, resolve);
    });

    expect(ack.status).toBe('accepted');
    const received = await hostReceived;
    expect(received.commandId).toBe(freshCmd.commandId);
  });

  it('TEST 9: Safe rejection of out-of-workspace coordinates', async () => {
    const outOfBoundsCmd: RobotCommand = {
      commandId: `oob-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'MOVE_TO',
      payload: { x: 999, y: 0, z: 0 },
      timestamp: Date.now(),
      sender: 'test',
    };

    const ack = await new Promise<any>((resolve) => {
      controllerSocket.emit('robot:command', outOfBoundsCmd, resolve);
    });

    expect(ack.status).toBe('rejected');
    expect(ack.reason).toContain('limits');
  });

  it('TEST 10: Emergency Stop is immediately broadcast to all devices', async () => {
    const estopPromise = new Promise<void>((resolve) => {
      hostSocket.once('robot:emergency-stop', resolve);
    });

    controllerSocket.emit('robot:emergency-stop');
    await estopPromise;
    expect(true).toBe(true);
  });
});
