'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { forwardKinematics } from '@/lib/kinematics';
import { robotToWorld } from '@/lib/kinematics/coords';

export const ReachEnvelope: React.FC = () => {
  const { showReachDome } = useDobotStore();

  const geometry = useMemo(() => {
    if (!showReachDome) return null;

    // Sample forward kinematics across extreme joint boundaries to form a hull mesh
    const points: THREE.Vector3[] = [];
    const j1Steps = 24;
    const j2Steps = 16;

    // Scan joint envelope
    for (let i = 0; i <= j1Steps; i++) {
      const j1 = -90 + (180 * i) / j1Steps;
      for (let j = 0; j <= j2Steps; j++) {
        const j2 = 0 + (85 * j) / j2Steps;
        // Sample max reach (elbow extended, j3 ~ 0-20)
        const poseMax = forwardKinematics(j1, j2, 10, 0);
        const [wx, wy, wz] = robotToWorld(poseMax.x, poseMax.y, poseMax.z);
        points.push(new THREE.Vector3(wx, wy, wz));
      }
    }

    // Semi-cylinder / toroidal dome approximation using parametric points
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    return geom;
  }, [showReachDome]);

  if (!showReachDome) return null;

  return (
    <group name="ReachEnvelope">
      {/* Translucent reach hemisphere */}
      <mesh position={[0, 70, 0]}>
        <sphereGeometry args={[325, 32, 16, 0, Math.PI, 0, Math.PI * 0.65]} />
        <meshStandardMaterial
          color="#1890ff"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          wireframe={false}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <mesh position={[0, 70, 0]}>
        <sphereGeometry args={[325, 16, 8, 0, Math.PI, 0, Math.PI * 0.65]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0.25}
          wireframe
        />
      </mesh>

      {/* Ground boundary reach ring on table */}
      <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[140, 325, 48, 1, 0, Math.PI]} />
        <meshBasicMaterial
          color="#1890ff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
