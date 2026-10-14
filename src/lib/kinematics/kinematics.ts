import { CartesianPose, JointAngles, RobotDimensions, RobotLimits } from './types';

export const ROBOT_DIMENSIONS: RobotDimensions = {
  baseHeight: 138,      // mm: base mounting to shoulder joint (J2)
  rearArmLength: 135,   // mm: shoulder joint (J2) to elbow joint (J3)
  forearmLength: 147,   // mm: elbow joint (J3) to wrist joint
  toolOffsetR: 60,      // mm: horizontal offset from wrist to tool centerline
  toolOffsetZ: 70,      // mm: vertical drop from wrist to suction cup tip
};

export const ROBOT_LIMITS: RobotLimits = {
  j1: [-90, 90],
  j2: [0, 85],
  j3: [-10, 90],
  j4: [-90, 90],
};

// Default Home configuration
export const HOME_JOINTS: JointAngles = {
  j1: 0,
  j2: 40,
  j3: 45,
  j4: 0,
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Forward Kinematics for Dobot Magician 4-DOF
 *
 * @param j1 Base rotation angle in degrees (-90 to 90)
 * @param j2 Rear arm pitch in degrees (0 to 85, measured from vertical upright)
 * @param j3 Forearm pitch in degrees (-10 to 90, measured from horizontal)
 * @param j4 Tool rotation in degrees (-90 to 90)
 * @param dims Robot link dimensions (defaults to ROBOT_DIMENSIONS)
 * @returns Cartesian pose { x, y, z, r } in mm and degrees
 */
export function forwardKinematics(
  j1: number,
  j2: number,
  j3: number,
  j4: number,
  dims: RobotDimensions = ROBOT_DIMENSIONS
): CartesianPose {
  const theta1 = j1 * DEG_TO_RAD;
  const theta2 = j2 * DEG_TO_RAD;
  const theta3 = j3 * DEG_TO_RAD;

  // Planar radial distance from base center to tool tip
  const rho =
    dims.rearArmLength * Math.sin(theta2) +
    dims.forearmLength * Math.cos(theta3) +
    dims.toolOffsetR;

  // Vertical height of suction cup tip above table
  const z =
    dims.baseHeight +
    dims.rearArmLength * Math.cos(theta2) -
    dims.forearmLength * Math.sin(theta3) -
    dims.toolOffsetZ;

  const x = rho * Math.cos(theta1);
  const y = rho * Math.sin(theta1);
  const r = j1 + j4; // World yaw of end effector

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    z: Number(z.toFixed(4)),
    r: Number(r.toFixed(4)),
  };
}

/**
 * Inverse Kinematics for Dobot Magician 4-DOF
 * Analytical geometric solution with 2-link planar solve in the arm plane.
 *
 * @param x Target X in mm
 * @param y Target Y in mm
 * @param z Target Z in mm
 * @param r Target R in degrees (world yaw of tool)
 * @param dims Robot link dimensions (defaults to ROBOT_DIMENSIONS)
 * @param limits Robot joint limits (defaults to ROBOT_LIMITS)
 * @returns JointAngles { j1, j2, j3, j4 } in degrees, or null if unreachable / limit violated
 */
export function inverseKinematics(
  x: number,
  y: number,
  z: number,
  r: number = 0,
  dims: RobotDimensions = ROBOT_DIMENSIONS,
  limits: RobotLimits = ROBOT_LIMITS
): JointAngles | null {
  // 1. Base angle (Joint 1)
  const rho = Math.sqrt(x * x + y * y);
  let j1 = 0;
  if (rho > 1e-4) {
    j1 = Math.atan2(y, x) * RAD_TO_DEG;
  }

  // Check J1 limits
  if (j1 < limits.j1[0] - 1e-3 || j1 > limits.j1[1] + 1e-3) {
    return null;
  }

  // 2. Wrist position in radial-vertical plane
  const deltaRho = rho - dims.toolOffsetR;
  const deltaZ = z + dims.toolOffsetZ - dims.baseHeight;

  // Physical impossibility if deltaRho is behind base
  if (deltaRho < 0) {
    return null;
  }

  // 3. Distance from shoulder pivot to wrist pivot
  const D2 = deltaRho * deltaRho + deltaZ * deltaZ;
  const D = Math.sqrt(D2);

  const L1 = dims.rearArmLength;
  const L2 = dims.forearmLength;

  // Reach check (triangle inequality)
  const Dmin = Math.abs(L1 - L2);
  const Dmax = L1 + L2;
  if (D > Dmax + 1e-3 || D < Dmin - 1e-3) {
    return null;
  }

  // 4. Law of Cosines to find interior angle beta at shoulder
  const cosBeta = (L1 * L1 + D2 - L2 * L2) / (2 * L1 * D);
  const clampedCosBeta = Math.max(-1, Math.min(1, cosBeta));
  const beta = Math.acos(clampedCosBeta);

  // Direction angle psi of target wrist relative to horizontal in radial plane
  const psi = Math.atan2(deltaZ, deltaRho);

  // Elbow-up branch:
  // phi2 is rear arm angle above horizontal: phi2 = psi + beta
  // theta2 is rear arm angle from vertical: theta2 = pi/2 - phi2
  const phi2 = psi + beta;
  const theta2 = Math.PI / 2 - phi2;
  const j2 = theta2 * RAD_TO_DEG;

  // Check J2 limits
  if (j2 < limits.j2[0] - 1e-3 || j2 > limits.j2[1] + 1e-3) {
    return null;
  }

  // 5. Forearm angle theta3 relative to horizontal
  const sinTheta3 = (L1 * Math.cos(theta2) - deltaZ) / L2;
  const cosTheta3 = (deltaRho - L1 * Math.sin(theta2)) / L2;
  const theta3 = Math.atan2(sinTheta3, cosTheta3);
  const j3 = theta3 * RAD_TO_DEG;

  // Check J3 limits
  if (j3 < limits.j3[0] - 1e-3 || j3 > limits.j3[1] + 1e-3) {
    return null;
  }

  // 6. Joint 4: End effector rotation
  const j4 = r - j1;
  if (j4 < limits.j4[0] - 1e-3 || j4 > limits.j4[1] + 1e-3) {
    return null;
  }

  return {
    j1: Number(j1.toFixed(3)),
    j2: Number(j2.toFixed(3)),
    j3: Number(j3.toFixed(3)),
    j4: Number(j4.toFixed(3)),
  };
}

/**
 * Checks if a joint configuration is within limits.
 */
export function areJointsWithinLimits(
  joints: JointAngles,
  limits: RobotLimits = ROBOT_LIMITS
): boolean {
  return (
    joints.j1 >= limits.j1[0] - 1e-3 &&
    joints.j1 <= limits.j1[1] + 1e-3 &&
    joints.j2 >= limits.j2[0] - 1e-3 &&
    joints.j2 <= limits.j2[1] + 1e-3 &&
    joints.j3 >= limits.j3[0] - 1e-3 &&
    joints.j3 <= limits.j3[1] + 1e-3 &&
    joints.j4 >= limits.j4[0] - 1e-3 &&
    joints.j4 <= limits.j4[1] + 1e-3
  );
}

/**
 * Computes the maximum and minimum reach radius at a given height Z
 */
export function getWorkspaceBounds(dims: RobotDimensions = ROBOT_DIMENSIONS) {
  const maxRadius = dims.rearArmLength + dims.forearmLength + dims.toolOffsetR;
  const minRadius = Math.max(dims.toolOffsetR, Math.abs(dims.rearArmLength - dims.forearmLength) + dims.toolOffsetR);
  return {
    maxRadius,
    minRadius,
  };
}
