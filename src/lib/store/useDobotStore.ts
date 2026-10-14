import { create } from 'zustand';
import {
  CartesianPose,
  JointAngles,
  forwardKinematics,
  inverseKinematics,
  HOME_JOINTS,
  areJointsWithinLimits,
  ROBOT_LIMITS,
} from '../kinematics';
import { PlacedObjectInstance, OBJECT_REGISTRY } from '../objects/types';

export interface TeachingPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  r: number;
  suction: 'none' | 'on' | 'off';
}

export type EndEffectorType = 'suction' | 'gripper' | 'laser';
export type TabType = 'operation' | 'objects' | 'teaching' | 'blockly' | 'draw' | 'laser' | 'print' | 'leap';
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

interface DobotState {
  // Navigation & UI
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  // Robot State
  joints: JointAngles;
  cartesian: CartesianPose;
  speed: number; // 1 to 100 (%)
  setSpeed: (speed: number) => void;
  isEmergencyStopped: boolean;
  setEmergencyStopped: (stopped: boolean) => void;
  endEffectorType: EndEffectorType;
  setEndEffectorType: (type: EndEffectorType) => void;
  endEffectorActive: boolean;
  setEndEffectorActive: (active: boolean) => void;

  // Warning & Feedback banners
  jogWarning: string | null;
  setJogWarning: (warning: string | null) => void;
  suctionHint: string | null;
  setSuctionHint: (hint: string | null) => void;

  // Visualization
  showReachDome: boolean;
  setShowReachDome: (show: boolean) => void;
  showTrajectory: boolean;
  setShowTrajectory: (show: boolean) => void;
  trajectoryPoints: [number, number, number][];
  addTrajectoryPoint: (pt: [number, number, number]) => void;
  clearTrajectory: () => void;

  // Jogging Actions
  jogJoint: (joint: keyof JointAngles, delta: number) => boolean;
  jogCartesian: (axis: keyof CartesianPose, delta: number) => boolean;
  setJointsDirect: (joints: JointAngles) => void;
  homeRobot: () => void;

  // Object Placement & Management
  objects: PlacedObjectInstance[];
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  ghostPlacementType: string | null;
  setGhostPlacementType: (type: string | null) => void;
  ghostPosition: [number, number, number] | null;
  ghostValid: boolean;
  ghostError: string | null;
  setGhostState: (pos: [number, number, number] | null, valid: boolean, error: string | null) => void;
  confirmGhostPlacement: () => boolean;
  cancelGhostPlacement: () => void;
  deleteObject: (id: string) => void;
  updateObjectPosition: (id: string, pos: [number, number, number]) => void;

  // Teaching & Playback
  teachingPoints: TeachingPoint[];
  playbackState: PlaybackState;
  currentPlaybackIndex: number;
  addTeachingPoint: (pt: Omit<TeachingPoint, 'id'>) => void;
  updateTeachingPoint: (id: string, pt: Partial<TeachingPoint>) => void;
  deleteTeachingPoint: (id: string) => void;
  reorderTeachingPoints: (fromIndex: number, toIndex: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setCurrentPlaybackIndex: (index: number) => void;

  // Local Storage & Export
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
  exportToJson: () => string;
  importFromJson: (json: string) => boolean;
}

const initialCartesian = forwardKinematics(
  HOME_JOINTS.j1,
  HOME_JOINTS.j2,
  HOME_JOINTS.j3,
  HOME_JOINTS.j4
);

// Default initial objects for instant demo
const DEFAULT_OBJECTS: PlacedObjectInstance[] = [
  {
    id: 'scale-default-1',
    typeId: 'scale',
    name: 'Weighing Scale',
    position: [240, -100, 0],
    rotationY: 0,
    attachedToTool: false,
  },
  {
    id: 'box-default-1',
    typeId: 'box',
    name: 'Cube Block A',
    position: [240, 100, 0],
    rotationY: 0,
    attachedToTool: false,
  },
];

export const useDobotStore = create<DobotState>((set, get) => ({
  activeTab: 'operation',
  setActiveTab: (tab) => set({ activeTab: tab }),

  joints: { ...HOME_JOINTS },
  cartesian: { ...initialCartesian },
  speed: 50,
  setSpeed: (speed) => set({ speed: Math.max(5, Math.min(100, speed)) }),

  isEmergencyStopped: false,
  setEmergencyStopped: (stopped) => {
    if (stopped) {
      set({
        isEmergencyStopped: true,
        playbackState: 'stopped',
        jogWarning: 'EMERGENCY STOP ACTIVATED! Robot motion halted.',
      });
    } else {
      set({
        isEmergencyStopped: false,
        jogWarning: null,
      });
    }
  },

  endEffectorType: 'suction',
  setEndEffectorType: (type) => set({ endEffectorType: type }),

  endEffectorActive: false,
  setEndEffectorActive: (active) => {
    const state = get();
    const { cartesian, objects, endEffectorType } = state;

    if (!active) {
      // Detach any attached object and drop with gravity to resting surface
      const updatedObjects = objects.map((obj) => {
        if (!obj.attachedToTool) return obj;

        // Calculate surface drop level: check if resting on another object
        const def = OBJECT_REGISTRY[obj.typeId];
        let dropZ = 0; // table surface default

        for (const other of objects) {
          if (other.id === obj.id || other.attachedToTool) continue;
          const otherDef = OBJECT_REGISTRY[other.typeId];
          const dx = Math.abs(obj.position[0] - other.position[0]);
          const dy = Math.abs(obj.position[1] - other.position[1]);
          if (
            dx <= (otherDef.dimensions.width + def.dimensions.width) / 2 &&
            dy <= (otherDef.dimensions.depth + def.dimensions.depth) / 2
          ) {
            dropZ = Math.max(dropZ, other.position[2] + otherDef.dimensions.height);
          }
        }

        return {
          ...obj,
          attachedToTool: false,
          position: [obj.position[0], obj.position[1], dropZ] as [number, number, number],
          attachedRelativeOffset: undefined,
        };
      });

      set({
        endEffectorActive: false,
        objects: updatedObjects,
        suctionHint: endEffectorType === 'suction' ? 'Suction turned OFF (Object released)' : null,
      });
      return;
    }

    // Suction turned ON: Attempt to pick up an object within tolerance
    if (endEffectorType === 'suction') {
      let attachedObjId: string | null = null;
      const updatedObjects = objects.map((obj) => {
        if (obj.attachedToTool) return obj;
        const def = OBJECT_REGISTRY[obj.typeId];
        const topCenter = [
          obj.position[0],
          obj.position[1],
          obj.position[2] + def.dimensions.height,
        ];

        const horizontalDist = Math.hypot(
          cartesian.x - topCenter[0],
          cartesian.y - topCenter[1]
        );
        const verticalDiff = Math.abs(cartesian.z - topCenter[2]);

        // Tolerance: horizontal <= 25mm, vertical <= 16mm
        if (horizontalDist <= 25 && verticalDiff <= 16 && !attachedObjId) {
          attachedObjId = obj.id;
          return {
            ...obj,
            attachedToTool: true,
            attachedRelativeOffset: [
              obj.position[0] - cartesian.x,
              obj.position[1] - cartesian.y,
              obj.position[2] - cartesian.z,
            ] as [number, number, number],
          };
        }
        return obj;
      });

      if (attachedObjId) {
        const attachedName = objects.find((o) => o.id === attachedObjId)?.name;
        set({
          endEffectorActive: true,
          objects: updatedObjects,
          suctionHint: `Suction ON: Attached to ${attachedName}`,
        });
      } else {
        set({
          endEffectorActive: true,
          suctionHint: 'Suction ON: No object in pickup range',
        });
      }
    } else {
      set({
        endEffectorActive: true,
        suctionHint: `${endEffectorType.toUpperCase()} turned ON`,
      });
    }
  },

  jogWarning: null,
  setJogWarning: (warning) => set({ jogWarning: warning }),

  suctionHint: null,
  setSuctionHint: (hint) => set({ suctionHint: hint }),

  showReachDome: false,
  setShowReachDome: (show) => set({ showReachDome: show }),

  showTrajectory: true,
  setShowTrajectory: (show) => set({ showTrajectory: show }),

  trajectoryPoints: [[initialCartesian.x, initialCartesian.y, initialCartesian.z]],
  addTrajectoryPoint: (pt) => {
    const list = get().trajectoryPoints;
    const last = list[list.length - 1];
    if (
      !last ||
      Math.hypot(pt[0] - last[0], pt[1] - last[1], pt[2] - last[2]) > 3
    ) {
      set({ trajectoryPoints: [...list.slice(-300), pt] });
    }
  },
  clearTrajectory: () => set({ trajectoryPoints: [] }),

  jogJoint: (joint, delta) => {
    const { joints, isEmergencyStopped, objects, endEffectorActive } = get();
    if (isEmergencyStopped) {
      set({ jogWarning: 'Robot is halted by Emergency Stop! Release E-Stop first.' });
      return false;
    }

    const newJoints = { ...joints, [joint]: joints[joint] + delta };
    const limits = ROBOT_LIMITS[joint];

    if (newJoints[joint] < limits[0] || newJoints[joint] > limits[1]) {
      set({
        jogWarning: `Joint limit reached: ${joint.toUpperCase()} limit is [${limits[0]}°, ${limits[1]}°]`,
      });
      return false;
    }

    const newPose = forwardKinematics(
      newJoints.j1,
      newJoints.j2,
      newJoints.j3,
      newJoints.j4
    );

    // Update attached objects if any
    let updatedObjects = objects;
    if (endEffectorActive) {
      updatedObjects = objects.map((obj) => {
        if (!obj.attachedToTool || !obj.attachedRelativeOffset) return obj;
        return {
          ...obj,
          position: [
            newPose.x + obj.attachedRelativeOffset[0],
            newPose.y + obj.attachedRelativeOffset[1],
            newPose.z + obj.attachedRelativeOffset[2],
          ],
        };
      });
    }

    set({
      joints: newJoints,
      cartesian: newPose,
      jogWarning: null,
      objects: updatedObjects,
    });
    get().addTrajectoryPoint([newPose.x, newPose.y, newPose.z]);
    return true;
  },

  jogCartesian: (axis, delta) => {
    const { cartesian, isEmergencyStopped, objects, endEffectorActive } = get();
    if (isEmergencyStopped) {
      set({ jogWarning: 'Robot is halted by Emergency Stop! Release E-Stop first.' });
      return false;
    }

    const targetPose = { ...cartesian, [axis]: cartesian[axis] + delta };
    const solvedJoints = inverseKinematics(
      targetPose.x,
      targetPose.y,
      targetPose.z,
      targetPose.r
    );

    if (!solvedJoints) {
      set({
        jogWarning: `Cannot jog ${axis.toUpperCase()}: Position is outside reachable workspace or violates joint limits.`,
      });
      return false;
    }

    // Verify limit safety
    if (!areJointsWithinLimits(solvedJoints)) {
      set({
        jogWarning: `Cannot jog ${axis.toUpperCase()}: Resulting joint angles exceed physical limits.`,
      });
      return false;
    }

    // Recalculate true pose from solved joints
    const truePose = forwardKinematics(
      solvedJoints.j1,
      solvedJoints.j2,
      solvedJoints.j3,
      solvedJoints.j4
    );

    let updatedObjects = objects;
    if (endEffectorActive) {
      updatedObjects = objects.map((obj) => {
        if (!obj.attachedToTool || !obj.attachedRelativeOffset) return obj;
        return {
          ...obj,
          position: [
            truePose.x + obj.attachedRelativeOffset[0],
            truePose.y + obj.attachedRelativeOffset[1],
            truePose.z + obj.attachedRelativeOffset[2],
          ],
        };
      });
    }

    set({
      joints: solvedJoints,
      cartesian: truePose,
      jogWarning: null,
      objects: updatedObjects,
    });
    get().addTrajectoryPoint([truePose.x, truePose.y, truePose.z]);
    return true;
  },

  setJointsDirect: (newJoints) => {
    const pose = forwardKinematics(
      newJoints.j1,
      newJoints.j2,
      newJoints.j3,
      newJoints.j4
    );
    const { objects, endEffectorActive } = get();

    let updatedObjects = objects;
    if (endEffectorActive) {
      updatedObjects = objects.map((obj) => {
        if (!obj.attachedToTool || !obj.attachedRelativeOffset) return obj;
        return {
          ...obj,
          position: [
            pose.x + obj.attachedRelativeOffset[0],
            pose.y + obj.attachedRelativeOffset[1],
            pose.z + obj.attachedRelativeOffset[2],
          ],
        };
      });
    }

    set({
      joints: newJoints,
      cartesian: pose,
      objects: updatedObjects,
    });
    get().addTrajectoryPoint([pose.x, pose.y, pose.z]);
  },

  homeRobot: () => {
    const { isEmergencyStopped } = get();
    if (isEmergencyStopped) {
      set({ jogWarning: 'Cannot home: Emergency Stop is active!' });
      return;
    }
    const pose = forwardKinematics(
      HOME_JOINTS.j1,
      HOME_JOINTS.j2,
      HOME_JOINTS.j3,
      HOME_JOINTS.j4
    );
    set({
      joints: { ...HOME_JOINTS },
      cartesian: pose,
      jogWarning: null,
    });
    get().addTrajectoryPoint([pose.x, pose.y, pose.z]);
  },

  // Object Placement
  objects: DEFAULT_OBJECTS,
  selectedObjectId: 'box-default-1',
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),

  ghostPlacementType: null,
  setGhostPlacementType: (type) =>
    set({
      ghostPlacementType: type,
      ghostPosition: null,
      ghostValid: false,
      ghostError: null,
    }),

  ghostPosition: null,
  ghostValid: false,
  ghostError: null,
  setGhostState: (pos, valid, error) =>
    set({
      ghostPosition: pos,
      ghostValid: valid,
      ghostError: error,
    }),

  confirmGhostPlacement: () => {
    const { ghostPlacementType, ghostPosition, ghostValid, objects } = get();
    if (!ghostPlacementType || !ghostPosition || !ghostValid) {
      return false;
    }

    const def = OBJECT_REGISTRY[ghostPlacementType];
    const newId = `${ghostPlacementType}-${Date.now()}`;
    const newObj: PlacedObjectInstance = {
      id: newId,
      typeId: ghostPlacementType,
      name: `${def.name} #${objects.length + 1}`,
      position: [...ghostPosition],
      rotationY: 0,
      attachedToTool: false,
    };

    set({
      objects: [...objects, newObj],
      selectedObjectId: newId,
      ghostPlacementType: null,
      ghostPosition: null,
      ghostValid: false,
      ghostError: null,
    });
    return true;
  },

  cancelGhostPlacement: () =>
    set({
      ghostPlacementType: null,
      ghostPosition: null,
      ghostValid: false,
      ghostError: null,
    }),

  deleteObject: (id) => {
    const { objects, selectedObjectId } = get();
    set({
      objects: objects.filter((o) => o.id !== id),
      selectedObjectId: selectedObjectId === id ? null : selectedObjectId,
    });
  },

  updateObjectPosition: (id, pos) => {
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, position: pos } : o
      ),
    }));
  },

  // Teaching & Playback
  teachingPoints: [
    {
      id: 'tp-1',
      name: 'Home Standby',
      x: 250,
      y: 0,
      z: 100,
      r: 0,
      suction: 'off',
    },
    {
      id: 'tp-2',
      name: 'Above Box',
      x: 240,
      y: 100,
      z: 70,
      r: 0,
      suction: 'off',
    },
    {
      id: 'tp-3',
      name: 'Pick Box (Contact)',
      x: 240,
      y: 100,
      z: 35,
      r: 0,
      suction: 'on',
    },
    {
      id: 'tp-4',
      name: 'Lift Up with Box',
      x: 240,
      y: 100,
      z: 110,
      r: 0,
      suction: 'none',
    },
    {
      id: 'tp-5',
      name: 'Above Scale',
      x: 240,
      y: -100,
      z: 110,
      r: 0,
      suction: 'none',
    },
    {
      id: 'tp-6',
      name: 'Place on Scale',
      x: 240,
      y: -100,
      z: 53,
      r: 0,
      suction: 'off',
    },
    {
      id: 'tp-7',
      name: 'Retract Up',
      x: 240,
      y: -100,
      z: 110,
      r: 0,
      suction: 'none',
    },
    {
      id: 'tp-8',
      name: 'Return Home',
      x: 250,
      y: 0,
      z: 100,
      r: 0,
      suction: 'none',
    },
  ],
  playbackState: 'idle',
  currentPlaybackIndex: -1,

  addTeachingPoint: (pt) => {
    const newPt: TeachingPoint = {
      ...pt,
      id: `tp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    set((state) => ({ teachingPoints: [...state.teachingPoints, newPt] }));
  },

  updateTeachingPoint: (id, updates) => {
    set((state) => ({
      teachingPoints: state.teachingPoints.map((tp) =>
        tp.id === id ? { ...tp, ...updates } : tp
      ),
    }));
  },

  deleteTeachingPoint: (id) => {
    set((state) => ({
      teachingPoints: state.teachingPoints.filter((tp) => tp.id !== id),
    }));
  },

  reorderTeachingPoints: (fromIndex, toIndex) => {
    set((state) => {
      const list = [...state.teachingPoints];
      const [removed] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, removed);
      return { teachingPoints: list };
    });
  },

  setPlaybackState: (state) => set({ playbackState: state }),
  setCurrentPlaybackIndex: (index) => set({ currentPlaybackIndex: index }),

  // Persistence
  saveToLocalStorage: () => {
    try {
      const data = {
        teachingPoints: get().teachingPoints,
        objects: get().objects,
      };
      localStorage.setItem('dobot_simulator_data', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  },

  loadFromLocalStorage: () => {
    try {
      const raw = localStorage.getItem('dobot_simulator_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.teachingPoints) && Array.isArray(parsed.objects)) {
          set({
            teachingPoints: parsed.teachingPoints,
            objects: parsed.objects,
          });
        }
      }
    } catch (e) {
      console.error('Failed to load from localStorage', e);
    }
  },

  exportToJson: () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      teachingPoints: get().teachingPoints,
      objects: get().objects,
      cartesian: get().cartesian,
      joints: get().joints,
    };
    return JSON.stringify(data, null, 2);
  },

  importFromJson: (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.teachingPoints)) {
        set({
          teachingPoints: parsed.teachingPoints,
          ...(Array.isArray(parsed.objects) ? { objects: parsed.objects } : {}),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
