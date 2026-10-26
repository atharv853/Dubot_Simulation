import { RobotCommand, RobotStatePayload, CommandProgress, DEFAULT_SESSION_ID } from './types';

interface GlobalRelayStore {
  sessionState: RobotStatePayload;
  hostLastSeen: number;
  controllerLastSeen: number;
  pendingCommands: RobotCommand[];
  commandResults: Record<string, CommandProgress>;
}

// Global variable attached to globalThis to persist across hot-reloads and requests within the process
const globalRef = globalThis as unknown as { __dobotRelayStore?: GlobalRelayStore };

if (!globalRef.__dobotRelayStore) {
  globalRef.__dobotRelayStore = {
    sessionState: {
      sessionId: DEFAULT_SESSION_ID,
      x: 250.72,
      y: 0,
      z: 67.47,
      r: 0,
      joints: { j1: 0, j2: 40, j3: 45, j4: 0 },
      velocity: 50,
      robotStatus: 'idle',
      activeTool: 'suction',
      suctionEnabled: false,
      attachedObjectName: null,
      hostConnected: false,
      controllerConnected: false,
      lastCommandId: null,
      stateVersion: 0,
      cycleStatus: null,
      isEmergencyStopped: false,
    },
    hostLastSeen: 0,
    controllerLastSeen: 0,
    pendingCommands: [],
    commandResults: {},
  };
}

const store = globalRef.__dobotRelayStore;

export function updateHostState(incoming: Partial<RobotStatePayload>): RobotStatePayload {
  store.hostLastSeen = Date.now();
  store.sessionState = {
    ...store.sessionState,
    ...incoming,
    hostConnected: true,
    controllerConnected: Date.now() - store.controllerLastSeen < 8000,
    stateVersion: (store.sessionState.stateVersion || 0) + 1,
  };
  return store.sessionState;
}

export function touchController(): void {
  store.controllerLastSeen = Date.now();
  store.sessionState.controllerConnected = true;
}

export function getAuthoritativeState(): RobotStatePayload {
  const isHostAlive = Date.now() - store.hostLastSeen < 8000;
  const isControllerAlive = Date.now() - store.controllerLastSeen < 8000;

  store.sessionState.hostConnected = isHostAlive;
  store.sessionState.controllerConnected = isControllerAlive;

  return store.sessionState;
}

export function queueCommand(command: RobotCommand): { accepted: boolean; reason?: string } {
  // Check if host is online
  const isHostAlive = Date.now() - store.hostLastSeen < 10000;
  if (!isHostAlive && command.type !== 'EMERGENCY_STOP' && command.type !== 'RESET') {
    return { accepted: false, reason: 'Host simulator is offline. Robot cannot accept commands.' };
  }

  // Check emergency stop
  if (store.sessionState.isEmergencyStopped && command.type !== 'RESET' && command.type !== 'EMERGENCY_STOP') {
    return { accepted: false, reason: 'Emergency Stop is active. Reset robot first.' };
  }

  // Deduplication
  const existing = store.pendingCommands.find((c) => c.commandId === command.commandId);
  if (existing) {
    return { accepted: false, reason: 'Duplicate command ignored.' };
  }

  // Safety limits for MOVE_TO
  if (command.type === 'MOVE_TO' && command.payload) {
    const { x, y, z, r } = command.payload;
    if (x !== undefined && (isNaN(x) || x < 120 || x > 330)) {
      return { accepted: false, reason: `X coordinate (${x}) is out of safe range [120, 330]` };
    }
    if (y !== undefined && (isNaN(y) || y < -330 || y > 330)) {
      return { accepted: false, reason: `Y coordinate (${y}) is out of safe range [-330, 330]` };
    }
    if (z !== undefined && (isNaN(z) || z < -60 || z > 180)) {
      return { accepted: false, reason: `Z coordinate (${z}) is out of safe range [-60, 180]` };
    }
    if (r !== undefined && (isNaN(r) || r < -135 || r > 135)) {
      return { accepted: false, reason: `R angle (${r}) is out of safe range [-135, 135]` };
    }
  }

  if (command.type === 'EMERGENCY_STOP') {
    store.sessionState.isEmergencyStopped = true;
    store.sessionState.robotStatus = 'stopped';
    store.pendingCommands = []; // Clear pending movements on E-stop
  }

  if (command.type === 'RESET') {
    store.sessionState.isEmergencyStopped = false;
    store.sessionState.robotStatus = 'idle';
  }

  store.pendingCommands.push(command);
  store.sessionState.lastCommandId = command.commandId;
  store.commandResults[command.commandId] = {
    commandId: command.commandId,
    status: 'started',
    timestamp: Date.now(),
  };

  return { accepted: true };
}

export function popPendingCommands(): RobotCommand[] {
  const cmds = [...store.pendingCommands];
  store.pendingCommands = [];
  return cmds;
}

export function recordCommandResult(result: CommandProgress): void {
  store.commandResults[result.commandId] = result;
  if (result.status === 'completed') {
    store.sessionState.robotStatus = 'idle';
  } else if (result.status === 'failed') {
    store.sessionState.robotStatus = 'error';
  }
}

export function getCommandResult(commandId: string): CommandProgress | null {
  return store.commandResults[commandId] || null;
}
