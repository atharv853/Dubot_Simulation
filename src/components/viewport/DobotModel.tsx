'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { ROBOT_DIMENSIONS } from '@/lib/kinematics';

const DEG_TO_RAD = Math.PI / 180;

export const DobotModel: React.FC = () => {
  const { joints, endEffectorType, endEffectorActive } = useDobotStore();

  // Internal smoothed angles to achieve butter-smooth 60fps animation
  const currentJoints = useRef({
    j1: joints.j1,
    j2: joints.j2,
    j3: joints.j3,
    j4: joints.j4,
  });

  // Object refs for mechanical link transforms
  const turretRef = useRef<THREE.Group>(null);
  const rearArmRef = useRef<THREE.Group>(null);
  const forearmRef = useRef<THREE.Group>(null);
  const wristRef = useRef<THREE.Group>(null);
  const toolRef = useRef<THREE.Group>(null);
  const upperParallelogramRef = useRef<THREE.Group>(null);
  const lowerParallelogramRef = useRef<THREE.Group>(null);

  // Anodized aluminum & Dobot industrial materials
  const matCharcoal = new THREE.MeshStandardMaterial({
    color: '#252932',
    roughness: 0.35,
    metalness: 0.65,
  });
  const matSilver = new THREE.MeshStandardMaterial({
    color: '#d0d5dd',
    roughness: 0.25,
    metalness: 0.85,
  });
  const matBlueAccent = new THREE.MeshStandardMaterial({
    color: '#1890ff',
    roughness: 0.3,
    metalness: 0.5,
  });
  const matGoldJoint = new THREE.MeshStandardMaterial({
    color: '#cca048',
    roughness: 0.2,
    metalness: 0.9,
  });
  const matBlackRubber = new THREE.MeshStandardMaterial({
    color: '#111317',
    roughness: 0.8,
    metalness: 0.1,
  });
  const matSuctionSilicone = new THREE.MeshStandardMaterial({
    color: endEffectorActive ? '#ff4d4f' : '#faad14',
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  });

  useFrame((_, delta) => {
    // Smooth dampening factor (approximates ~25Hz spring damper)
    const factor = Math.min(1, delta * 18);

    currentJoints.current.j1 += (joints.j1 - currentJoints.current.j1) * factor;
    currentJoints.current.j2 += (joints.j2 - currentJoints.current.j2) * factor;
    currentJoints.current.j3 += (joints.j3 - currentJoints.current.j3) * factor;
    currentJoints.current.j4 += (joints.j4 - currentJoints.current.j4) * factor;

    const j1Rad = currentJoints.current.j1 * DEG_TO_RAD;
    const j2Rad = currentJoints.current.j2 * DEG_TO_RAD;
    const j3Rad = currentJoints.current.j3 * DEG_TO_RAD;
    const j4Rad = currentJoints.current.j4 * DEG_TO_RAD;

    // 1. Turret yaw: Joint 1 rotates around Three.js Y (Robot Z)
    if (turretRef.current) {
      turretRef.current.rotation.y = -j1Rad;
    }

    // 2. Rear arm pitch: Joint 2 rotates around local X axis
    // In local turret coordinates:
    // Local Z is forward (radial direction), local Y is up
    // Positive j2 tilts rear arm forward (+local Z, -local Y)
    if (rearArmRef.current) {
      rearArmRef.current.rotation.x = j2Rad;
    }

    // 3. Forearm pitch:
    // Forearm is connected at elbow: local position [0, L1, 0] along rear arm.
    // In Dobot Magician parallelogram mechanism:
    // Forearm angle is j3Rad relative to horizontal.
    // Inside the rear arm's coordinate frame (rotated by j2Rad),
    // the local rotation of forearm must be: (-(j2Rad) - (PI/2 - j3Rad)) = j3Rad - j2Rad - PI/2.
    // To keep it intuitive:
    // In rearArmRef coordinate frame, when rear arm tilts by j2Rad, the forearm rotation counteracts j2Rad:
    if (forearmRef.current) {
      forearmRef.current.rotation.x = -j2Rad + (Math.PI / 2 - j3Rad);
    }

    // 4. Parallelogram rods to keep wrist level
    if (upperParallelogramRef.current) {
      // Runs parallel to rear arm
      upperParallelogramRef.current.rotation.x = j2Rad;
    }

    // 5. Wrist: parallelogram keeps wrist always vertical regardless of arm angles
    if (wristRef.current) {
      // Counteracts forearm angle so tool bracket is always oriented plumb/level
      wristRef.current.rotation.x = -(Math.PI / 2 - j3Rad);
    }

    // 6. Tool rotation (Joint 4 / R)
    if (toolRef.current) {
      toolRef.current.rotation.y = -j4Rad;
    }
  });

  const L0 = ROBOT_DIMENSIONS.baseHeight;    // 138
  const L1 = ROBOT_DIMENSIONS.rearArmLength; // 135
  const L2 = ROBOT_DIMENSIONS.forearmLength; // 147
  const L3 = ROBOT_DIMENSIONS.toolOffsetR;   // 60
  const L4 = ROBOT_DIMENSIONS.toolOffsetZ;   // 70

  return (
    <group position={[0, 0, 0]} name="DobotMagicianRobot">
      {/* ---------------- FIXED BASE ON TABLE ---------------- */}
      <group position={[0, 0, 0]}>
        {/* Anti-slip rubber base feet */}
        <mesh position={[0, 3, 0]} material={matBlackRubber}>
          <cylinderGeometry args={[84, 86, 6, 48]} />
        </mesh>
        {/* Main die-cast aluminum base housing */}
        <mesh position={[0, 24, 0]} material={matCharcoal} castShadow receiveShadow>
          <cylinderGeometry args={[78, 82, 36, 48]} />
        </mesh>
        {/* Top chamfer ring with Dobot blue accent */}
        <mesh position={[0, 44, 0]} material={matBlueAccent} castShadow>
          <cylinderGeometry args={[75, 78, 4, 48]} />
        </mesh>
        {/* Dobot front branding badge */}
        <mesh position={[0, 24, 80]} material={matSilver}>
          <boxGeometry args={[40, 12, 2]} />
        </mesh>
      </group>

      {/* ---------------- ROTATING TURRET (JOINT 1) ---------------- */}
      <group ref={turretRef} position={[0, 46, 0]}>
        {/* Turret swivel body */}
        <mesh position={[0, 26, 0]} material={matCharcoal} castShadow receiveShadow>
          <cylinderGeometry args={[65, 72, 52, 48]} />
        </mesh>

        {/* Dual shoulder bracket towers reaching up to Joint 2 (L0 = 138 mm from table) */}
        {/* Height from 46 + 26 = 72 mm up to 138 mm (delta = 92 mm from turret base) */}
        {/* Left shoulder tower */}
        <mesh position={[-36, 56, 0]} material={matCharcoal} castShadow>
          <boxGeometry args={[14, 76, 54]} />
        </mesh>
        {/* Right shoulder tower */}
        <mesh position={[36, 56, 0]} material={matCharcoal} castShadow>
          <boxGeometry args={[14, 76, 54]} />
        </mesh>

        {/* Stepper motor hubs with brass joint caps at shoulder axis (L0 = 138 - 46 = 92 mm) */}
        <mesh position={[-44, 92, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
          <cylinderGeometry args={[20, 20, 8, 32]} />
        </mesh>
        <mesh position={[44, 92, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
          <cylinderGeometry args={[20, 20, 8, 32]} />
        </mesh>

        {/* ---------------- REAR ARM (JOINT 2 / L1 = 135 mm) ---------------- */}
        {/* Shoulder axis pivot at [0, 92, 0] relative to turret */}
        <group ref={rearArmRef} position={[0, 92, 0]}>
          {/* Main twin aluminum booms */}
          <mesh position={[-24, L1 / 2, 0]} material={matSilver} castShadow>
            <boxGeometry args={[10, L1, 24]} />
          </mesh>
          <mesh position={[24, L1 / 2, 0]} material={matSilver} castShadow>
            <boxGeometry args={[10, L1, 24]} />
          </mesh>
          {/* Rear arm cross brace */}
          <mesh position={[0, L1 * 0.45, 0]} material={matCharcoal} castShadow>
            <boxGeometry args={[44, 16, 18]} />
          </mesh>
          {/* Rear counterbalance weight styling */}
          <mesh position={[0, -18, -12]} material={matCharcoal} castShadow>
            <boxGeometry args={[40, 24, 22]} />
          </mesh>

          {/* Elbow Joint (J3) Pivot at top of Rear Arm: [0, L1, 0] */}
          {/* Elbow brass joint bearings */}
          <mesh position={[-28, L1, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
            <cylinderGeometry args={[16, 16, 6, 32]} />
          </mesh>
          <mesh position={[28, L1, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
            <cylinderGeometry args={[16, 16, 6, 32]} />
          </mesh>

          {/* ---------------- FOREARM (JOINT 3 / L2 = 147 mm) ---------------- */}
          <group ref={forearmRef} position={[0, L1, 0]}>
            {/* Forearm links extending forward along local Z */}
            <mesh position={[-18, 0, L2 / 2]} material={matSilver} castShadow>
              <boxGeometry args={[8, 18, L2]} />
            </mesh>
            <mesh position={[18, 0, L2 / 2]} material={matSilver} castShadow>
              <boxGeometry args={[8, 18, L2]} />
            </mesh>
            {/* Forearm center connector */}
            <mesh position={[0, 0, L2 * 0.5]} material={matCharcoal} castShadow>
              <boxGeometry args={[32, 14, 24]} />
            </mesh>

            {/* Parallelogram secondary leveling tie rod */}
            <mesh position={[0, 22, L2 / 2]} rotation={[Math.PI / 2, 0, 0]} material={matCharcoal} castShadow>
              <cylinderGeometry args={[3, 3, L2, 16]} />
            </mesh>

            {/* ---------------- WRIST & TOOL BRACKET (at end of forearm [0, 0, L2]) ---------------- */}
            <group ref={wristRef} position={[0, 0, L2]}>
              {/* Wrist pivot hinge */}
              <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
                <cylinderGeometry args={[14, 14, 38, 32]} />
              </mesh>

              {/* Tool forward extension arm (L3 = 60 mm forward) */}
              <mesh position={[0, 0, L3 / 2]} material={matCharcoal} castShadow>
                <boxGeometry args={[26, 22, L3]} />
              </mesh>

              {/* End-Effector Stepper Mount at [0, 0, L3] */}
              <group position={[0, 0, L3]}>
                {/* Stepper motor cylinder (Joint 4 / R axis) */}
                <mesh position={[0, 8, 0]} material={matCharcoal} castShadow>
                  <cylinderGeometry args={[18, 18, 28, 32]} />
                </mesh>
                <mesh position={[0, 24, 0]} material={matBlueAccent}>
                  <cylinderGeometry args={[16, 16, 4, 32]} />
                </mesh>

                {/* ---------------- TOOL HEAD ROTATING SHAFT (JOINT 4 / R) ---------------- */}
                <group ref={toolRef} position={[0, -6, 0]}>
                  {/* Tool chuck / quick release clamp */}
                  <mesh position={[0, 0, 0]} material={matSilver}>
                    <cylinderGeometry args={[12, 14, 12, 24]} />
                  </mesh>

                  {/* ---------------- SUCTION CUP END EFFECTOR (L4 = 70 mm drop) ---------------- */}
                  {endEffectorType === 'suction' && (
                    <group position={[0, -6, 0]}>
                      {/* Chrome suction extension tube */}
                      <mesh position={[0, -26, 0]} material={matSilver} castShadow>
                        <cylinderGeometry args={[3.5, 3.5, 52, 24]} />
                      </mesh>
                      {/* Pneumatic tube clamp */}
                      <mesh position={[0, -10, 0]} material={matCharcoal}>
                        <cylinderGeometry args={[7, 7, 8, 24]} />
                      </mesh>
                      {/* Flexible silicone bellows suction cup */}
                      <group position={[0, -58, 0]}>
                        <mesh position={[0, 0, 0]} material={matSuctionSilicone} castShadow>
                          <cylinderGeometry args={[10, 14, 10, 32]} />
                        </mesh>
                        <mesh position={[0, -6, 0]} material={matSuctionSilicone} castShadow>
                          <cylinderGeometry args={[14, 16, 6, 32]} />
                        </mesh>
                        {/* Suction active indicator glow ring */}
                        {endEffectorActive && (
                          <mesh position={[0, -10, 0]}>
                            <ringGeometry args={[6, 16, 32]} />
                            <meshBasicMaterial color="#00ff66" side={THREE.DoubleSide} />
                          </mesh>
                        )}
                      </group>
                    </group>
                  )}

                  {/* ---------------- GRIPPER END EFFECTOR ---------------- */}
                  {endEffectorType === 'gripper' && (
                    <group position={[0, -6, 0]}>
                      {/* Gripper actuator body */}
                      <mesh position={[0, -18, 0]} material={matCharcoal} castShadow>
                        <boxGeometry args={[36, 26, 26]} />
                      </mesh>
                      {/* Gripper pneumatic cylinder */}
                      <mesh position={[0, -18, -16]} material={matSilver} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[8, 8, 16, 24]} />
                      </mesh>
                      {/* Dual mechanical finger jaws */}
                      <mesh
                        position={[endEffectorActive ? -7 : -15, -45, 0]}
                        material={matSilver}
                        castShadow
                      >
                        <boxGeometry args={[6, 32, 14]} />
                      </mesh>
                      <mesh
                        position={[endEffectorActive ? 7 : 15, -45, 0]}
                        material={matSilver}
                        castShadow
                      >
                        <boxGeometry args={[6, 32, 14]} />
                      </mesh>
                      {/* Rubber contact pads */}
                      <mesh position={[endEffectorActive ? -4 : -12, -48, 0]} material={matBlackRubber}>
                        <boxGeometry args={[2, 20, 12]} />
                      </mesh>
                      <mesh position={[endEffectorActive ? 4 : 12, -48, 0]} material={matBlackRubber}>
                        <boxGeometry args={[2, 20, 12]} />
                      </mesh>
                    </group>
                  )}

                  {/* ---------------- LASER END EFFECTOR ---------------- */}
                  {endEffectorType === 'laser' && (
                    <group position={[0, -6, 0]}>
                      {/* Heatsink module */}
                      <mesh position={[0, -22, 0]} material={matCharcoal} castShadow>
                        <boxGeometry args={[28, 36, 28]} />
                      </mesh>
                      {/* Laser aperture lens */}
                      <mesh position={[0, -42, 0]} material={matGoldJoint}>
                        <cylinderGeometry args={[8, 10, 6, 24]} />
                      </mesh>
                      {/* Glowing red beam when laser is active */}
                      {endEffectorActive && (
                        <group position={[0, -45, 0]}>
                          <mesh position={[0, -75, 0]}>
                            <cylinderGeometry args={[1, 1.5, 150, 16]} />
                            <meshBasicMaterial color="#ff0033" transparent opacity={0.8} />
                          </mesh>
                          <mesh position={[0, -150, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                            <ringGeometry args={[0, 8, 32]} />
                            <meshBasicMaterial color="#ff0000" side={THREE.DoubleSide} />
                          </mesh>
                        </group>
                      )}
                    </group>
                  )}
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
