import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { signToken } from '../auth/jwt';
import { RobotCommand, DEFAULT_SESSION_ID } from './types';
import { forwardKinematics, inverseKinematics, HOME_JOINTS } from '../kinematics';

describe('E2E Real-Time Multi-Device Remote Control against Live Server', () => {
  const SERVER_URL = 'http://localhost:3002';
  let hostSocket: ClientSocketType;
  let controllerSocket: ClientSocketType;

  let hostToken: string;
  let controllerToken: string;

  beforeAll(async () => {
    hostToken = signToken({ username: 'atharv', role: 'host', sessionId: DEFAULT_SESSION_ID });
    controllerToken = signToken({ username: 'test', role: 'controller', sessionId: DEFAULT_SESSION_ID });
  });

  afterAll(() => {
    if (hostSocket?.connected) hostSocket.disconnect();
    if (controllerSocket?.connected) controllerSocket.disconnect();
  });

  it('connects Atharv (Host) and Test (Controller) to the live server on port 3002', async () => {
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

    // Ensure session starts with clean, non-emergency state
    hostSocket.emit('robot:state:update', {
      isEmergencyStopped: false,
      robotStatus: 'idle',
      cycleStatus: null,
    });
    await new Promise((r) => setTimeout(r, 100));
  });

  it('Controller sends MOVE_TO { x: 240, y: 100, z: 35, r: 0 } and Host executes actual kinematics', async () => {
    const moveCmd: RobotCommand = {
      commandId: `e2e-move-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'MOVE_TO',
      payload: { x: 240, y: 100, z: 35, r: 0 },
      timestamp: Date.now(),
      sender: 'test',
    };

    // Host listens for command
    const hostExecutionPromise = new Promise<void>((resolve) => {
      hostSocket.once('robot:command', (cmd) => {
        expect(cmd.commandId).toBe(moveCmd.commandId);
        expect(cmd.payload.x).toBe(240);

        // Host computes real IK
        const ik = inverseKinematics(cmd.payload.x, cmd.payload.y, cmd.payload.z, cmd.payload.r);
        expect(ik).not.toBeNull();

        // Host notifies completion
        hostSocket.emit('robot:command:completed', {
          commandId: cmd.commandId,
          type: cmd.type,
        });

        // Host broadcasts updated authoritative state
        hostSocket.emit('robot:state:update', {
          x: cmd.payload.x,
          y: cmd.payload.y,
          z: cmd.payload.z,
          r: cmd.payload.r,
          joints: ik,
          robotStatus: 'idle',
        });

        resolve();
      });
    });

    // Controller listens for command completion and state update
    const controllerCompletedPromise = new Promise<void>((resolve) => {
      controllerSocket.once('robot:command:completed', (data) => {
        expect(data.commandId).toBe(moveCmd.commandId);
        resolve();
      });
    });

    const controllerStateUpdatePromise = new Promise<void>((resolve) => {
      controllerSocket.once('robot:state:update', (state) => {
        expect(state.x).toBe(240);
        expect(state.y).toBe(100);
        expect(state.z).toBe(35);
        resolve();
      });
    });

    // Controller sends command with server acknowledgment
    const ack = await new Promise<any>((resolve) => {
      controllerSocket.emit('robot:command', moveCmd, resolve);
    });

    expect(ack.status).toBe('accepted');

    await Promise.all([
      hostExecutionPromise,
      controllerCompletedPromise,
      controllerStateUpdatePromise,
    ]);
  });

  it('Controller activates pneumatic suction cup and Host updates tool state', async () => {
    const suctionCmd: RobotCommand = {
      commandId: `e2e-suc-${Date.now()}`,
      sessionId: DEFAULT_SESSION_ID,
      type: 'SET_SUCTION',
      payload: { active: true },
      timestamp: Date.now(),
      sender: 'test',
    };

    const hostReceived = new Promise<void>((resolve) => {
      hostSocket.once('robot:command', (cmd) => {
        expect(cmd.type).toBe('SET_SUCTION');
        expect(cmd.payload.active).toBe(true);

        hostSocket.emit('robot:state:update', {
          suctionEnabled: true,
          attachedObjectName: 'Cube Block A',
        });
        resolve();
      });
    });

    const controllerState = new Promise<void>((resolve) => {
      controllerSocket.once('robot:state:update', (state) => {
        expect(state.suctionEnabled).toBe(true);
        expect(state.attachedObjectName).toBe('Cube Block A');
        resolve();
      });
    });

    controllerSocket.emit('robot:command', suctionCmd);
    await Promise.all([hostReceived, controllerState]);
  });

  it('Controller triggers Emergency Stop and all devices receive instant halt', async () => {
    const hostEstop = new Promise<void>((resolve) => {
      hostSocket.once('robot:emergency-stop', resolve);
    });

    controllerSocket.emit('robot:emergency-stop');
    await hostEstop;
  });
});
