import { describe, it, expect } from 'vitest';
import {
  forwardKinematics,
  inverseKinematics,
  HOME_JOINTS,
  ROBOT_LIMITS,
  areJointsWithinLimits,
} from './kinematics';
import { CartesianPose, JointAngles } from './types';

describe('Dobot Magician Kinematics', () => {
  it('correctly calculates forward kinematics for HOME_JOINTS', () => {
    const pose = forwardKinematics(
      HOME_JOINTS.j1,
      HOME_JOINTS.j2,
      HOME_JOINTS.j3,
      HOME_JOINTS.j4
    );
    expect(pose.x).toBeGreaterThan(200);
    expect(pose.y).toBeCloseTo(0, 2);
    expect(pose.r).toBeCloseTo(0, 2);
  });

  it('proves IK matches FK for HOME_JOINTS (IK(FK(j)) ≈ j)', () => {
    const pose = forwardKinematics(
      HOME_JOINTS.j1,
      HOME_JOINTS.j2,
      HOME_JOINTS.j3,
      HOME_JOINTS.j4
    );
    const solvedJoints = inverseKinematics(pose.x, pose.y, pose.z, pose.r);
    expect(solvedJoints).not.toBeNull();
    if (solvedJoints) {
      expect(solvedJoints.j1).toBeCloseTo(HOME_JOINTS.j1, 1);
      expect(solvedJoints.j2).toBeCloseTo(HOME_JOINTS.j2, 1);
      expect(solvedJoints.j3).toBeCloseTo(HOME_JOINTS.j3, 1);
      expect(solvedJoints.j4).toBeCloseTo(HOME_JOINTS.j4, 1);
    }
  });

  it('proves FK(IK(p)) ≈ p across a grid of reachable sample points', () => {
    // Generate valid test points by scanning joint space within safe interior bounds
    const sampleJoints: JointAngles[] = [];
    const j1Vals = [-60, -30, 0, 30, 60];
    const j2Vals = [15, 30, 45, 60, 75];
    const j3Vals = [10, 30, 50, 70];
    const j4Vals = [-45, 0, 45];

    for (const j1 of j1Vals) {
      for (const j2 of j2Vals) {
        for (const j3 of j3Vals) {
          for (const j4 of j4Vals) {
            sampleJoints.push({ j1, j2, j3, j4 });
          }
        }
      }
    }

    let successCount = 0;
    for (const j of sampleJoints) {
      const p: CartesianPose = forwardKinematics(j.j1, j.j2, j.j3, j.j4);
      const ik = inverseKinematics(p.x, p.y, p.z, p.r);

      expect(ik).not.toBeNull();
      if (ik) {
        // Re-evaluate FK on solved joints
        const pReconstructed = forwardKinematics(ik.j1, ik.j2, ik.j3, ik.j4);
        expect(pReconstructed.x).toBeCloseTo(p.x, 1);
        expect(pReconstructed.y).toBeCloseTo(p.y, 1);
        expect(pReconstructed.z).toBeCloseTo(p.z, 1);
        expect(pReconstructed.r).toBeCloseTo(p.r, 1);
        successCount++;
      }
    }

    expect(successCount).toBe(sampleJoints.length);
    expect(successCount).toBeGreaterThan(100);
  });

  it('rejects unreachable points and out-of-limit poses by returning null', () => {
    // Way too far away (> 500mm)
    const farPoint = inverseKinematics(600, 0, 100, 0);
    expect(farPoint).toBeNull();

    // Behind base with negative X and Y=0 (outside J1 [-90, 90])
    const behindBase = inverseKinematics(-200, 0, 100, 0);
    expect(behindBase).toBeNull();

    // Extremely low or high Z
    const tooLow = inverseKinematics(200, 0, -300, 0);
    expect(tooLow).toBeNull();

    const tooHigh = inverseKinematics(200, 0, 600, 0);
    expect(tooHigh).toBeNull();
  });

  it('validates areJointsWithinLimits helper correctly', () => {
    expect(areJointsWithinLimits({ j1: 0, j2: 40, j3: 45, j4: 0 })).toBe(true);
    expect(areJointsWithinLimits({ j1: 95, j2: 40, j3: 45, j4: 0 })).toBe(false);
    expect(areJointsWithinLimits({ j1: 0, j2: -5, j3: 45, j4: 0 })).toBe(false);
    expect(areJointsWithinLimits({ j1: 0, j2: 40, j3: -15, j4: 0 })).toBe(false);
    expect(areJointsWithinLimits({ j1: 0, j2: 40, j3: 45, j4: 95 })).toBe(false);
  });
});
