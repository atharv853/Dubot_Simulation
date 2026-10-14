'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { ROBOT_DIMENSIONS } from '@/lib/kinematics';
import { OBJECT_REGISTRY } from '@/lib/objects/types';

const DEG_TO_RAD = Math.PI / 180;

export const DobotModel: React.FC = () => {
  const {
    joints,
    endEffectorType,
    endEffectorActive,
    isEmergencyStopped,
    isMoving,
    theme,
    objects,
  } = useDobotStore();

  const attachedObj = objects.find((o) => o.attachedToTool);
  const attachedDef = attachedObj ? OBJECT_REGISTRY[attachedObj.typeId] : null;

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

  // High-fidelity industrial Dobot Magician materials
  const matCharcoal = new THREE.MeshStandardMaterial({
    color: '#282c35',
    roughness: 0.32,
    metalness: 0.68,
  });
  const matSilver = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.22,
    metalness: 0.88,
  });
  const matBlueAccent = new THREE.MeshStandardMaterial({
    color: '#1890ff',
    roughness: 0.25,
    metalness: 0.6,
  });
  const matGoldJoint = new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.18,
    metalness: 0.92,
  });
  const matBlackRubber = new THREE.MeshStandardMaterial({
    color: '#0f1115',
    roughness: 0.85,
    metalness: 0.05,
  });
  const matSuctionSilicone = new THREE.MeshStandardMaterial({
    color: endEffectorActive ? '#ff4d4f' : '#faad14',
    roughness: 0.35,
    metalness: 0.15,
    transparent: true,
    opacity: 0.92,
  });
  const matPneumaticHose = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.5,
    metalness: 0.1,
  });

  // Dynamic LED Ring Material (Glows blue normally, green on move, red on e-stop)
  const ledColor = isEmergencyStopped
    ? '#ff0033'
    : isMoving
    ? '#00ff66'
    : '#0099ff';

  const matLedRing = new THREE.MeshBasicMaterial({
    color: ledColor,
  });

  useFrame((_, delta) => {
    const factor = Math.min(1, delta * 20);

    currentJoints.current.j1 += (joints.j1 - currentJoints.current.j1) * factor;
    currentJoints.current.j2 += (joints.j2 - currentJoints.current.j2) * factor;
    currentJoints.current.j3 += (joints.j3 - currentJoints.current.j3) * factor;
    currentJoints.current.j4 += (joints.j4 - currentJoints.current.j4) * factor;

    const j1Rad = currentJoints.current.j1 * DEG_TO_RAD;
    const j2Rad = currentJoints.current.j2 * DEG_TO_RAD;
    const j3Rad = currentJoints.current.j3 * DEG_TO_RAD;
    const j4Rad = currentJoints.current.j4 * DEG_TO_RAD;

    // 1. Turret yaw: Joint 1
    if (turretRef.current) {
      turretRef.current.rotation.y = -j1Rad;
    }

    // 2. Rear arm pitch: Joint 2
    if (rearArmRef.current) {
      rearArmRef.current.rotation.x = j2Rad;
    }

    // 3. Forearm pitch: Joint 3
    if (forearmRef.current) {
      forearmRef.current.rotation.x = -j2Rad + j3Rad;
    }

    // 4. Parallelogram tie rod
    if (upperParallelogramRef.current) {
      upperParallelogramRef.current.rotation.x = j2Rad;
    }

    // 5. Wrist: remains plumb/vertical
    if (wristRef.current) {
      wristRef.current.rotation.x = -j3Rad;
    }

    // 6. Tool rotation (Joint 4 / R)
    if (toolRef.current) {
      toolRef.current.rotation.y = -j4Rad;
    }
  });

  const L1 = ROBOT_DIMENSIONS.rearArmLength; // 135
  const L2 = ROBOT_DIMENSIONS.forearmLength; // 147
  const L3 = ROBOT_DIMENSIONS.toolOffsetR;   // 60

  return (
    <group position={[0, 0, 0]} name="DobotMagicianRobot">
      {/* ---------------- FIXED BASE ON TABLE ---------------- */}
      <group position={[0, 0, 0]}>
        {/* Anti-slip rubber base feet */}
        <mesh position={[0, 3, 0]} material={matBlackRubber}>
          <cylinderGeometry args={[84, 88, 6, 48]} />
        </mesh>

        {/* Main die-cast aluminum base housing */}
        <mesh position={[0, 24, 0]} material={matCharcoal} castShadow receiveShadow>
          <cylinderGeometry args={[78, 84, 36, 48]} />
        </mesh>

        {/* Glowing LED status ring */}
        <mesh position={[0, 42.5, 0]}>
          <cylinderGeometry args={[79, 79, 2.5, 48]} />
          <primitive object={matLedRing} attach="material" />
        </mesh>

        {/* Top chamfer ring with Dobot blue accent */}
        <mesh position={[0, 44, 0]} material={matBlueAccent} castShadow>
          <cylinderGeometry args={[75, 78, 4, 48]} />
        </mesh>

        {/* Dobot front branding badge */}
        <mesh position={[0, 24, 80]} material={matSilver}>
          <boxGeometry args={[42, 14, 2]} />
        </mesh>

        {/* Rear I/O panel (Power switch, USB, 12V barrel) */}
        <mesh position={[0, 20, -78]} material={matBlackRubber}>
          <boxGeometry args={[40, 16, 3]} />
        </mesh>
      </group>

      {/* ---------------- ROTATING TURRET (JOINT 1) ---------------- */}
      <group ref={turretRef} position={[0, 46, 0]}>
        {/* Turret swivel body */}
        <mesh position={[0, 26, 0]} material={matCharcoal} castShadow receiveShadow>
          <cylinderGeometry args={[65, 72, 52, 48]} />
        </mesh>

        {/* Left shoulder tower */}
        <mesh position={[-36, 56, 0]} material={matCharcoal} castShadow>
          <boxGeometry args={[14, 76, 54]} />
        </mesh>
        {/* Right shoulder tower */}
        <mesh position={[36, 56, 0]} material={matCharcoal} castShadow>
          <boxGeometry args={[14, 76, 54]} />
        </mesh>

        {/* Stepper motor hubs with brass joint caps */}
        <mesh position={[-44, 92, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
          <cylinderGeometry args={[22, 22, 8, 32]} />
        </mesh>
        <mesh position={[44, 92, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
          <cylinderGeometry args={[22, 22, 8, 32]} />
        </mesh>

        {/* ---------------- REAR ARM (JOINT 2 / L1 = 135 mm) ---------------- */}
        <group ref={rearArmRef} position={[0, 92, 0]}>
          {/* Main twin aluminum booms */}
          <mesh position={[-24, L1 / 2, 0]} material={matSilver} castShadow>
            <boxGeometry args={[10, L1, 24]} />
          </mesh>
          <mesh position={[24, L1 / 2, 0]} material={matSilver} castShadow>
            <boxGeometry args={[10, L1, 24]} />
          </mesh>

          {/* Hollowed lightening grooves on booms */}
          <mesh position={[-24, L1 / 2, 0]} material={matCharcoal}>
            <boxGeometry args={[10.5, L1 * 0.7, 10]} />
          </mesh>
          <mesh position={[24, L1 / 2, 0]} material={matCharcoal}>
            <boxGeometry args={[10.5, L1 * 0.7, 10]} />
          </mesh>

          {/* Rear arm cross brace */}
          <mesh position={[0, L1 * 0.45, 0]} material={matCharcoal} castShadow>
            <boxGeometry args={[44, 16, 18]} />
          </mesh>

          {/* Rear counterbalance styling */}
          <mesh position={[0, -18, -12]} material={matCharcoal} castShadow>
            <boxGeometry args={[40, 24, 22]} />
          </mesh>

          {/* Elbow Joint (J3) Pivot caps */}
          <mesh position={[-28, L1, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
            <cylinderGeometry args={[18, 18, 6, 32]} />
          </mesh>
          <mesh position={[28, L1, 0]} rotation={[0, 0, Math.PI / 2]} material={matGoldJoint}>
            <cylinderGeometry args={[18, 18, 6, 32]} />
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
              <cylinderGeometry args={[3.5, 3.5, L2, 16]} />
            </mesh>

            {/* Pneumatic silicone hose routed along the top of forearm */}
            <mesh position={[0, 10, L2 / 2]} rotation={[Math.PI / 2, 0, 0]} material={matPneumaticHose}>
              <cylinderGeometry args={[2.5, 2.5, L2 * 0.95, 16]} />
            </mesh>

            {/* ---------------- WRIST & TOOL BRACKET ---------------- */}
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

                {/* ---------------- TOOL HEAD ROTATING SHAFT ---------------- */}
                <group ref={toolRef} position={[0, -6, 0]}>
                  {/* Tool quick-release collar */}
                  <mesh position={[0, 0, 0]} material={matSilver}>
                    <cylinderGeometry args={[12, 14, 12, 24]} />
                  </mesh>

                  {/* ---------------- SUCTION CUP ---------------- */}
                  {endEffectorType === 'suction' && (
                    <group position={[0, -6, 0]}>
                      {/* Pneumatic tube clamp */}
                      <mesh position={[0, -6, 0]} material={matCharcoal}>
                        <cylinderGeometry args={[6.5, 6.5, 12, 24]} />
                      </mesh>

                      {/* Chrome suction extension tube */}
                      <mesh position={[0, -26, 0]} material={matSilver} castShadow>
                        <cylinderGeometry args={[3, 3, 36, 24]} />
                      </mesh>

                      {/* Silicone bellows suction cup (exact -70mm tip alignment) */}
                      <group position={[0, -44, 0]}>
                        {/* Upper bellows neck */}
                        <mesh position={[0, -4, 0]} material={matSuctionSilicone} castShadow>
                          <cylinderGeometry args={[7.5, 11, 8, 32]} />
                        </mesh>
                        {/* Flared suction sealing lip */}
                        <mesh position={[0, -11, 0]} material={matSuctionSilicone} castShadow>
                          <cylinderGeometry args={[11, 15, 6, 32]} />
                        </mesh>

                        {/* Suction active indicator glow aura right at lip */}
                        {endEffectorActive && (
                          <group position={[0, -14, 0]}>
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                              <ringGeometry args={[3, 16, 32]} />
                              <meshBasicMaterial color="#00ff66" side={THREE.DoubleSide} transparent opacity={0.85} />
                            </mesh>
                          </group>
                        )}

                        {/* WORKPIECE ATTACHED TO SUCTION CUP (Flush surface contact, zero penetration) */}
                        {attachedObj && attachedDef && (
                          <group position={[0, -14 - attachedDef.dimensions.height / 2, 0]}>
                            {/* Main workpiece mesh */}
                            <mesh castShadow receiveShadow>
                              <boxGeometry
                                args={[
                                  attachedDef.dimensions.width,
                                  attachedDef.dimensions.height,
                                  attachedDef.dimensions.depth,
                                ]}
                              />
                              <meshStandardMaterial
                                color={attachedDef.color}
                                roughness={0.5}
                                metalness={0.1}
                              />
                            </mesh>

                            {/* Top tape stripe detail */}
                            <mesh position={[0, attachedDef.dimensions.height / 2 + 0.1, 0]}>
                              <boxGeometry args={[12, 0.2, attachedDef.dimensions.depth]} />
                              <meshStandardMaterial color="#d35400" roughness={0.4} />
                            </mesh>

                            {/* Glowing vacuum seal contact indicator */}
                            <mesh
                              position={[0, attachedDef.dimensions.height / 2 + 0.2, 0]}
                              rotation={[-Math.PI / 2, 0, 0]}
                            >
                              <ringGeometry args={[2, 10, 24]} />
                              <meshBasicMaterial color="#00ff66" side={THREE.DoubleSide} />
                            </mesh>
                          </group>
                        )}
                      </group>
                    </group>
                  )}

                  {/* ---------------- GRIPPER ---------------- */}
                  {endEffectorType === 'gripper' && (
                    <group position={[0, -6, 0]}>
                      <mesh position={[0, -18, 0]} material={matCharcoal} castShadow>
                        <boxGeometry args={[36, 26, 26]} />
                      </mesh>
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
                    </group>
                  )}

                  {/* ---------------- LASER ---------------- */}
                  {endEffectorType === 'laser' && (
                    <group position={[0, -6, 0]}>
                      <mesh position={[0, -22, 0]} material={matCharcoal} castShadow>
                        <boxGeometry args={[28, 36, 28]} />
                      </mesh>
                      <mesh position={[0, -42, 0]} material={matGoldJoint}>
                        <cylinderGeometry args={[8, 10, 6, 24]} />
                      </mesh>
                      {endEffectorActive && (
                        <group position={[0, -45, 0]}>
                          <mesh position={[0, -75, 0]}>
                            <cylinderGeometry args={[1, 1.5, 150, 16]} />
                            <meshBasicMaterial color="#ff0033" transparent opacity={0.8} />
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
