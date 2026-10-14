'use client';

import React, { useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { OBJECT_REGISTRY } from '@/lib/objects/types';
import { worldToRobot, robotToWorld } from '@/lib/kinematics/coords';
import { inverseKinematics } from '@/lib/kinematics';

export const GhostPlacement: React.FC = () => {
  const {
    ghostPlacementType,
    ghostPosition,
    ghostValid,
    ghostError,
    setGhostState,
    confirmGhostPlacement,
    cancelGhostPlacement,
  } = useDobotStore();

  const planeRef = useRef<THREE.Mesh>(null);

  if (!ghostPlacementType) return null;

  const def = OBJECT_REGISTRY[ghostPlacementType];
  if (!def) return null;

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const pt = e.point; // Three.js world coordinates
    const [rx, ry] = worldToRobot(pt.x, 0, pt.z);

    // Rounded to 1mm precision
    const posX = Math.round(rx);
    const posY = Math.round(ry);
    const posZ = 0;

    const rho = Math.hypot(posX, posY);

    let valid = true;
    let error: string | null = null;

    if (rho < 115) {
      valid = false;
      error = 'Too close: Overlaps robot base stand (min 115mm)';
    } else if (posX <= 10) {
      valid = false;
      error = 'Invalid zone: Must be in front of robot (X > 0)';
    } else if (rho > 310) {
      valid = false;
      error = 'Out of reach: Exceeds maximum workspace boundary (310mm)';
    } else if (rho < 155) {
      valid = false;
      error = 'Too close: Inside inner mechanical singularity (~155mm)';
    } else {
      // Validate kinematics reach at object top surface
      const ik = inverseKinematics(posX, posY, def.topSurfaceZOffset, 0);
      if (!ik) {
        valid = false;
        error = 'Kinematics: Tool cannot reach object top surface here';
      }
    }

    setGhostState([posX, posY, posZ], valid, error);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (ghostValid) {
      confirmGhostPlacement();
    }
  };

  const ghostWorldPos = ghostPosition
    ? robotToWorld(ghostPosition[0], ghostPosition[1], ghostPosition[2])
    : [0, 0, 0];

  const halfHeight = def.dimensions.height / 2;

  return (
    <group name="GhostPlacement">
      {/* Invisible raycast interaction plane across the workbench */}
      <mesh
        ref={planeRef}
        position={[0, 0.5, 100]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onPointerMissed={() => cancelGhostPlacement()}
        visible={false}
      >
        <planeGeometry args={[900, 900]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>

      {/* Ghost Object Preview Mesh */}
      {ghostPosition && (
        <group position={[ghostWorldPos[0], ghostWorldPos[1] + halfHeight, ghostWorldPos[2]]}>
          {/* Ghost Body */}
          <mesh>
            <boxGeometry
              args={[def.dimensions.width, def.dimensions.height, def.dimensions.depth]}
            />
            <meshStandardMaterial
              color={ghostValid ? '#52c41a' : '#ff4d4f'}
              transparent
              opacity={0.55}
              roughness={0.2}
            />
          </mesh>

          {/* Placement boundary ring */}
          <mesh position={[0, -halfHeight + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[22, 26, 32]} />
            <meshBasicMaterial
              color={ghostValid ? '#52c41a' : '#ff4d4f'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Top pickup crosshair */}
          <mesh position={[0, halfHeight + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2, 6, 16]} />
            <meshBasicMaterial
              color={ghostValid ? '#ffffff' : '#ff4d4f'}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
};
