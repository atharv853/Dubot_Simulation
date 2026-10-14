'use client';

import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { robotToWorld } from '@/lib/kinematics/coords';

export const TrajectoryLine: React.FC = () => {
  const { showTrajectory, trajectoryPoints } = useDobotStore();

  const points = useMemo(() => {
    if (!showTrajectory || trajectoryPoints.length < 2) return null;

    return trajectoryPoints.map((pt) => {
      const [wx, wy, wz] = robotToWorld(pt[0], pt[1], pt[2]);
      return [wx, wy, wz] as [number, number, number];
    });
  }, [showTrajectory, trajectoryPoints]);

  if (!showTrajectory || !points || points.length < 2) return null;

  return (
    <group name="TrajectoryLine">
      {/* Primary bright cyan trajectory path line */}
      <Line
        points={points}
        color="#00f2fe"
        lineWidth={2.5}
        dashed={false}
      />

      {/* Trajectory vertex nodes for recent positions */}
      {points.slice(-15).map((pos, idx) => (
        <mesh key={`traj-node-${idx}`} position={pos}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial color="#38ef7d" />
        </mesh>
      ))}
    </group>
  );
};
