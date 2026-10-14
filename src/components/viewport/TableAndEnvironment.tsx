'use client';

import React from 'react';
import * as THREE from 'three';

export const TableAndEnvironment: React.FC = () => {
  return (
    <group name="Environment">
      {/* ---------------- LIGHTING ---------------- */}
      <ambientLight intensity={0.65} color="#dbeafe" />
      <directionalLight
        position={[350, 600, 300]}
        intensity={1.4}
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
      {/* Subtle fill light */}
      <directionalLight position={[-300, 300, -250]} intensity={0.4} color="#60a5fa" />
      {/* Top soft spotlight for end effector focus */}
      <pointLight position={[200, 400, 100]} intensity={0.5} distance={900} />

      {/* ---------------- WORKBENCH / WORKTABLE SURFACE ---------------- */}
      {/* Top of table is at Y = 0 */}
      <group position={[0, -12, 100]}>
        {/* Main tabletop surface (dark industrial laminate) */}
        <mesh position={[0, 0, 0]} receiveShadow>
          <boxGeometry args={[700, 24, 700]} />
          <meshStandardMaterial
            color="#1e222a"
            roughness={0.7}
            metalness={0.2}
          />
        </mesh>

        {/* Brushed aluminum edge chamfer */}
        <mesh position={[0, 11, 0]}>
          <boxGeometry args={[706, 2, 706]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Workbench legs */}
        <mesh position={[-320, -150, -320]}>
          <boxGeometry args={[30, 280, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        <mesh position={[320, -150, -320]}>
          <boxGeometry args={[30, 280, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        <mesh position={[-320, -150, 320]}>
          <boxGeometry args={[30, 280, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        <mesh position={[320, -150, 320]}>
          <boxGeometry args={[30, 280, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
      </group>

      {/* ---------------- ROBOT BASE MOUNTING PLATE ---------------- */}
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <cylinderGeometry args={[105, 108, 1, 64]} />
        <meshStandardMaterial color="#2d3748" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Mounting bolts */}
      {[-80, 80].map((bx) =>
        [-80, 80].map((bz) => (
          <mesh key={`bolt-${bx}-${bz}`} position={[bx, 1.5, bz]}>
            <cylinderGeometry args={[4, 4, 2, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
        ))
      )}

      {/* ---------------- INDUSTRIAL GRID FLOOR ---------------- */}
      {/* Floor grid situated slightly above table to avoid z-fighting */}
      <gridHelper
        args={[800, 40, '#0066ff', '#2d3748']}
        position={[0, 0.2, 100]}
      />

      {/* Coordinate axes helper at Robot Origin (X: Red, Y: Green, Z: Blue) */}
      {/* 
        Robot frame mapping to Three.js:
        Robot X (Forward) -> Three.js Z
        Robot Y (Left)    -> Three.js -X
        Robot Z (Up)      -> Three.js Y
      */}
      <group position={[0, 2, 0]}>
        {/* Robot +X Axis (Forward) - Red */}
        <mesh position={[0, 0, 45]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <mesh position={[0, 0, 95]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[4, 10, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>

        {/* Robot +Y Axis (Left) - Green */}
        <mesh position={[-45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        <mesh position={[-95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[4, 10, 16]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>

        {/* Robot +Z Axis (Up) - Blue */}
        <mesh position={[0, 45, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 90, 16]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
        <mesh position={[0, 95, 0]}>
          <coneGeometry args={[4, 10, 16]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
      </group>
    </group>
  );
};
