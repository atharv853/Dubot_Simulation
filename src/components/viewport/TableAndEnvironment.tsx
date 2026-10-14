'use client';

import React from 'react';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';

export const TableAndEnvironment: React.FC = () => {
  const { theme } = useDobotStore();
  const isLight = theme === 'light';

  return (
    <group name="Environment">
      {/* ---------------- LIGHTING ---------------- */}
      <ambientLight intensity={isLight ? 0.9 : 0.65} color={isLight ? '#ffffff' : '#dbeafe'} />
      <directionalLight
        position={[350, 600, 300]}
        intensity={isLight ? 1.6 : 1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-near={50}
        shadow-camera-far={1200}
        shadow-camera-left={-400}
        shadow-camera-right={400}
        shadow-camera-top={400}
        shadow-camera-bottom={-400}
      />
      {/* Fill light */}
      <directionalLight
        position={[-300, 300, -250]}
        intensity={isLight ? 0.6 : 0.4}
        color={isLight ? '#f1f5f9' : '#60a5fa'}
      />
      {/* Top soft spotlight for end effector focus */}
      <pointLight position={[200, 400, 100]} intensity={0.5} distance={900} />

      {/* ---------------- WORKBENCH / WORKTABLE SURFACE ---------------- */}
      <group position={[0, -12, 100]}>
        {/* Main tabletop surface */}
        <mesh position={[0, 0, 0]} receiveShadow>
          <boxGeometry args={[700, 24, 700]} />
          <meshStandardMaterial
            color={isLight ? '#e2e8f0' : '#1e222a'}
            roughness={isLight ? 0.4 : 0.7}
            metalness={isLight ? 0.1 : 0.2}
          />
        </mesh>

        {/* Brushed aluminum edge chamfer */}
        <mesh position={[0, 11, 0]}>
          <boxGeometry args={[706, 2, 706]} />
          <meshStandardMaterial
            color={isLight ? '#94a3b8' : '#475569'}
            roughness={0.3}
            metalness={0.8}
          />
        </mesh>

        {/* Workbench legs */}
        {([-320, 320] as const).map((x) =>
          ([-320, 320] as const).map((z) => (
            <mesh key={`leg-${x}-${z}`} position={[x, -150, z]}>
              <boxGeometry args={[30, 280, 30]} />
              <meshStandardMaterial
                color={isLight ? '#64748b' : '#0f172a'}
                roughness={0.5}
              />
            </mesh>
          ))
        )}
      </group>

      {/* ---------------- ROBOT BASE MOUNTING PLATE ---------------- */}
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <cylinderGeometry args={[105, 108, 1, 64]} />
        <meshStandardMaterial
          color={isLight ? '#cbd5e1' : '#2d3748'}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Mounting bolts */}
      {[-80, 80].map((bx) =>
        [-80, 80].map((bz) => (
          <mesh key={`bolt-${bx}-${bz}`} position={[bx, 1.5, bz]}>
            <cylinderGeometry args={[4, 4, 2, 12]} />
            <meshStandardMaterial
              color={isLight ? '#64748b' : '#94a3b8'}
              metalness={0.9}
              roughness={0.2}
            />
          </mesh>
        ))
      )}

      {/* ---------------- INDUSTRIAL GRID FLOOR ---------------- */}
      <gridHelper
        args={[800, 40, isLight ? '#0284c7' : '#0066ff', isLight ? '#cbd5e1' : '#2d3748']}
        position={[0, 0.2, 100]}
      />

      {/* Coordinate axes helper at Robot Origin */}
      <group position={[0, 2, 0]}>
        {/* Robot +X Axis (Forward) - Red */}
        <mesh position={[0, 0, 45]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        {/* Robot +Y Axis (Left) - Green */}
        <mesh position={[-45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        {/* Robot +Z Axis (Up) - Blue */}
        <mesh position={[0, 45, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
      </group>
    </group>
  );
};
