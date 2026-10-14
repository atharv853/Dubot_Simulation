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

  it('verifies all 8 default teaching points are reachable with valid IK', () => {
    const defaultPoints = [
      { name: 'tp-1', x: 250, y: 0, z: 100, r: 0 },
      { name: 'tp-2', x: 240, y: 100, z: 75, r: 0 },
      { name: 'tp-3', x: 240, y: 100, z: 35, r: 0 },
      { name: 'tp-4', x: 240, y: 100, z: 110, r: 0 },
      { name: 'tp-5', x: 240, y: -100, z: 110, r: 0 },
      { name: 'tp-6', x: 240, y: -100, z: 53, r: 0 },
      { name: 'tp-7', x: 240, y: -100, z: 110, r: 0 },
      { name: 'tp-8', x: 250, y: 0, z: 100, r: 0 },
    ];

    for (const pt of defaultPoints) {
      const ik = inverseKinematics(pt.x, pt.y, pt.z, pt.r);
      console.log(`Point ${pt.name} (${pt.x}, ${pt.y}, ${pt.z}):`, ik);
      expect(ik, `Point ${pt.name} should have valid IK`).not.toBeNull();
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

  it('tests store suction latching at Point 3 coordinates', async () => {
    const { useDobotStore } = await import('../store/useDobotStore');
    const store = useDobotStore.getState();
    store.resetAll();

    // Check initial objects
    console.log('Initial objects:', useDobotStore.getState().objects);

    // Simulate arriving at Point 3
    useDobotStore.setState({
      cartesian: { x: 240, y: 100, z: 35, r: 0 }
    });

    // Turn suction on
    useDobotStore.getState().setEndEffectorActive(true);

    const objectsAfterSuction = useDobotStore.getState().objects;
    console.log('Objects after suction ON:', objectsAfterSuction);

    const attached = objectsAfterSuction.find(o => o.attachedToTool);
    expect(attached, 'Object should be attached to tool at Point 3').toBeDefined();
    expect(attached?.typeId).toBe('box');
  });

  it('proves getMinSafeZ prevents suction cup from entering box at top and edge boundaries', async () => {
    const { useDobotStore, getMinSafeZ } = await import('../store/useDobotStore');
    useDobotStore.getState().resetAll();

    const objects = useDobotStore.getState().objects;
    // Box is at (240, 100, 0), dimensions 35x35x35
    // Top surface is at Z = 35mm
    // Center test:
    const atCenter = getMinSafeZ(240, 100, objects);
    expect(atCenter.minZ).toBe(35);
    expect(atCenter.obstacleName).toBe('Cube Block A');

    // Edge boundary test: offset by 20mm in Y (box edge is at 17.5mm, suction cup radius is 16mm)
    // 20mm <= 17.5 + 16 = 33.5mm -> Must still protect suction cup from penetrating side
    const atEdge = getMinSafeZ(240, 120, objects);
    expect(atEdge.minZ).toBe(35);
    expect(atEdge.obstacleName).toBe('Cube Block A');

    // Clear of box test: 50mm away in Y
    const farAway = getMinSafeZ(240, 160, objects);
    expect(farAway.minZ).toBe(0);
    expect(farAway.obstacleName).toBe('Table Surface');
  });

  it('verifies confirmGhostPlacement prevents placing overlapping objects', async () => {
    const { useDobotStore } = await import('../store/useDobotStore');
    useDobotStore.getState().resetAll();

    // Try placing a box directly on top of the existing Cube Block A at (240, 100, 0)
    useDobotStore.getState().setGhostPlacementType('box');
    useDobotStore.getState().setGhostState([240, 102, 0], true, null);

    const confirmSuccess = useDobotStore.getState().confirmGhostPlacement();
    expect(confirmSuccess).toBe(false);
    expect(useDobotStore.getState().ghostValid).toBe(false);
    expect(useDobotStore.getState().ghostError).toContain('Overlaps');
  });

  it('checks exact 3D tip position in Three.js vs robotToWorld for pick point', async () => {
    const THREE = await import('three');
    const { robotToWorld } = await import('./coords');
    const { inverseKinematics, forwardKinematics } = await import('./kinematics');

    const L1 = 135;
    const L2 = 147;
    const L3 = 60;
    const DEG_TO_RAD = Math.PI / 180;

    const ik = inverseKinematics(240, 100, 35, 0);
    expect(ik).not.toBeNull();
    if (!ik) return;

    const root = new THREE.Group();
    const turret = new THREE.Group();
    turret.position.set(0, 46, 0);
    root.add(turret);

    const rearArm = new THREE.Group();
    rearArm.position.set(0, 92, 0);
    turret.add(rearArm);

    const forearm = new THREE.Group();
    forearm.position.set(0, L1, 0);
    rearArm.add(forearm);

    const wrist = new THREE.Group();
    wrist.position.set(0, 0, L2);
    forearm.add(wrist);

    const stepper = new THREE.Group();
    stepper.position.set(0, 0, L3);
    wrist.add(stepper);

    const tool = new THREE.Group();
    tool.position.set(0, -6, 0);
    stepper.add(tool);

    const suction = new THREE.Group();
    suction.position.set(0, -6, 0);
    tool.add(suction);

    const bellows = new THREE.Group();
    bellows.position.set(0, -44, 0);
    suction.add(bellows);

    const tip = new THREE.Group();
    tip.position.set(0, -14, 0);
    bellows.add(tip);

    turret.rotation.y = -ik.j1 * DEG_TO_RAD;
    rearArm.rotation.x = ik.j2 * DEG_TO_RAD;
    forearm.rotation.x = -ik.j2 * DEG_TO_RAD + ik.j3 * DEG_TO_RAD;
    wrist.rotation.x = -ik.j3 * DEG_TO_RAD;
    tool.rotation.y = -ik.j4 * DEG_TO_RAD;

    root.updateMatrixWorld(true);

    const worldPos = new THREE.Vector3();
    tip.getWorldPosition(worldPos);

    const expectedWorld = robotToWorld(240, 100, 35);
    console.log('THREE.js tip position:', worldPos);
    console.log('robotToWorld(240, 100, 35):', expectedWorld);
    console.log('Error vector:', {
      dx: worldPos.x - expectedWorld[0],
      dy: worldPos.y - expectedWorld[1],
      dz: worldPos.z - expectedWorld[2]
    });

    expect(Math.abs(worldPos.x - expectedWorld[0])).toBeLessThan(0.1);
    expect(Math.abs(worldPos.y - expectedWorld[1])).toBeLessThan(0.1);
    expect(Math.abs(worldPos.z - expectedWorld[2])).toBeLessThan(0.1);
  });
});

