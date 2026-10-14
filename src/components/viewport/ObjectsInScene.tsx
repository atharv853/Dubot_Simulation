'use client';

import React from 'react';
import * as THREE from 'three';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { OBJECT_REGISTRY } from '@/lib/objects/types';
import { robotToWorld } from '@/lib/kinematics/coords';

export const ObjectsInScene: React.FC = () => {
  const { objects, selectedObjectId, setSelectedObjectId } = useDobotStore();

  return (
    <group name="ObjectsInScene">
      {objects.map((obj) => {
        const def = OBJECT_REGISTRY[obj.typeId];
        if (!def) return null;

        const isSelected = selectedObjectId === obj.id;
        // Object position in robot frame: [X, Y, Z] where Z is bottom contact point
        // In Three.js world frame:
        const [wx, wy, wz] = robotToWorld(obj.position[0], obj.position[1], obj.position[2]);
        const halfHeight = def.dimensions.height / 2;

        return (
          <group
            key={obj.id}
            position={[wx, wy + halfHeight, wz]}
            rotation={[0, obj.rotationY, 0]}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedObjectId(obj.id);
            }}
          >
            {/* Selection bounding aura */}
            {isSelected && (
              <mesh position={[0, 0, 0]}>
                <boxGeometry
                  args={[
                    def.dimensions.width + 6,
                    def.dimensions.height + 6,
                    def.dimensions.depth + 6,
                  ]}
                />
                <meshBasicMaterial
                  color="#1890ff"
                  wireframe
                  transparent
                  opacity={0.8}
                />
              </mesh>
            )}

            {/* Top pickup target indicator */}
            <mesh position={[0, halfHeight + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2, 6, 24]} />
              <meshBasicMaterial
                color={isSelected ? '#1890ff' : '#00e5ff'}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* ---------------- BOX OBJECT MESH ---------------- */}
            {obj.typeId === 'box' && (
              <group>
                {/* Main box body */}
                <mesh castShadow receiveShadow>
                  <boxGeometry
                    args={[def.dimensions.width, def.dimensions.height, def.dimensions.depth]}
                  />
                  <meshStandardMaterial
                    color={def.color}
                    roughness={0.6}
                    metalness={0.1}
                  />
                </mesh>
                {/* Top tape stripe */}
                <mesh position={[0, halfHeight + 0.1, 0]}>
                  <boxGeometry args={[12, 0.2, def.dimensions.depth]} />
                  <meshStandardMaterial color="#d35400" roughness={0.4} />
                </mesh>
              </group>
            )}

            {/* ---------------- WEIGHING SCALE OBJECT MESH ---------------- */}
            {obj.typeId === 'scale' && (
              <group>
                {/* Main scale base body */}
                <mesh castShadow receiveShadow position={[0, -2, 0]}>
                  <boxGeometry
                    args={[def.dimensions.width, def.dimensions.height - 4, def.dimensions.depth]}
                  />
                  <meshStandardMaterial
                    color={def.color}
                    roughness={0.4}
                    metalness={0.5}
                  />
                </mesh>
                {/* Stainless steel circular weighing pan on top */}
                <mesh position={[0, halfHeight - 1, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[26, 26, 2, 36]} />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    metalness={0.9}
                    roughness={0.15}
                  />
                </mesh>
                {/* Digital LCD screen inset at front edge */}
                <mesh position={[0, -2, def.dimensions.depth / 2 + 0.2]}>
                  <boxGeometry args={[30, 8, 1]} />
                  <meshBasicMaterial color="#051923" />
                </mesh>
                {/* Glowing digital digits */}
                <mesh position={[0, -2, def.dimensions.depth / 2 + 0.8]}>
                  <boxGeometry args={[18, 4, 0.2]} />
                  <meshBasicMaterial color="#00ffcc" />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};
