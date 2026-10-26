'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from './client';
import {
  RobotCommand,
  RobotStatePayload,
  CommandType,
  DEFAULT_SESSION_ID,
  CommandAck,
  CommandProgress,
} from './types';
import { EndEffectorType } from '../store/useDobotStore';
import { forwardKinematics, inverseKinematics, HOME_JOINTS } from '../kinematics';

export interface ControllerState {
  isConnected: boolean;
  hostOnline: boolean;
  isSimulationMode: boolean;
  robotState: RobotStatePayload | null;
  lastCommand: {
    commandId: string;
    type: CommandType;
    status: 'pending' | 'accepted' | 'started' | 'completed' | 'failed' | 'rejected';
    message?: string;
    timestamp: number;
  } | null;
  activeCycleStep: string | null;
}

export function useControllerSync(username: string = 'test') {
  const [isSimulationMode, setSimulationMode] = useState<boolean>(false);
  const [state, setState] = useState<ControllerState>({
    isConnected: false,
    hostOnline: false,
    isSimulationMode: false,
    robotState: {
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
      controllerConnected: true,
      lastCommandId: null,
      stateVersion: 0,
      isEmergencyStopped: false,
    },
    lastCommand: null,
    activeCycleStep: null,
  });

  const stateVersionRef = useRef<number>(0);
  const simStateRef = useRef<RobotStatePayload>({ ...state.robotState! });

  // Keep simStateRef synchronized with robotState
  useEffect(() => {
    if (state.robotState) {
      simStateRef.current = { ...state.robotState };
    }
  }, [state.robotState]);

  // Sync simulation mode to state
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isSimulationMode,
      hostOnline: isSimulationMode ? true : prev.hostOnline,
    }));
  }, [isSimulationMode]);

  // Main Socket Connection & Event Listeners
  useEffect(() => {
    const socket = getSocket(null, 'controller', username);

    const handleConnect = () => {
      console.log('[CONTROLLER SYNC] Connected to Realtime Backend as Controller');
      setState((prev) => ({ ...prev, isConnected: true }));
    };

    const handleDisconnect = () => {
      console.log('[CONTROLLER SYNC] Disconnected from Realtime Backend');
      setState((prev) => ({
        ...prev,
        isConnected: false,
        hostOnline: isSimulationMode ? true : false,
      }));
    };

    const handleSessionState = (incoming: RobotStatePayload) => {
      if (!incoming) return;
      stateVersionRef.current = incoming.stateVersion || 0;
      setState((prev) => ({
        ...prev,
        hostOnline: isSimulationMode ? true : (incoming.hostConnected ?? prev.hostOnline),
        robotState: {
          ...prev.robotState,
          ...incoming,
        },
        activeCycleStep: incoming.cycleStatus || null,
      }));
    };

    const handleStateUpdate = (incoming: RobotStatePayload) => {
      if (!incoming) return;
      if (incoming.stateVersion !== undefined && incoming.stateVersion < stateVersionRef.current) {
        return; // Stale update discarded
      }
      stateVersionRef.current = incoming.stateVersion;

      setState((prev) => ({
        ...prev,
        hostOnline: isSimulationMode ? true : (incoming.hostConnected ?? true),
        robotState: {
          ...prev.robotState,
          ...incoming,
        },
        activeCycleStep: incoming.cycleStatus || prev.activeCycleStep,
      }));
    };

    const handleUserConnected = (data: { role: string; hostConnected: boolean }) => {
      if (data.role === 'host' || data.hostConnected) {
        setState((prev) => ({
          ...prev,
          hostOnline: true,
          robotState: prev.robotState ? { ...prev.robotState, hostConnected: true } : null,
        }));
      }
    };

    const handleUserDisconnected = (data: { role: string; hostConnected: boolean }) => {
      if (data.role === 'host' || !data.hostConnected) {
        setState((prev) => ({
          ...prev,
          hostOnline: isSimulationMode ? true : false,
          robotState: prev.robotState ? { ...prev.robotState, hostConnected: false } : null,
        }));
      }
    };

    const handleCommandStarted = (data: CommandProgress) => {
      setState((prev) => ({
        ...prev,
        lastCommand:
          prev.lastCommand?.commandId === data.commandId
            ? { ...prev.lastCommand, status: 'started', message: data.step }
            : prev.lastCommand,
        activeCycleStep: data.step || prev.activeCycleStep,
        robotState: prev.robotState
          ? {
              ...prev.robotState,
              robotStatus: (data as any).isCycle ? 'executing' : 'moving',
              cycleStatus: data.step || prev.robotState.cycleStatus,
            }
          : null,
      }));
    };

    const handleCommandCompleted = (data: CommandProgress) => {
      setState((prev) => ({
        ...prev,
        lastCommand:
          prev.lastCommand?.commandId === data.commandId
            ? { ...prev.lastCommand, status: 'completed', message: 'Executed successfully on Host' }
            : prev.lastCommand,
        activeCycleStep: null,
        robotState: prev.robotState
          ? { ...prev.robotState, robotStatus: 'idle', cycleStatus: null }
          : null,
      }));
    };

    const handleCommandFailed = (data: CommandProgress) => {
      setState((prev) => ({
        ...prev,
        lastCommand:
          prev.lastCommand?.commandId === data.commandId
            ? { ...prev.lastCommand, status: 'failed', message: data.error || 'Execution failed' }
            : prev.lastCommand,
        activeCycleStep: null,
        robotState: prev.robotState
          ? { ...prev.robotState, robotStatus: 'error', cycleStatus: null }
          : null,
      }));
    };

    const handleEmergencyStop = () => {
      setState((prev) => ({
        ...prev,
        robotState: prev.robotState
          ? { ...prev.robotState, isEmergencyStopped: true, robotStatus: 'stopped' }
          : null,
        lastCommand: {
          commandId: `estop-${Date.now()}`,
          type: 'EMERGENCY_STOP',
          status: 'completed',
          message: 'EMERGENCY STOP ACTIVATED',
          timestamp: Date.now(),
        },
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('session:state', handleSessionState);
    socket.on('robot:state:update', handleStateUpdate);
    socket.on('user:connected', handleUserConnected);
    socket.on('user:disconnected', handleUserDisconnected);
    socket.on('robot:command:started', handleCommandStarted);
    socket.on('robot:command:completed', handleCommandCompleted);
    socket.on('robot:command:failed', handleCommandFailed);
    socket.on('robot:emergency-stop', handleEmergencyStop);

    if (socket.connected) {
      handleConnect();
    }

    // Serverless Fallback Polling (Vercel) when Socket is disconnected & not in simulation mode
    const serverlessPoll = setInterval(async () => {
      if (socket.connected || isSimulationMode) return;

      try {
        const res = await fetch('/api/realtime/state?role=controller');
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.success && data.state) {
          setState((prev) => ({
            ...prev,
            isConnected: true,
            hostOnline: data.state.hostConnected ?? prev.hostOnline,
            robotState: {
              ...prev.robotState,
              ...data.state,
            },
            activeCycleStep: data.state.cycleStatus || null,
          }));
        }
      } catch {
        // quiet ignore for polling
      }
    }, 800);

    return () => {
      clearInterval(serverlessPoll);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('session:state', handleSessionState);
      socket.off('robot:state:update', handleStateUpdate);
      socket.off('user:connected', handleUserConnected);
      socket.off('user:disconnected', handleUserDisconnected);
      socket.off('robot:command:started', handleCommandStarted);
      socket.off('robot:command:completed', handleCommandCompleted);
      socket.off('robot:command:failed', handleCommandFailed);
      socket.off('robot:emergency-stop', handleEmergencyStop);
    };
  }, [username, isSimulationMode]);

  // Execute Simulated Kinematics locally for Test Mode
  const executeLocalSimulation = useCallback(
    (command: RobotCommand): boolean => {
      const current = simStateRef.current;
      const commandId = command.commandId;

      // Handle Emergency Stop
      if (command.type === 'EMERGENCY_STOP') {
        const updated: RobotStatePayload = {
          ...current,
          isEmergencyStopped: true,
          robotStatus: 'stopped',
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: 'Emergency Stop engaged! Kinematics locked.',
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle Reset
      if (command.type === 'RESET') {
        const updated: RobotStatePayload = {
          ...current,
          isEmergencyStopped: false,
          robotStatus: 'idle',
          cycleStatus: null,
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: 'Robot reset. Normal operation resumed.',
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Block other commands if E-Stopped
      if (current.isEmergencyStopped) {
        setState((prev) => ({
          ...prev,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'rejected',
            message: 'Emergency Stop is active. Reset robot first.',
            timestamp: Date.now(),
          },
        }));
        return false;
      }

      // Handle HOME
      if (command.type === 'HOME') {
        const pose = forwardKinematics(HOME_JOINTS.j1, HOME_JOINTS.j2, HOME_JOINTS.j3, HOME_JOINTS.j4);
        const updated: RobotStatePayload = {
          ...current,
          x: pose.x,
          y: pose.y,
          z: pose.z,
          r: pose.r,
          joints: { ...HOME_JOINTS },
          robotStatus: 'idle',
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: 'Returned to Home Position (J1:0°, J2:40°, J3:45°, J4:0°)',
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle MOVE_TO
      if (command.type === 'MOVE_TO') {
        const { x = current.x, y = current.y, z = current.z, r = current.r } = command.payload || {};

        // Workspace limits validation
        if (x < 120 || x > 330) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'rejected',
              message: `X (${x.toFixed(1)}) is out of safe range [120, 330] mm`,
              timestamp: Date.now(),
            },
          }));
          return false;
        }
        if (y < -330 || y > 330) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'rejected',
              message: `Y (${y.toFixed(1)}) is out of safe range [-330, 330] mm`,
              timestamp: Date.now(),
            },
          }));
          return false;
        }
        if (z < -60 || z > 180) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'rejected',
              message: `Z (${z.toFixed(1)}) is out of safe range [-60, 180] mm`,
              timestamp: Date.now(),
            },
          }));
          return false;
        }

        // Kinematics Reachability Check
        const ik = inverseKinematics(x, y, z, r);
        if (!ik) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'rejected',
              message: 'Target pose is outside robot kinematic reachability limit',
              timestamp: Date.now(),
            },
          }));
          return false;
        }

        const updated: RobotStatePayload = {
          ...current,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          r: Number(r.toFixed(2)),
          joints: {
            j1: Number(ik.j1.toFixed(2)),
            j2: Number(ik.j2.toFixed(2)),
            j3: Number(ik.j3.toFixed(2)),
            j4: Number(ik.j4.toFixed(2)),
          },
          robotStatus: 'idle',
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: `Moved to (X:${x.toFixed(1)}, Y:${y.toFixed(1)}, Z:${z.toFixed(1)})`,
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle JOG_AXIS
      if (command.type === 'JOG_AXIS') {
        const { axis, delta } = command.payload || {};
        const target = { x: current.x, y: current.y, z: current.z, r: current.r };
        if (axis === 'x') target.x += delta;
        if (axis === 'y') target.y += delta;
        if (axis === 'z') target.z += delta;
        if (axis === 'r') target.r += delta;

        const ik = inverseKinematics(target.x, target.y, target.z, target.r);
        if (!ik) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'rejected',
              message: `Jogging ${axis.toUpperCase()} by ${delta > 0 ? '+' : ''}${delta} hits joint limit`,
              timestamp: Date.now(),
            },
          }));
          return false;
        }

        const updated: RobotStatePayload = {
          ...current,
          x: Number(target.x.toFixed(2)),
          y: Number(target.y.toFixed(2)),
          z: Number(target.z.toFixed(2)),
          r: Number(target.r.toFixed(2)),
          joints: {
            j1: Number(ik.j1.toFixed(2)),
            j2: Number(ik.j2.toFixed(2)),
            j3: Number(ik.j3.toFixed(2)),
            j4: Number(ik.j4.toFixed(2)),
          },
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: `Jogged ${axis.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}`,
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle JOG_JOINT
      if (command.type === 'JOG_JOINT') {
        const { joint, delta } = command.payload || {};
        const newJoints = { ...current.joints };
        if (joint in newJoints) {
          (newJoints as any)[joint] = Number(((newJoints as any)[joint] + delta).toFixed(2));
        }

        const fk = forwardKinematics(newJoints.j1, newJoints.j2, newJoints.j3, newJoints.j4);
        const updated: RobotStatePayload = {
          ...current,
          x: Number(fk.x.toFixed(2)),
          y: Number(fk.y.toFixed(2)),
          z: Number(fk.z.toFixed(2)),
          r: Number(fk.r.toFixed(2)),
          joints: newJoints,
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: `Jogged ${joint.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}°`,
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle SET_TOOL
      if (command.type === 'SET_TOOL') {
        const tool = command.payload?.tool;
        const updated: RobotStatePayload = { ...current, activeTool: tool };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: `Switched end-effector to ${tool}`,
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle SET_SUCTION
      if (command.type === 'SET_SUCTION') {
        const active = !!command.payload?.active;
        const updated: RobotStatePayload = {
          ...current,
          suctionEnabled: active,
          attachedObjectName: active ? 'Simulated Cube' : null,
        };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: active ? 'Pneumatic suction engaged' : 'Pneumatic suction released',
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle SET_SPEED
      if (command.type === 'SET_SPEED') {
        const speed = command.payload?.speed ?? 50;
        const updated: RobotStatePayload = { ...current, velocity: speed };
        simStateRef.current = updated;
        setState((prev) => ({
          ...prev,
          robotState: updated,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'completed',
            message: `Velocity updated to ${speed}%`,
            timestamp: Date.now(),
          },
        }));
        return true;
      }

      // Handle Autonomous PICK_AND_PLACE
      if (command.type === 'PICK_AND_PLACE') {
        const { source, destination, safeZ = 100 } = command.payload || {};
        setState((prev) => ({
          ...prev,
          activeCycleStep: '1/4: Moving above source object...',
          robotState: prev.robotState ? { ...prev.robotState, robotStatus: 'executing' } : null,
          lastCommand: {
            commandId,
            type: command.type,
            status: 'started',
            message: 'Starting simulated Pick & Place cycle...',
            timestamp: Date.now(),
          },
        }));

        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            activeCycleStep: '2/4: Lowering and engaging suction cup...',
            robotState: prev.robotState
              ? {
                  ...prev.robotState,
                  x: source.x,
                  y: source.y,
                  z: source.z,
                  suctionEnabled: true,
                  attachedObjectName: 'Cube Block A',
                }
              : null,
          }));
        }, 800);

        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            activeCycleStep: '3/4: Transporting to target destination...',
            robotState: prev.robotState
              ? { ...prev.robotState, z: safeZ }
              : null,
          }));
        }, 1600);

        setTimeout(() => {
          const ikDest = inverseKinematics(destination.x, destination.y, destination.z, destination.r || 0);
          setState((prev) => ({
            ...prev,
            activeCycleStep: null,
            robotState: prev.robotState
              ? {
                  ...prev.robotState,
                  x: destination.x,
                  y: destination.y,
                  z: destination.z,
                  r: destination.r || 0,
                  joints: ikDest ? { j1: ikDest.j1, j2: ikDest.j2, j3: ikDest.j3, j4: ikDest.j4 } : prev.robotState.joints,
                  suctionEnabled: false,
                  attachedObjectName: null,
                  robotStatus: 'idle',
                }
              : null,
            lastCommand: {
              commandId,
              type: command.type,
              status: 'completed',
              message: 'Autonomous Pick & Place cycle completed successfully!',
              timestamp: Date.now(),
            },
          }));
        }, 2500);

        return true;
      }

      // Default fallback
      return true;
    },
    []
  );

  // Generic Command Dispatcher
  const sendCommand = useCallback(
    async (type: CommandType, payload: any): Promise<boolean> => {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const command: RobotCommand = {
        commandId,
        sessionId: DEFAULT_SESSION_ID,
        type,
        payload,
        timestamp: Date.now(),
        sender: username,
      };

      // 1. If in local simulation mode, execute immediately in browser
      if (isSimulationMode) {
        return executeLocalSimulation(command);
      }

      const socket = getSocket(null, 'controller', username);

      // 2. If Socket.IO is connected, dispatch over persistent WebSocket
      if (socket && socket.connected) {
        if (!state.hostOnline && type !== 'EMERGENCY_STOP' && type !== 'RESET') {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type,
              status: 'rejected',
              message: 'Host simulator is offline. Open simulator on laptop as atharv, or switch to Test Mode.',
              timestamp: Date.now(),
            },
          }));
          return false;
        }

        return new Promise((resolve) => {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type,
              status: 'pending',
              message: 'Sending command to Host...',
              timestamp: Date.now(),
            },
          }));

          socket.emit('robot:command', command, (ack: CommandAck) => {
            if (!ack || ack.status === 'rejected') {
              setState((prev) => ({
                ...prev,
                lastCommand: {
                  commandId,
                  type,
                  status: 'rejected',
                  message: ack?.reason || 'Command rejected by server',
                  timestamp: Date.now(),
                },
              }));
              resolve(false);
            } else {
              setState((prev) => ({
                ...prev,
                lastCommand: {
                  commandId,
                  type,
                  status: 'accepted',
                  message: 'Accepted by Host. Moving...',
                  timestamp: Date.now(),
                },
              }));
              resolve(true);
            }
          });
        });
      }

      // 3. Fallback: Dispatch via Serverless HTTP Relay
      try {
        setState((prev) => ({
          ...prev,
          lastCommand: {
            commandId,
            type,
            status: 'pending',
            message: 'Dispatching via Serverless Relay...',
            timestamp: Date.now(),
          },
        }));

        const res = await fetch('/api/realtime/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });

        const data = await res.json();
        if (data && data.success) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type,
              status: 'accepted',
              message: 'Accepted by Host (via HTTP relay).',
              timestamp: Date.now(),
            },
          }));
          return true;
        } else {
          // If rejected because host offline, offer Test Mode
          const reason = data?.reason || 'Host simulator is offline.';
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId,
              type,
              status: 'rejected',
              message: `${reason} Enable Test Mode to simulate on this device.`,
              timestamp: Date.now(),
            },
          }));
          return false;
        }
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          lastCommand: {
            commandId,
            type,
            status: 'rejected',
            message: 'Host offline and relay unreachable. Click "Enable Test Mode" to test locally.',
            timestamp: Date.now(),
          },
        }));
        return false;
      }
    },
    [isSimulationMode, executeLocalSimulation, state.hostOnline, username]
  );

  const sendMoveTo = (x?: number, y?: number, z?: number, r?: number, durationSec?: number) =>
    sendCommand('MOVE_TO', { x, y, z, r, durationSec });

  const sendJogAxis = (axis: 'x' | 'y' | 'z' | 'r', delta: number) =>
    sendCommand('JOG_AXIS', { axis, delta });

  const sendJogJoint = (joint: 'j1' | 'j2' | 'j3' | 'j4', delta: number) =>
    sendCommand('JOG_JOINT', { joint, delta });

  const sendSetSpeed = (speed: number) => sendCommand('SET_SPEED', { speed });

  const sendSetTool = (tool: EndEffectorType) => sendCommand('SET_TOOL', { tool });

  const sendSetSuction = (active: boolean) => sendCommand('SET_SUCTION', { active });

  const sendPickAndPlace = (
    source: { x: number; y: number; z: number; r?: number },
    destination: { x: number; y: number; z: number; r?: number },
    safeZ: number = 100
  ) => sendCommand('PICK_AND_PLACE', { source, destination, safeZ });

  const sendPickOnly = () => sendCommand('PICK_ONLY', {});

  const sendPlaceOnly = () => sendCommand('PLACE_ONLY', {});

  const sendEmergencyStop = () => {
    const socket = getSocket(null, 'controller', username);
    if (socket && socket.connected) {
      socket.emit('robot:emergency-stop', { timestamp: Date.now() });
    }
    return sendCommand('EMERGENCY_STOP', {});
  };

  const sendReset = () => sendCommand('RESET', {});

  const sendHome = () => sendCommand('HOME', {});

  return {
    ...state,
    setSimulationMode,
    sendMoveTo,
    sendJogAxis,
    sendJogJoint,
    sendSetSpeed,
    sendSetTool,
    sendSetSuction,
    sendPickAndPlace,
    sendPickOnly,
    sendPlaceOnly,
    sendEmergencyStop,
    sendReset,
    sendHome,
  };
}
