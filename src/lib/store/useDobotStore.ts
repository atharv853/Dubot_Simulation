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
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;

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
  isMoving: boolean;
  setIsMoving: (moving: boolean) => void;
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

  // Motion Actions
  jogJoint: (joint: keyof JointAngles, delta: number) => boolean;
  jogCartesian: (axis: keyof CartesianPose, delta: number) => boolean;
  setJointsDirect: (joints: JointAngles) => void;
  moveToCartesianTarget: (target: Partial<CartesianPose>, durationSec?: number) => Promise<boolean>;
  moveToJointTarget: (target: Partial<JointAngles>, durationSec?: number) => Promise<boolean>;
  homeRobot: () => void;
  resetAll: () => void;
  pickNearestObject: () => Promise<boolean>;
  releaseObject: () => void;
  executeCustomPickAndPlace: (
    source: { x: number; y: number; z: number; r: number },
    destination: { x: number; y: number; z: number; r: number },
    safeZ?: number,
    onStepChange?: (stepName: string) => void
  ) => Promise<boolean>;

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
  autoArrangeObjects: () => void;

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

const DEFAULT_TEACHING_POINTS: TeachingPoint[] = [
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
    z: 75,
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
];

// Helper to check and latch unattached object if suction cup is active and close
function checkSuctionLatching(
  pose: CartesianPose,
  objects: PlacedObjectInstance[],
  endEffectorType: EndEffectorType,
  endEffectorActive: boolean
): { updatedObjects: PlacedObjectInstance[]; attachedName: string | null } {
  if (endEffectorType !== 'suction' || !endEffectorActive) {
    return { updatedObjects: objects, attachedName: null };
  }

  // If already holding an object, keep it attached
  const alreadyAttached = objects.some((o) => o.attachedToTool);
  if (alreadyAttached) {
    return { updatedObjects: objects, attachedName: null };
  }

  let attachedName: string | null = null;
  const updated = objects.map((obj) => {
    if (obj.attachedToTool) return obj;
    const def = OBJECT_REGISTRY[obj.typeId];
    if (!def) return obj;

    const topCenter = [
      obj.position[0],
      obj.position[1],
      obj.position[2] + def.dimensions.height,
    ];

    const horizDist = Math.hypot(pose.x - topCenter[0], pose.y - topCenter[1]);
    const vertDiff = Math.abs(pose.z - topCenter[2]);

    // Generous pickup zone: <= 32mm horizontal, <= 22mm vertical
    if (horizDist <= 32 && vertDiff <= 22 && !attachedName) {
      attachedName = obj.name;
      return {
        ...obj,
        attachedToTool: true,
        attachedRelativeOffset: [
          obj.position[0] - pose.x,
          obj.position[1] - pose.y,
          obj.position[2] - pose.z,
        ] as [number, number, number],
      };
    }
    return obj;
  });

  return { updatedObjects: updated, attachedName };
}

// Helper to compute physical collision boundary (floor/table + top surfaces of obstacles)
export function getMinSafeZ(
  x: number,
  y: number,
  objects: PlacedObjectInstance[]
): { minZ: number; obstacleName: string } {
  // Check if tool is holding an object
  const heldObject = objects.find((o) => o.attachedToTool);
  const heldDef = heldObject ? OBJECT_REGISTRY[heldObject.typeId] : null;
  const heldExtraHeight = heldDef ? heldDef.dimensions.height : 0;

  // Physical radius of suction cup (15mm silicone bell) or held workpiece
  const toolRadius = 16;
  const effectiveRadius = heldDef
    ? Math.max(toolRadius, heldDef.dimensions.width / 2 + 1, heldDef.dimensions.depth / 2 + 1)
    : toolRadius;

  // Floor clearance above table
  let minZ = heldExtraHeight;
  let obstacleName = 'Table Surface';

  for (const obj of objects) {
    if (obj.attachedToTool) continue;
    const def = OBJECT_REGISTRY[obj.typeId];
    if (!def) continue;

    // Object horizontal footprint accounting for suction cup width + obstacle width
    const halfW = def.dimensions.width / 2 + effectiveRadius;
    const halfD = def.dimensions.depth / 2 + effectiveRadius;
    const dx = Math.abs(x - obj.position[0]);
    const dy = Math.abs(y - obj.position[1]);

    if (dx <= halfW && dy <= halfD) {
      const topSurfaceZ = obj.position[2] + def.dimensions.height + heldExtraHeight;
      if (topSurfaceZ > minZ) {
        minZ = topSurfaceZ;
        obstacleName = obj.name;
      }
    }
  }

  return { minZ, obstacleName };
}

// Global reference for active smooth motion animation frame
let activeMotionRaf: number | null = null;

export const useDobotStore = create<DobotState>((set, get) => ({
  // Theme
  theme: 'dark',
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },
  setTheme: (newTheme) => {
    set({ theme: newTheme });
    if (typeof document !== 'undefined') {
      if (newTheme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
      try {
        localStorage.setItem('dobot_theme', newTheme);
      } catch (e) {
        // ignore
      }
    }
  },

  activeTab: 'operation',
  setActiveTab: (tab) => set({ activeTab: tab }),

  joints: { ...HOME_JOINTS },
  cartesian: { ...initialCartesian },
  speed: 50,
  setSpeed: (speed) => set({ speed: Math.max(5, Math.min(100, speed)) }),

  isEmergencyStopped: false,
  setEmergencyStopped: (stopped) => {
    if (stopped) {
      if (activeMotionRaf) {
        cancelAnimationFrame(activeMotionRaf);
        activeMotionRaf = null;
      }
      set({
        isEmergencyStopped: true,
        isMoving: false,
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

  isMoving: false,
  setIsMoving: (moving) => set({ isMoving: moving }),

  endEffectorType: 'suction',
  setEndEffectorType: (type) => set({ endEffectorType: type }),

  endEffectorActive: false,
  setEndEffectorActive: (active) => {
    const state = get();
    const { cartesian, objects, endEffectorType } = state;

    if (!active) {
      // Detach any attached object and drop with gravity to resting surface at current robot position
      const updatedObjects = objects.map((obj) => {
        if (!obj.attachedToTool) return obj;

        const def = OBJECT_REGISTRY[obj.typeId];
        let dropZ = 0; // table surface default

        for (const other of objects) {
          if (other.id === obj.id || other.attachedToTool) continue;
          const otherDef = OBJECT_REGISTRY[other.typeId];
          const dx = Math.abs(cartesian.x - other.position[0]);
          const dy = Math.abs(cartesian.y - other.position[1]);
          if (
            dx <= (otherDef.dimensions.width + def.dimensions.width) / 2 &&
            dy <= (otherDef.dimensions.depth + def.dimensions.depth) / 2
          ) {
            dropZ = Math.max(dropZ, other.position[2] + otherDef.dimensions.height);
          }
        }

        const dropX = Number(cartesian.x.toFixed(2));
        const dropY = Number(cartesian.y.toFixed(2));

        return {
          ...obj,
          attachedToTool: false,
          position: [dropX, dropY, dropZ] as [number, number, number],
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
      let attachedName: string | null = null;
      const alreadyHolding = objects.some((o) => o.attachedToTool);

      let updatedObjects = objects;
      if (!alreadyHolding) {
        updatedObjects = objects.map((obj) => {
          if (obj.attachedToTool) return obj;
          const def = OBJECT_REGISTRY[obj.typeId];
          if (!def) return obj;

          const topCenter = [
            obj.position[0],
            obj.position[1],
            obj.position[2] + def.dimensions.height,
          ];

          const horizDist = Math.hypot(cartesian.x - topCenter[0], cartesian.y - topCenter[1]);
          const vertDiff = Math.abs(cartesian.z - topCenter[2]);

          // Tolerance: horizontal <= 45mm, vertical <= 30mm
          if (horizDist <= 45 && vertDiff <= 30 && !attachedName) {
            attachedName = obj.name;
            return {
              ...obj,
              attachedToTool: true,
              attachedRelativeOffset: [0, 0, 0] as [number, number, number],
            };
          }
          return obj;
        });
      }

      if (attachedName || alreadyHolding) {
        set({
          endEffectorActive: true,
          objects: updatedObjects,
          suctionHint: `Suction ON: Vacuum sealed to ${attachedName || 'workpiece'}`,
        });
      } else {
        set({
          endEffectorActive: true,
          suctionHint: 'Suction ON: Vacuum pump running (Standby for contact)',
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
      set({ trajectoryPoints: [...list.slice(-400), pt] });
    }
  },
  clearTrajectory: () => set({ trajectoryPoints: [] }),

  jogJoint: (joint, delta) => {
    const { joints, isEmergencyStopped, objects, endEffectorActive, endEffectorType } = get();
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

    // Collision limit check: prevent penetrating below obstacle or table surface
    const { minZ, obstacleName } = getMinSafeZ(newPose.x, newPose.y, objects);
    if (newPose.z < minZ - 0.2) {
      set({
        jogWarning: `Physical barrier: Motion stopped at ${obstacleName} surface (${minZ.toFixed(1)} mm)`,
      });
      return false;
    }

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

      // Auto-latch if not holding anything
      const latch = checkSuctionLatching(newPose, updatedObjects, endEffectorType, endEffectorActive);
      if (latch.attachedName) {
        updatedObjects = latch.updatedObjects;
        set({ suctionHint: `Suction ON: Vacuum sealed to ${latch.attachedName}` });
      }
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
    const { cartesian, isEmergencyStopped, objects, endEffectorActive, endEffectorType } = get();
    if (isEmergencyStopped) {
      set({ jogWarning: 'Robot is halted by Emergency Stop! Release E-Stop first.' });
      return false;
    }

    const targetPose = { ...cartesian, [axis]: cartesian[axis] + delta };

    // Physical collision boundary check
    if (axis === 'z') {
      const { minZ, obstacleName } = getMinSafeZ(cartesian.x, cartesian.y, objects);
      if (targetPose.z < minZ) {
        if (cartesian.z <= minZ + 0.1) {
          set({
            jogWarning: `Physical barrier: Contact with ${obstacleName} surface (${minZ.toFixed(1)} mm). Cannot penetrate.`,
          });
          return false;
        }
        targetPose.z = minZ;
      }
    } else if (axis === 'x' || axis === 'y') {
      const { minZ, obstacleName } = getMinSafeZ(targetPose.x, targetPose.y, objects);
      if (cartesian.z < minZ - 0.5) {
        set({
          jogWarning: `Collision prevented: Cannot move horizontally through ${obstacleName}. Lift Z above ${minZ.toFixed(1)} mm.`,
        });
        return false;
      }
    }

    const solvedJoints = inverseKinematics(
      targetPose.x,
      targetPose.y,
      targetPose.z,
      targetPose.r
    );

    if (!solvedJoints) {
      set({
        jogWarning: `Cannot jog ${axis.toUpperCase()}: Position is outside reachable workspace or violates kinematics.`,
      });
      return false;
    }

    if (!areJointsWithinLimits(solvedJoints)) {
      set({
        jogWarning: `Cannot jog ${axis.toUpperCase()}: Resulting joint angles exceed physical limits.`,
      });
      return false;
    }

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

      const latch = checkSuctionLatching(truePose, updatedObjects, endEffectorType, endEffectorActive);
      if (latch.attachedName) {
        updatedObjects = latch.updatedObjects;
        set({ suctionHint: `Suction ON: Vacuum sealed to ${latch.attachedName}` });
      }
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
    const { objects, endEffectorActive, endEffectorType } = get();

    // Prevent direct joint sets below physical obstacles
    const { minZ, obstacleName } = getMinSafeZ(pose.x, pose.y, objects);
    if (pose.z < minZ - 0.5) {
      set({ jogWarning: `Physical barrier: Blocked at ${obstacleName} boundary (${minZ.toFixed(1)} mm)` });
      return;
    }

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

      const latch = checkSuctionLatching(pose, updatedObjects, endEffectorType, endEffectorActive);
      if (latch.attachedName) {
        updatedObjects = latch.updatedObjects;
      }
    }

    set({
      joints: newJoints,
      cartesian: pose,
      objects: updatedObjects,
    });
    get().addTrajectoryPoint([pose.x, pose.y, pose.z]);
  },

  // Smoothly move arm to target Cartesian Pose (e.g. from user input)
  moveToCartesianTarget: (target, durationSec) => {
    return new Promise((resolve) => {
      const state = get();
      if (state.isEmergencyStopped) {
        state.setJogWarning('Cannot move: Emergency Stop is active!');
        resolve(false);
        return;
      }

      const current = state.cartesian;
      const targetX = target.x !== undefined ? target.x : current.x;
      const targetY = target.y !== undefined ? target.y : current.y;
      const rawTargetZ = target.z !== undefined ? target.z : current.z;
      const targetR = target.r !== undefined ? target.r : current.r;

      // Prevent driving tool through solid objects or table surface
      const { minZ, obstacleName } = getMinSafeZ(targetX, targetY, state.objects);
      const safeTargetZ = Math.max(minZ, rawTargetZ);
      if (rawTargetZ < minZ - 0.1) {
        set({
          jogWarning: `Physical barrier: Target Z clamped to ${minZ.toFixed(1)} mm above ${obstacleName} surface.`,
        });
      }

      // Validate target reachable with IK
      const targetJoints = inverseKinematics(targetX, targetY, safeTargetZ, targetR);
      if (!targetJoints || !areJointsWithinLimits(targetJoints)) {
        set({
          jogWarning: `Target position (${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${safeTargetZ.toFixed(1)}) is unreachable or exceeds robot limits!`,
        });
        resolve(false);
        return;
      }

      // Stop any existing motion
      if (activeMotionRaf) {
        cancelAnimationFrame(activeMotionRaf);
        activeMotionRaf = null;
      }

      const dist = Math.hypot(targetX - current.x, targetY - current.y, safeTargetZ - current.z);
      const rotDist = Math.abs(targetR - current.r);
      const totalDist = dist + rotDist * 0.5;

      const velocityScale = state.speed / 100;
      const calculatedDuration = durationSec || Math.max(0.35, Math.min(2.5, totalDist / (130 * velocityScale)));

      const startPose = { ...current };
      const endPose = { x: targetX, y: targetY, z: safeTargetZ, r: targetR };
      const startTime = performance.now();
      const totalMs = calculatedDuration * 1000;

      set({ isMoving: true });

      const step = (now: number) => {
        if (get().isEmergencyStopped) {
          set({ isMoving: false });
          activeMotionRaf = null;
          resolve(false);
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalMs);
        // Cosine ease-in-out
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);

        const curX = startPose.x + (endPose.x - startPose.x) * ease;
        const curY = startPose.y + (endPose.y - startPose.y) * ease;
        const rawCurZ = startPose.z + (endPose.z - startPose.z) * ease;
        const curR = startPose.r + (endPose.r - startPose.r) * ease;

        const { minZ: curMinZ } = getMinSafeZ(curX, curY, get().objects);
        const curZ = Math.max(curMinZ, rawCurZ);

        const ik = inverseKinematics(curX, curY, curZ, curR);
        if (ik) {
          const stateNow = get();
          let nextObjs = stateNow.objects;
          if (stateNow.endEffectorActive) {
            nextObjs = stateNow.objects.map((obj) => {
              if (!obj.attachedToTool || !obj.attachedRelativeOffset) return obj;
              return {
                ...obj,
                position: [
                  curX + obj.attachedRelativeOffset[0],
                  curY + obj.attachedRelativeOffset[1],
                  curZ + obj.attachedRelativeOffset[2],
                ],
              };
            });
          }
          set({
            joints: ik,
            cartesian: { x: curX, y: curY, z: curZ, r: curR },
            objects: nextObjs,
          });
        }

        if (progress < 1) {
          activeMotionRaf = requestAnimationFrame(step);
        } else {
          // Snap exact final pose and update attached objects
          const stateNow = get();
          let nextObjs = stateNow.objects;
          if (stateNow.endEffectorActive) {
            nextObjs = stateNow.objects.map((obj) => {
              if (!obj.attachedToTool || !obj.attachedRelativeOffset) return obj;
              return {
                ...obj,
                position: [
                  endPose.x + obj.attachedRelativeOffset[0],
                  endPose.y + obj.attachedRelativeOffset[1],
                  endPose.z + obj.attachedRelativeOffset[2],
                ],
              };
            });
          }
          set({
            joints: targetJoints,
            cartesian: endPose,
            objects: nextObjs,
            isMoving: false,
          });
          get().addTrajectoryPoint([endPose.x, endPose.y, endPose.z]);
          activeMotionRaf = null;
          resolve(true);
        }
      };

      activeMotionRaf = requestAnimationFrame(step);
    });
  },

  // Smoothly move arm to target Joint Angles
  moveToJointTarget: (target, durationSec) => {
    return new Promise((resolve) => {
      const state = get();
      if (state.isEmergencyStopped) {
        state.setJogWarning('Cannot move: Emergency Stop is active!');
        resolve(false);
        return;
      }

      const cur = state.joints;
      const targetJoints: JointAngles = {
        j1: target.j1 !== undefined ? target.j1 : cur.j1,
        j2: target.j2 !== undefined ? target.j2 : cur.j2,
        j3: target.j3 !== undefined ? target.j3 : cur.j3,
        j4: target.j4 !== undefined ? target.j4 : cur.j4,
      };

      if (!areJointsWithinLimits(targetJoints)) {
        set({ jogWarning: 'Target joint angles exceed hardware limits!' });
        resolve(false);
        return;
      }

      // Pre-check target pose collision
      const targetPose = forwardKinematics(
        targetJoints.j1,
        targetJoints.j2,
        targetJoints.j3,
        targetJoints.j4
      );
      const { minZ, obstacleName } = getMinSafeZ(targetPose.x, targetPose.y, state.objects);
      if (targetPose.z < minZ - 0.5) {
        set({
          jogWarning: `Physical barrier: Target angles would penetrate ${obstacleName} surface (${minZ.toFixed(1)} mm)!`,
        });
        resolve(false);
        return;
      }

      if (activeMotionRaf) {
        cancelAnimationFrame(activeMotionRaf);
        activeMotionRaf = null;
      }

      const maxDiff = Math.max(
        Math.abs(targetJoints.j1 - cur.j1),
        Math.abs(targetJoints.j2 - cur.j2),
        Math.abs(targetJoints.j3 - cur.j3),
        Math.abs(targetJoints.j4 - cur.j4)
      );

      const velocityScale = state.speed / 100;
      const calculatedDuration = durationSec || Math.max(0.35, Math.min(2.5, maxDiff / (75 * velocityScale)));

      const startJoints = { ...cur };
      const startTime = performance.now();
      const totalMs = calculatedDuration * 1000;

      set({ isMoving: true, jogWarning: null });

      const step = (now: number) => {
        if (get().isEmergencyStopped) {
          set({ isMoving: false });
          activeMotionRaf = null;
          resolve(false);
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalMs);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);

        const curJoints: JointAngles = {
          j1: startJoints.j1 + (targetJoints.j1 - startJoints.j1) * ease,
          j2: startJoints.j2 + (targetJoints.j2 - startJoints.j2) * ease,
          j3: startJoints.j3 + (targetJoints.j3 - startJoints.j3) * ease,
          j4: startJoints.j4 + (targetJoints.j4 - startJoints.j4) * ease,
        };

        const curPose = forwardKinematics(curJoints.j1, curJoints.j2, curJoints.j3, curJoints.j4);
        const { minZ: curMinZ, obstacleName: curObstacle } = getMinSafeZ(curPose.x, curPose.y, get().objects);
        if (curPose.z < curMinZ - 0.5) {
          set({
            isMoving: false,
            jogWarning: `Physical barrier: Motion halted at ${curObstacle} boundary (${curMinZ.toFixed(1)} mm).`,
          });
          activeMotionRaf = null;
          resolve(false);
          return;
        }

        get().setJointsDirect(curJoints);

        if (progress < 1) {
          activeMotionRaf = requestAnimationFrame(step);
        } else {
          get().setJointsDirect(targetJoints);
          set({ isMoving: false });
          activeMotionRaf = null;
          resolve(true);
        }
      };

      activeMotionRaf = requestAnimationFrame(step);
    });
  },

  homeRobot: () => {
    const { isEmergencyStopped, moveToJointTarget } = get();
    if (isEmergencyStopped) {
      set({ jogWarning: 'Cannot home: Emergency Stop is active!' });
      return;
    }
    moveToJointTarget(HOME_JOINTS, 1.2);
  },

  resetAll: () => {
    if (activeMotionRaf) {
      cancelAnimationFrame(activeMotionRaf);
      activeMotionRaf = null;
    }
    const pose = forwardKinematics(
      HOME_JOINTS.j1,
      HOME_JOINTS.j2,
      HOME_JOINTS.j3,
      HOME_JOINTS.j4
    );

    const resetObjects: PlacedObjectInstance[] = DEFAULT_OBJECTS.map((obj) => ({
      ...obj,
      position: [...obj.position] as [number, number, number],
      attachedToTool: false,
      attachedRelativeOffset: undefined,
    }));

    set({
      joints: { ...HOME_JOINTS },
      cartesian: pose,
      isEmergencyStopped: false,
      isMoving: false,
      endEffectorActive: false,
      endEffectorType: 'suction',
      objects: resetObjects,
      selectedObjectId: 'box-default-1',
      trajectoryPoints: [[pose.x, pose.y, pose.z]],
      jogWarning: null,
      suctionHint: 'System fully reset to initial state',
      playbackState: 'idle',
      currentPlaybackIndex: -1,
      ghostPlacementType: null,
      ghostPosition: null,
      ghostValid: false,
      ghostError: null,
      teachingPoints: [...DEFAULT_TEACHING_POINTS],
    });
  },

  pickNearestObject: async () => {
    const state = get();
    const { objects, cartesian, moveToCartesianTarget, setEndEffectorActive, setEndEffectorType } = state;

    // Find nearest unattached object
    const unattached = objects.filter((o) => !o.attachedToTool);
    if (unattached.length === 0) {
      set({ jogWarning: 'No available unattached objects on the table to pick!' });
      return false;
    }

    // Sort by distance to tool tip
    const sorted = [...unattached].sort((a, b) => {
      const distA = Math.hypot(a.position[0] - cartesian.x, a.position[1] - cartesian.y);
      const distB = Math.hypot(b.position[0] - cartesian.x, b.position[1] - cartesian.y);
      return distA - distB;
    });

    const targetObj = sorted[0];
    const def = OBJECT_REGISTRY[targetObj.typeId];
    const topZ = targetObj.position[2] + def.dimensions.height;

    setEndEffectorType('suction');

    // 1. Move safely above target object
    const aboveOk = await moveToCartesianTarget({
      x: targetObj.position[0],
      y: targetObj.position[1],
      z: topZ + 60,
      r: 0,
    }, 1.2);
    if (!aboveOk) return false;

    // 2. Descend to touch surface
    const touchOk = await moveToCartesianTarget({
      x: targetObj.position[0],
      y: targetObj.position[1],
      z: topZ,
      r: 0,
    }, 0.9);
    if (!touchOk) return false;

    // 3. Turn on suction
    setEndEffectorActive(true);
    await new Promise((r) => setTimeout(r, 350));

    // 4. Lift up with object (100% visible lifting!)
    await moveToCartesianTarget({
      x: targetObj.position[0],
      y: targetObj.position[1],
      z: topZ + 75,
      r: 0,
    }, 1.1);

    return true;
  },

  releaseObject: () => {
    get().setEndEffectorActive(false);
  },

  executeCustomPickAndPlace: async (source, destination, safeZ = 100, onStepChange) => {
    const state = get();
    if (state.isEmergencyStopped) {
      state.setJogWarning('Emergency Stop is active!');
      return false;
    }

    state.setEndEffectorType('suction');

    const pt1 = { x: source.x, y: source.y, z: safeZ, r: source.r || 0 };
    const pt2 = { x: source.x, y: source.y, z: source.z, r: source.r || 0 };
    const pt3 = { x: destination.x, y: destination.y, z: safeZ, r: destination.r || 0 };
    const pt4 = { x: destination.x, y: destination.y, z: destination.z + 35, r: destination.r || 0 };

    const ik1 = inverseKinematics(pt1.x, pt1.y, pt1.z, pt1.r);
    const ik2 = inverseKinematics(pt2.x, pt2.y, pt2.z, pt2.r);
    const ik3 = inverseKinematics(pt3.x, pt3.y, pt3.z, pt3.r);
    const ik4 = inverseKinematics(pt4.x, pt4.y, pt4.z, pt4.r);

    if (!ik1 || !ik2 || !ik3 || !ik4) {
      set({
        jogWarning: 'Pick or Place position is outside the robot reachable workspace!',
      });
      return false;
    }

    // Step 1: Move above pick point
    onStepChange?.('1/6: Approaching Pick Clearance');
    const ok1 = await state.moveToCartesianTarget(pt1, 1.2);
    if (!ok1) return false;

    // Step 2: Descend to contact pick surface
    onStepChange?.('2/6: Descending to Workpiece');
    const ok2 = await state.moveToCartesianTarget(pt2, 0.9);
    if (!ok2) return false;

    // Step 3: Turn on vacuum suction
    onStepChange?.('3/6: Engaging Vacuum Suction');
    state.setEndEffectorActive(true);
    await new Promise((r) => setTimeout(r, 400));

    // Step 4: Lift up with workpiece to safe clearance (100% VISIBLE LIFTING!)
    onStepChange?.('4/6: Lifting Workpiece to Clearance');
    const ok3 = await state.moveToCartesianTarget(pt1, 1.1);
    if (!ok3) return false;

    // Step 5: Transfer across 3D space to destination approach
    onStepChange?.('5/6: Transferring across Workspace');
    const ok4 = await state.moveToCartesianTarget(pt3, 1.4);
    if (!ok4) return false;

    // Step 6: Lower to destination surface
    onStepChange?.('6/6: Lowering & Releasing onto Destination');
    const ok5 = await state.moveToCartesianTarget(pt4, 0.9);
    if (!ok5) return false;

    // Release suction
    state.setEndEffectorActive(false);
    await new Promise((r) => setTimeout(r, 350));

    // Retract up and return home
    await state.moveToCartesianTarget(pt3, 0.8);
    state.homeRobot();
    onStepChange?.('Cycle Completed');
    return true;
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
    const halfW = def.dimensions.width / 2;
    const halfD = def.dimensions.depth / 2;

    // Prevent any overlapping placement
    for (const other of objects) {
      if (other.attachedToTool) continue;
      const otherDef = OBJECT_REGISTRY[other.typeId];
      if (!otherDef) continue;
      const otherHalfW = otherDef.dimensions.width / 2;
      const otherHalfD = otherDef.dimensions.depth / 2;
      const dx = Math.abs(ghostPosition[0] - other.position[0]);
      const dy = Math.abs(ghostPosition[1] - other.position[1]);
      if (dx < halfW + otherHalfW + 8 && dy < halfD + otherHalfD + 8) {
        set({
          ghostValid: false,
          ghostError: `Cannot place: Overlaps with ${other.name}!`,
        });
        return false;
      }
    }

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
      suctionHint: `${newObj.name} placed cleanly with zero overlap.`,
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

  autoArrangeObjects: () => {
    const { objects } = get();
    const presets: [number, number, number][] = [
      [230, -100, 0], // Station / scale left
      [240, 100, 0],  // Workpiece right
      [265, 30, 0],   // Workpiece center-right
      [265, -30, 0],  // Workpiece center-left
      [205, 80, 0],   // Inner right
      [205, -80, 0],  // Inner left
    ];

    const arranged = objects.map((obj, i) => {
      const preset = presets[i % presets.length];
      return {
        ...obj,
        position: [...preset] as [number, number, number],
        attachedToTool: false,
        attachedRelativeOffset: undefined,
      };
    });

    set({
      objects: arranged,
      suctionHint: 'Workspace objects arranged with generous, non-overlapping spacing.',
    });
  },

  // Teaching & Playback
  teachingPoints: [...DEFAULT_TEACHING_POINTS],
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
        theme: get().theme,
      };
      localStorage.setItem('dobot_simulator_data', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  },

  loadFromLocalStorage: () => {
    try {
      const savedTheme = localStorage.getItem('dobot_theme') as 'dark' | 'light' | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        get().setTheme(savedTheme);
      }

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
