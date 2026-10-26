'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useDobotStore } from '../store/useDobotStore';
import { getSocket } from './client';
import { RobotCommand, RobotStatePayload, DEFAULT_SESSION_ID } from './types';

export interface HostSyncStatus {
  isConnected: boolean;
  controllerConnected: boolean;
  controllerUsername: string | null;
  lastRemoteCommand: {
    type: string;
    sender: string;
    status: 'received' | 'started' | 'completed' | 'failed';
    timestamp: number;
    error?: string;
  } | null;
  reconnectCount: number;
}

export function useHostSync(username: string = 'atharv') {
  const [syncStatus, setSyncStatus] = useState<HostSyncStatus>({
    isConnected: false,
    controllerConnected: false,
    controllerUsername: null,
    lastRemoteCommand: null,
    reconnectCount: 0,
  });

  const processedCommandsRef = useRef<Set<string>>(new Set());
  const stateVersionRef = useRef<number>(1);
  const lastBroadcastTimeRef = useRef<number>(0);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to compile authoritative state payload directly from store snapshot
  const compileStatePayload = useCallback((): RobotStatePayload => {
    const state = useDobotStore.getState();
    const attachedObj = state.objects.find((o) => o.attachedToTool);

    return {
      sessionId: DEFAULT_SESSION_ID,
      x: Number(state.cartesian.x.toFixed(2)),
      y: Number(state.cartesian.y.toFixed(2)),
      z: Number(state.cartesian.z.toFixed(2)),
      r: Number(state.cartesian.r.toFixed(2)),
      joints: {
        j1: Number(state.joints.j1.toFixed(2)),
        j2: Number(state.joints.j2.toFixed(2)),
        j3: Number(state.joints.j3.toFixed(2)),
        j4: Number(state.joints.j4.toFixed(2)),
      },
      velocity: state.speed,
      robotStatus: state.isEmergencyStopped ? 'stopped' : state.isMoving ? 'moving' : 'idle',
      activeTool: state.endEffectorType,
      suctionEnabled: state.endEffectorActive,
      attachedObjectName: attachedObj ? attachedObj.name : null,
      hostConnected: true,
      controllerConnected: syncStatus.controllerConnected,
      lastCommandId: null,
      stateVersion: stateVersionRef.current++,
      isEmergencyStopped: state.isEmergencyStopped,
    };
  }, [syncStatus.controllerConnected]);

  // Execute a remote command on the actual Dobot store
  const executeCommand = useCallback(
    async (cmd: RobotCommand): Promise<boolean> => {
      if (!cmd || !cmd.commandId) return false;
      if (processedCommandsRef.current.has(cmd.commandId)) return false;
      processedCommandsRef.current.add(cmd.commandId);

      const store = useDobotStore.getState();
      const socket = getSocket(null, 'host', username);

      setSyncStatus((prev) => ({
        ...prev,
        lastRemoteCommand: {
          type: cmd.type,
          sender: cmd.sender,
          status: 'received',
          timestamp: Date.now(),
        },
      }));

      // Report started
      if (socket && socket.connected) {
        socket.emit('robot:command:started', {
          commandId: cmd.commandId,
          type: cmd.type,
          isCycle: cmd.type === 'PICK_AND_PLACE',
          step: cmd.type === 'PICK_AND_PLACE' ? 'Starting autonomous pick & place' : undefined,
        });
      }

      try {
        let success = false;
        let errorMessage: string | undefined;

        switch (cmd.type) {
          case 'MOVE_TO': {
            const { x, y, z, r, durationSec } = cmd.payload || {};
            success = await store.moveToCartesianTarget({ x, y, z, r }, durationSec);
            if (!success) errorMessage = useDobotStore.getState().jogWarning || 'Movement unreachable or blocked';
            break;
          }

          case 'JOG_AXIS': {
            const { axis, delta } = cmd.payload;
            success = store.jogCartesian(axis, delta);
            if (!success) errorMessage = useDobotStore.getState().jogWarning || `Cannot jog axis ${axis}`;
            break;
          }

          case 'JOG_JOINT': {
            const { joint, delta } = cmd.payload;
            success = store.jogJoint(joint, delta);
            if (!success) errorMessage = useDobotStore.getState().jogWarning || `Cannot jog joint ${joint}`;
            break;
          }

          case 'SET_SPEED': {
            const targetSpeed = Number(cmd.payload?.speed);
            if (!isNaN(targetSpeed)) {
              store.setSpeed(targetSpeed);
              success = true;
            }
            break;
          }

          case 'SET_TOOL': {
            store.setEndEffectorType(cmd.payload.tool);
            success = true;
            break;
          }

          case 'SET_SUCTION': {
            store.setEndEffectorActive(Boolean(cmd.payload.active));
            success = true;
            break;
          }

          case 'PICK_AND_PLACE': {
            const { source, destination, safeZ } = cmd.payload;
            success = await store.executeCustomPickAndPlace(source, destination, safeZ || 100, (stepName) => {
              if (socket && socket.connected) {
                socket.emit('robot:command:started', {
                  commandId: cmd.commandId,
                  type: cmd.type,
                  isCycle: true,
                  step: stepName,
                });
              }
            });
            if (!success) errorMessage = useDobotStore.getState().jogWarning || 'Pick & place cycle failed';
            break;
          }

          case 'PICK_ONLY': {
            success = await store.pickNearestObject();
            if (!success) errorMessage = 'Pick operation failed (no reachable block)';
            break;
          }

          case 'PLACE_ONLY': {
            store.releaseObject();
            success = true;
            break;
          }

          case 'EMERGENCY_STOP': {
            store.setEmergencyStopped(true);
            success = true;
            break;
          }

          case 'RESET': {
            store.resetAll();
            success = true;
            break;
          }

          case 'HOME': {
            store.homeRobot();
            success = true;
            break;
          }

          default:
            errorMessage = `Unknown command type: ${(cmd as any).type}`;
            success = false;
        }

        const resultData = {
          commandId: cmd.commandId,
          type: cmd.type,
          status: success ? ('completed' as const) : ('failed' as const),
          error: errorMessage,
          timestamp: Date.now(),
        };

        if (socket && socket.connected) {
          if (success) {
            socket.emit('robot:command:completed', resultData);
          } else {
            socket.emit('robot:command:failed', resultData);
          }
        }

        // Also report result to serverless API endpoint
        fetch('/api/realtime/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'report_result', result: resultData }),
        }).catch(() => {});

        setSyncStatus((prev) => ({
          ...prev,
          lastRemoteCommand: {
            type: cmd.type,
            sender: cmd.sender,
            status: success ? 'completed' : 'failed',
            timestamp: Date.now(),
            error: errorMessage,
          },
        }));

        return success;
      } catch (err: any) {
        if (socket && socket.connected) {
          socket.emit('robot:command:failed', {
            commandId: cmd.commandId,
            type: cmd.type,
            error: err.message,
          });
        }
        return false;
      }
    },
    [username]
  );

  // Broadcast state to Socket.IO with throttling
  const broadcastAuthoritativeState = useCallback(
    (forceImmediate: boolean = false) => {
      const socket = getSocket(null, 'host', username);
      const isMoving = useDobotStore.getState().isMoving;

      const now = performance.now();
      const timeSinceLast = now - lastBroadcastTimeRef.current;

      if (!forceImmediate && isMoving && timeSinceLast < 60) {
        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(() => {
            throttleTimeoutRef.current = null;
            broadcastAuthoritativeState(false);
          }, 60 - timeSinceLast);
        }
        return;
      }

      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }

      lastBroadcastTimeRef.current = now;
      const payload = compileStatePayload();

      if (socket && socket.connected) {
        socket.emit('robot:state:update', payload);
      }

      // Also sync state to serverless API relay
      fetch('/api/realtime/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHost: true, state: payload }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.pendingCommands && Array.isArray(data.pendingCommands)) {
            for (const cmd of data.pendingCommands) {
              executeCommand(cmd);
            }
          }
          if (data?.state?.controllerConnected !== undefined) {
            setSyncStatus((prev) => ({
              ...prev,
              controllerConnected: data.state.controllerConnected,
              isConnected: true,
            }));
          }
        })
        .catch(() => {});
    },
    [compileStatePayload, executeCommand, username]
  );

  // Subscribe to Dobot store changes to broadcast updates
  useEffect(() => {
    let prevCartesian = useDobotStore.getState().cartesian;
    let prevMoving = useDobotStore.getState().isMoving;

    const unsub = useDobotStore.subscribe((state) => {
      const posChanged =
        Math.abs(state.cartesian.x - prevCartesian.x) > 0.05 ||
        Math.abs(state.cartesian.y - prevCartesian.y) > 0.05 ||
        Math.abs(state.cartesian.z - prevCartesian.z) > 0.05 ||
        Math.abs(state.cartesian.r - prevCartesian.r) > 0.05;

      const movingChanged = state.isMoving !== prevMoving;

      if (posChanged || movingChanged) {
        prevCartesian = state.cartesian;
        prevMoving = state.isMoving;
        broadcastAuthoritativeState(!state.isMoving);
      }
    });

    return () => unsub();
  }, [broadcastAuthoritativeState]);

  // Main Socket Connection & Periodic Serverless Heartbeat
  useEffect(() => {
    const socket = getSocket(null, 'host', username);

    const handleConnect = () => {
      console.log('[HOST SYNC] Connected to Realtime Backend as Host');
      setSyncStatus((prev) => ({
        ...prev,
        isConnected: true,
        reconnectCount: prev.reconnectCount + 1,
      }));
      broadcastAuthoritativeState(true);
    };

    const handleDisconnect = () => {
      console.log('[HOST SYNC] Disconnected from Realtime Backend');
      setSyncStatus((prev) => ({ ...prev, isConnected: false }));
    };

    const handleUserConnected = (data: { role: string; username: string; controllerConnected: boolean }) => {
      if (data.role === 'controller' || data.controllerConnected) {
        setSyncStatus((prev) => ({
          ...prev,
          controllerConnected: true,
          controllerUsername: data.username || 'test',
        }));
        broadcastAuthoritativeState(true);
      }
    };

    const handleUserDisconnected = (data: { role: string; controllerConnected: boolean }) => {
      if (data.role === 'controller' || !data.controllerConnected) {
        setSyncStatus((prev) => ({
          ...prev,
          controllerConnected: false,
          controllerUsername: null,
        }));
      }
    };

    const handleSessionState = (data: any) => {
      if (data?.controllerConnected !== undefined) {
        setSyncStatus((prev) => ({
          ...prev,
          controllerConnected: data.controllerConnected,
        }));
      }
    };

    const handleEmergencyStop = () => {
      useDobotStore.getState().setEmergencyStopped(true);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('user:connected', handleUserConnected);
    socket.on('user:disconnected', handleUserDisconnected);
    socket.on('session:state', handleSessionState);
    socket.on('robot:emergency-stop', handleEmergencyStop);
    socket.on('robot:command', executeCommand);

    if (socket.connected) {
      handleConnect();
    }

    // Serverless fallback periodic sync loop (every 500ms)
    // Ensures Host presence is recognized on Vercel even without WebSocket
    const heartbeatTimer = setInterval(() => {
      broadcastAuthoritativeState(false);
    }, 500);

    return () => {
      clearInterval(heartbeatTimer);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user:connected', handleUserConnected);
      socket.off('user:disconnected', handleUserDisconnected);
      socket.off('session:state', handleSessionState);
      socket.off('robot:emergency-stop', handleEmergencyStop);
      socket.off('robot:command', executeCommand);
    };
  }, [username, broadcastAuthoritativeState, executeCommand]);

  return syncStatus;
}
