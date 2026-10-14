'use client';

import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DobotModel } from './DobotModel';
import { TableAndEnvironment } from './TableAndEnvironment';
import { ReachEnvelope } from './ReachEnvelope';
import { TrajectoryLine } from './TrajectoryLine';
import { ObjectsInScene } from './ObjectsInScene';
import { GhostPlacement } from './GhostPlacement';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { Eye, RotateCcw, Box, Compass, Sparkles, Trash2 } from 'lucide-react';

export const Viewport3D: React.FC = () => {
  const {
    showReachDome,
    setShowReachDome,
    showTrajectory,
    setShowTrajectory,
    clearTrajectory,
    ghostPlacementType,
    ghostValid,
    ghostError,
    cancelGhostPlacement,
  } = useDobotStore();

  const controlsRef = useRef<OrbitControlsImpl>(null);

  const resetCamera = (mode: 'iso' | 'top' | 'front') => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    if (mode === 'iso') {
      controls.object.position.set(380, 320, 380);
      controls.target.set(0, 100, 120);
    } else if (mode === 'top') {
      controls.object.position.set(0, 600, 120);
      controls.target.set(0, 0, 120);
    } else if (mode === 'front') {
      controls.object.position.set(0, 150, 550);
      controls.target.set(0, 100, 100);
    }
    controls.update();
  };

  return (
    <div className="relative w-full h-full bg-[#101216] select-none overflow-hidden">
      {/* 3D Canvas */}
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        className="w-full h-full"
      >
        <PerspectiveCamera makeDefault position={[380, 320, 380]} fov={45} near={10} far={3000} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          target={[0, 100, 120]}
          minDistance={100}
          maxDistance={1200}
        />

        <TableAndEnvironment />
        <DobotModel />
        <ObjectsInScene />
        <GhostPlacement />
        <ReachEnvelope />
        <TrajectoryLine />
      </Canvas>

      {/* Floating HUD: Placement Hint Banner */}
      {ghostPlacementType && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-lg border backdrop-blur-md shadow-xl bg-dobot-panel/90 text-sm animate-pulse border-dobot-accent">
          <Box className="w-4 h-4 text-dobot-accent animate-spin" />
          <span>
            Placing <strong>{ghostPlacementType.toUpperCase()}</strong>: Move cursor over table & click to drop.
          </span>
          {ghostError && (
            <span className="text-xs px-2 py-0.5 rounded bg-dobot-danger/20 text-dobot-danger font-medium">
              {ghostError}
            </span>
          )}
          {ghostValid && (
            <span className="text-xs px-2 py-0.5 rounded bg-dobot-success/20 text-dobot-success font-medium">
              ✓ Valid Location
            </span>
          )}
          <button
            onClick={() => cancelGhostPlacement()}
            className="ml-2 px-2 py-1 rounded text-xs bg-dobot-surface hover:bg-dobot-border text-dobot-muted hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating HUD: Viewport Camera Tools (Top Right) */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-lg bg-dobot-panel/85 backdrop-blur-md border border-dobot-border shadow-lg">
        <button
          onClick={() => resetCamera('iso')}
          title="Isometric View"
          className="px-2.5 py-1 text-xs rounded font-medium bg-dobot-surface hover:bg-dobot-accent hover:text-white transition-colors text-dobot-text"
        >
          Iso
        </button>
        <button
          onClick={() => resetCamera('top')}
          title="Top-Down View"
          className="px-2.5 py-1 text-xs rounded font-medium bg-dobot-surface hover:bg-dobot-accent hover:text-white transition-colors text-dobot-text"
        >
          Top
        </button>
        <button
          onClick={() => resetCamera('front')}
          title="Front View"
          className="px-2.5 py-1 text-xs rounded font-medium bg-dobot-surface hover:bg-dobot-accent hover:text-white transition-colors text-dobot-text"
        >
          Front
        </button>
      </div>

      {/* Floating HUD: Display Overlays Toggle (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 p-1.5 rounded-lg bg-dobot-panel/85 backdrop-blur-md border border-dobot-border shadow-lg text-xs">
        {/* Reach Envelope Toggle */}
        <button
          onClick={() => setShowReachDome(!showReachDome)}
          title="Toggle Reach Envelope Dome"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
            showReachDome
              ? 'bg-dobot-accent text-white shadow-sm'
              : 'bg-dobot-surface text-dobot-muted hover:text-dobot-text'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Reach Dome</span>
        </button>

        {/* Trajectory Toggle */}
        <button
          onClick={() => setShowTrajectory(!showTrajectory)}
          title="Toggle End-Effector Trajectory Path"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
            showTrajectory
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'bg-dobot-surface text-dobot-muted hover:text-dobot-text'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Trajectory</span>
        </button>

        {/* Clear Trajectory */}
        <button
          onClick={() => clearTrajectory()}
          title="Clear Trajectory Points"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-dobot-surface text-dobot-muted hover:text-dobot-danger transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      {/* Subtle Coordinate Axis Watermark (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] text-dobot-muted/70 font-mono bg-dobot-bg/60 px-2.5 py-1 rounded border border-dobot-border/40">
        <span className="text-red-400 font-semibold">+X Forward</span>
        <span>•</span>
        <span className="text-green-400 font-semibold">+Y Left</span>
        <span>•</span>
        <span className="text-blue-400 font-semibold">+Z Up</span>
      </div>
    </div>
  );
};
