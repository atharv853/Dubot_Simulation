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

  const {
    cartesian,
    joints,
    speed,
    isMoving,
    isEmergencyStopped,
    endEffectorType,
    endEffectorActive,
    objects,
    moveToCartesianTarget,
    jogCartesian,
    jogJoint,
    setSpeed,
    setEndEffectorType,
    setEndEffectorActive,
    executeCustomPickAndPlace,
    pickNearestObject,
    releaseObject,
    setEmergencyStopped,
    resetAll,
    homeRobot,
  } = useDobotStore();

  // Helper to compile authoritative state payload
  const compileStatePayload = useCallback((): RobotStatePayload => {
    const attachedObj = objects.find((o) => o.attachedToTool);
    return {
      sessionId: DEFAULT_SESSION_ID,
      x: Number(cartesian.x.toFixed(2)),
      y: Number(cartesian.y.toFixed(2)),
      z: Number(cartesian.z.toFixed(2)),
      r: Number(cartesian.r.toFixed(2)),
      joints: {
        j1: Number(joints.j1.toFixed(2)),
        j2: Number(joints.j2.toFixed(2)),
        j3: Number(joints.j3.toFixed(2)),
        j4: Number(joints.j4.toFixed(2)),
      },
      velocity: speed,
      robotStatus: isEmergencyStopped ? 'stopped' : isMoving ? 'moving' : 'idle',
      activeTool: endEffectorType,
      suctionEnabled: endEffectorActive,
      attachedObjectName: attachedObj ? attachedObj.name : null,
      hostConnected: true,
      controllerConnected: syncStatus.controllerConnected,
      lastCommandId: null,
      stateVersion: stateVersionRef.current++,
      isEmergencyStopped,
    };
  }, [
    cartesian,
    joints,
    speed,
    isMoving,
    isEmergencyStopped,
    endEffectorType,
    endEffectorActive,
    objects,
    syncStatus.controllerConnected,
  ]);

  // Broadcast state to Socket.IO with throttling during continuous motion
  const broadcastAuthoritativeState = useCallback(
    (forceImmediate: boolean = false) => {
      const socket = getSocket(null, 'host', username);
      if (!socket || !socket.connected) return;

      const now = performance.now();
      const timeSinceLast = now - lastBroadcastTimeRef.current;

      // If moving and not forced, throttle to ~60ms intervals (approx 16 updates/sec)
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
      socket.emit('robot:state:update', payload);
    },
    [compileStatePayload, isMoving, username]
  );

  // Trigger state broadcast when relevant robot attributes change
  useEffect(() => {
    // Exact immediate broadcast when motion stops, tool changes, or e-stop triggers
    const isImmediate = !isMoving || isEmergencyStopped;
    broadcastAuthoritativeState(isImmediate);
  }, [
    cartesian.x,
    cartesian.y,
    cartesian.z,
    cartesian.r,
    speed,
    isMoving,
    isEmergencyStopped,
    endEffectorType,
    endEffectorActive,
    broadcastAuthoritativeState,
  ]);

  // Main Socket Connection & Remote Command Execution Loop
  useEffect(() => {
    const socket = getSocket(null, 'host', username);

    const handleConnect = () => {
      console.log('[HOST SYNC] Connected to Realtime Backend as Host');
      setSyncStatus((prev) => ({
        ...prev,
        isConnected: true,
        reconnectCount: prev.reconnectCount + 1,
      }));
      // Immediately announce current state on connect
      setTimeout(() => broadcastAuthoritativeState(true), 100);
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
        // Send fresh state so controller immediately sees current position
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
      setEmergencyStopped(true);
      setSyncStatus((prev) => ({
        ...prev,
        lastRemoteCommand: {
          type: 'EMERGENCY_STOP',
          sender: 'remote',
          status: 'completed',
          timestamp: Date.now(),
        },
      }));
    };

    // -----------------------------------------------------------------
    // Remote Command Dispatcher -> Executes ACTUAL Dobot Functions
    // -----------------------------------------------------------------
    const handleRemoteCommand = async (cmd: RobotCommand) => {
      if (!cmd || !cmd.commandId) return;

      // Ignore local host commands or duplicates
      if (processedCommandsRef.current.has(cmd.commandId)) return;
      processedCommandsRef.current.add(cmd.commandId);

      // Keep cache small
      if (processedCommandsRef.current.size > 200) {
        const arr = Array.from(processedCommandsRef.current);
        processedCommandsRef.current = new Set(arr.slice(arr.length - 100));
      }

      console.log(`[HOST SYNC] Received remote command from ${cmd.sender}:`, cmd.type, cmd.payload);

      setSyncStatus((prev) => ({
        ...prev,
        lastRemoteCommand: {
          type: cmd.type,
          sender: cmd.sender,
          status: 'received',
          timestamp: Date.now(),
        },
      }));

      // Notify server and controller that execution has started
      socket.emit('robot:command:started', {
        commandId: cmd.commandId,
        type: cmd.type,
        isCycle: cmd.type === 'PICK_AND_PLACE',
        step: cmd.type === 'PICK_AND_PLACE' ? 'Starting autonomous pick & place' : undefined,
      });

      try {
        let success = false;
        let errorMessage: string | undefined;

        switch (cmd.type) {
          case 'MOVE_TO': {
            const { x, y, z, r, durationSec } = cmd.payload || {};
            success = await moveToCartesianTarget({ x, y, z, r }, durationSec);
            if (!success) {
              errorMessage = useDobotStore.getState().jogWarning || 'Movement unreachable or blocked';
            }
            break;
          }

          case 'JOG_AXIS': {
            const { axis, delta } = cmd.payload;
            success = jogCartesian(axis, delta);
            if (!success) {
              errorMessage = useDobotStore.getState().jogWarning || `Cannot jog axis ${axis}`;
            }
            break;
          }

          case 'JOG_JOINT': {
            const { joint, delta } = cmd.payload;
            success = jogJoint(joint, delta);
            if (!success) {
              errorMessage = useDobotStore.getState().jogWarning || `Cannot jog joint ${joint}`;
            }
            break;
          }

          case 'SET_SPEED': {
            const targetSpeed = Number(cmd.payload?.speed);
            if (!isNaN(targetSpeed)) {
              setSpeed(targetSpeed);
              success = true;
            }
            break;
          }

          case 'SET_TOOL': {
            setEndEffectorType(cmd.payload.tool);
            success = true;
            break;
          }

          case 'SET_SUCTION': {
            setEndEffectorActive(Boolean(cmd.payload.active));
            success = true;
            break;
          }

          case 'PICK_AND_PLACE': {
            const { source, destination, safeZ } = cmd.payload;
            success = await executeCustomPickAndPlace(source, destination, safeZ || 100, (stepName) => {
              socket.emit('robot:command:started', {
                commandId: cmd.commandId,
                type: cmd.type,
                isCycle: true,
                step: stepName,
              });
            });
            if (!success) {
              errorMessage = useDobotStore.getState().jogWarning || 'Autonomous pick & place cycle failed';
            }
            break;
          }

          case 'PICK_ONLY': {
            success = await pickNearestObject();
            if (!success) errorMessage = 'Pick operation failed (no reachable block)';
            break;
          }

          case 'PLACE_ONLY': {
            releaseObject();
            success = true;
            break;
          }

          case 'EMERGENCY_STOP': {
            setEmergencyStopped(true);
            success = true;
            break;
          }

          case 'RESET': {
            resetAll();
            success = true;
            break;
          }

          case 'HOME': {
            homeRobot();
            success = true;
            break;
          }

          default:
            errorMessage = `Unknown command type: ${(cmd as any).type}`;
            success = false;
        }

        if (success) {
          socket.emit('robot:command:completed', {
            commandId: cmd.commandId,
            type: cmd.type,
            step: 'Completed successfully',
          });
          setSyncStatus((prev) => ({
            ...prev,
            lastRemoteCommand: {
              type: cmd.type,
              sender: cmd.sender,
              status: 'completed',
              timestamp: Date.now(),
            },
          }));
        } else {
          socket.emit('robot:command:failed', {
            commandId: cmd.commandId,
            type: cmd.type,
            error: errorMessage || 'Operation failed',
          });
          setSyncStatus((prev) => ({
            ...prev,
            lastRemoteCommand: {
              type: cmd.type,
              sender: cmd.sender,
              status: 'failed',
              timestamp: Date.now(),
              error: errorMessage,
            },
          }));
        }

        // Send exact state update after command finishes
        broadcastAuthoritativeState(true);
      } catch (err: any) {
        console.error('[HOST SYNC] Error executing remote command:', err);
        socket.emit('robot:command:failed', {
          commandId: cmd.commandId,
          type: cmd.type,
          error: err.message || 'Execution error on host simulator',
        });
        setSyncStatus((prev) => ({
          ...prev,
          lastRemoteCommand: {
            type: cmd.type,
            sender: cmd.sender,
            status: 'failed',
            timestamp: Date.now(),
            error: err.message,
          },
        }));
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('user:connected', handleUserConnected);
    socket.on('user:disconnected', handleUserDisconnected);
    socket.on('session:state', handleSessionState);
    socket.on('robot:emergency-stop', handleEmergencyStop);
    socket.on('robot:command', handleRemoteCommand);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user:connected', handleUserConnected);
      socket.off('user:disconnected', handleUserDisconnected);
      socket.off('session:state', handleSessionState);
      socket.off('robot:emergency-stop', handleEmergencyStop);
      socket.off('robot:command', handleRemoteCommand);
    };
  }, [
    username,
    broadcastAuthoritativeState,
    moveToCartesianTarget,
    jogCartesian,
    jogJoint,
    setSpeed,
    setEndEffectorType,
    setEndEffectorActive,
    executeCustomPickAndPlace,
    pickNearestObject,
    releaseObject,
    setEmergencyStopped,
    resetAll,
    homeRobot,
  ]);

  return syncStatus;
}
