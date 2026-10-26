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

export interface ControllerState {
  isConnected: boolean;
  hostOnline: boolean;
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
  const [state, setState] = useState<ControllerState>({
    isConnected: false,
    hostOnline: false,
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

  useEffect(() => {
    const socket = getSocket(null, 'controller', username);

    const handleConnect = () => {
      console.log('[CONTROLLER SYNC] Connected to Realtime Backend as Controller');
      setState((prev) => ({ ...prev, isConnected: true }));
    };

    const handleDisconnect = () => {
      console.log('[CONTROLLER SYNC] Disconnected from Realtime Backend');
      setState((prev) => ({ ...prev, isConnected: false, hostOnline: false }));
    };

    const handleSessionState = (incoming: RobotStatePayload) => {
      if (!incoming) return;
      stateVersionRef.current = incoming.stateVersion || 0;
      setState((prev) => ({
        ...prev,
        hostOnline: incoming.hostConnected ?? prev.hostOnline,
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
        hostOnline: incoming.hostConnected ?? true,
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
          hostOnline: false,
          robotState: prev.robotState ? { ...prev.robotState, hostConnected: false } : null,
        }));
      }
    };

    const handleCommandStarted = (data: CommandProgress) => {
      setState((prev) => ({
        ...prev,
        lastCommand: prev.lastCommand?.commandId === data.commandId
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
        lastCommand: prev.lastCommand?.commandId === data.commandId
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
        lastCommand: prev.lastCommand?.commandId === data.commandId
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

    return () => {
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
  }, [username]);

  // Generic Command Dispatcher
  const sendCommand = useCallback(
    (type: CommandType, payload: any): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = getSocket(null, 'controller', username);

        if (!socket || !socket.connected) {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId: `err-${Date.now()}`,
              type,
              status: 'rejected',
              message: 'Not connected to real-time server',
              timestamp: Date.now(),
            },
          }));
          resolve(false);
          return;
        }

        if (!state.hostOnline && type !== 'EMERGENCY_STOP') {
          setState((prev) => ({
            ...prev,
            lastCommand: {
              commandId: `err-${Date.now()}`,
              type,
              status: 'rejected',
              message: 'Host simulator is offline. Robot cannot accept commands.',
              timestamp: Date.now(),
            },
          }));
          resolve(false);
          return;
        }

        const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const command: RobotCommand = {
          commandId,
          sessionId: DEFAULT_SESSION_ID,
          type,
          payload,
          timestamp: Date.now(),
          sender: username,
        };

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
    },
    [state.hostOnline, username]
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
