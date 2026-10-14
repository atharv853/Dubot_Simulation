export interface JointAngles {
  j1: number; // degrees: Base rotation (-90 to +90)
  j2: number; // degrees: Rear arm pitch (0 to 85)
  j3: number; // degrees: Forearm pitch (-10 to 90)
  j4: number; // degrees: End effector rotation (-90 to +90)
}

export interface CartesianPose {
  x: number; // mm
  y: number; // mm
  z: number; // mm
  r: number; // degrees: End effector rotation
}

export interface RobotLimits {
  j1: [number, number];
  j2: [number, number];
  j3: [number, number];
  j4: [number, number];
}

export interface RobotDimensions {
  baseHeight: number;       // L0: ~138 mm
  rearArmLength: number;    // L1: ~135 mm
  forearmLength: number;    // L2: ~147 mm
  toolOffsetR: number;      // L3: ~60 mm (horizontal forward wrist-to-tool)
  toolOffsetZ: number;      // L4: ~70 mm (vertical drop wrist-to-tip)
}
