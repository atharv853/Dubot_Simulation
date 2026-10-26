import { CartesianPose, JointAngles } from '../kinematics/types';
import { EndEffectorType } from '../store/useDobotStore';

export type UserRole = 'host' | 'controller';

export interface UserSession {
  username: string;
  role: UserRole;
  sessionId: string;
}

export type RobotStatus = 'idle' | 'moving' | 'executing' | 'error' | 'stopped';

export type CommandType =
  | 'MOVE_TO'
  | 'JOG_AXIS'
  | 'JOG_JOINT'
  | 'SET_SPEED'
  | 'SET_TOOL'
  | 'SET_SUCTION'
  | 'PICK_AND_PLACE'
  | 'PICK_ONLY'
  | 'PLACE_ONLY'
  | 'EMERGENCY_STOP'
  | 'RESET'
  | 'HOME';

export interface MoveToPayload {
  x?: number;
  y?: number;
  z?: number;
  r?: number;
  durationSec?: number;
}

export interface JogAxisPayload {
  axis: keyof CartesianPose;
  delta: number;
}

export interface JogJointPayload {
  joint: keyof JointAngles;
  delta: number;
}

export interface SetSpeedPayload {
  speed: number;
}

export interface SetToolPayload {
  tool: EndEffectorType;
}

export interface SetSuctionPayload {
  active: boolean;
}

export interface PickAndPlacePayload {
  source: { x: number; y: number; z: number; r?: number };
  destination: { x: number; y: number; z: number; r?: number };
  safeZ?: number;
}

export interface RobotCommand<T = any> {
  commandId: string;
  sessionId: string;
  type: CommandType;
  payload: T;
  timestamp: number;
  sender: string;
}

export interface CommandAck {
  commandId: string;
  status: 'accepted' | 'rejected';
  reason?: string;
  timestamp: number;
}

export interface CommandProgress {
  commandId: string;
  status: 'started' | 'executing' | 'completed' | 'failed';
  step?: string;
  error?: string;
  timestamp: number;
}

export interface RobotStatePayload {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  r: number;
  joints: JointAngles;
  velocity: number;
  robotStatus: RobotStatus;
  activeTool: EndEffectorType;
  suctionEnabled: boolean;
  attachedObjectName: string | null;
  hostConnected: boolean;
  controllerConnected: boolean;
  lastCommandId: string | null;
  lastCommandResult?: {
    commandId: string;
    type: CommandType;
    status: 'completed' | 'failed';
    error?: string;
    timestamp: number;
  };
  stateVersion: number;
  cycleStatus?: string | null;
  isEmergencyStopped: boolean;
}

export const DEFAULT_SESSION_ID = 'dobot-main';
