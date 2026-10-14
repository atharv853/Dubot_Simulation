'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useDobotStore, EndEffectorType } from '@/lib/store/useDobotStore';
import { ROBOT_LIMITS } from '@/lib/kinematics';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  RotateCcw,
  Plus,
  Minus,
  Sparkles,
  Scissors,
  CircleDot,
  Power,
  Gauge,
  HelpCircle,
} from 'lucide-react';

interface JogTarget {
  mode: 'cartesian' | 'joint';
  key: string;
  sign: number;
}

export const OperationPanel: React.FC = () => {
  const {
    cartesian,
    joints,
    speed,
    endEffectorType,
    setEndEffectorType,
    endEffectorActive,
    setEndEffectorActive,
    jogCartesian,
    jogJoint,
    isEmergencyStopped,
  } = useDobotStore();

  const [jogMode, setJogMode] = useState<'cartesian' | 'joint'>('cartesian');

  // Ref for continuous jog loop
  const jogRef = useRef<{
    active: JogTarget | null;
    rafId: number | null;
    lastTime: number;
    heldDuration: number;
  }>({
    active: null,
    rafId: null,
    lastTime: 0,
    heldDuration: 0,
  });

  const stopJog = useCallback(() => {
    if (jogRef.current.rafId) {
      cancelAnimationFrame(jogRef.current.rafId);
      jogRef.current.rafId = null;
    }
    jogRef.current.active = null;
    jogRef.current.heldDuration = 0;
  }, []);

  const runJogStep = useCallback(
    (time: number) => {
      if (!jogRef.current.active || isEmergencyStopped) {
        stopJog();
        return;
      }

      const { mode, key, sign } = jogRef.current.active;
      const dt = Math.min(0.05, (time - jogRef.current.lastTime) / 1000);
      jogRef.current.lastTime = time;
      jogRef.current.heldDuration += dt;

      // Only run continuous stream after 180ms hold threshold
      if (jogRef.current.heldDuration > 0.18) {
        let success = true;
        const velocityScale = (speed / 100);

        if (mode === 'cartesian') {
          // 70 mm/s base velocity
          const step = 70 * velocityScale * dt * sign;
          success = jogCartesian(key as any, step);
        } else {
          // 45 deg/s base velocity
          const step = 45 * velocityScale * dt * sign;
          success = jogJoint(key as any, step);
        }

        if (!success) {
          stopJog();
          return;
        }
      }

      jogRef.current.rafId = requestAnimationFrame(runJogStep);
    },
    [speed, isEmergencyStopped, jogCartesian, jogJoint, stopJog]
  );

  const startJog = (target: JogTarget) => {
    if (isEmergencyStopped) return;
    stopJog();

    // 1. Trigger immediate discrete click step
    if (target.mode === 'cartesian') {
      const singleStep = (speed >= 50 ? 2 : 1) * target.sign;
      jogCartesian(target.key as any, singleStep);
    } else {
      const singleStep = (speed >= 50 ? 1.5 : 1) * target.sign;
      jogJoint(target.key as any, singleStep);
    }

    // 2. Queue continuous hold loop
    jogRef.current.active = target;
    jogRef.current.lastTime = performance.now();
    jogRef.current.heldDuration = 0;
    jogRef.current.rafId = requestAnimationFrame(runJogStep);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => stopJog();
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      stopJog();
    };
  }, [stopJog]);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 space-y-4 select-none">
      {/* ---------------- LIVE READOUTS DISPLAY ---------------- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cartesian Coordinates Readout */}
        <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-dobot-border/50">
            <span className="text-xs font-semibold text-dobot-muted uppercase tracking-wider">
              Cartesian (mm)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-dobot-accent font-mono font-medium">
              World TCP
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-red-400 font-bold">X:</span>
              <span className="text-dobot-text font-semibold">{cartesian.x.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-green-400 font-bold">Y:</span>
              <span className="text-dobot-text font-semibold">{cartesian.y.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-blue-400 font-bold">Z:</span>
              <span className="text-dobot-text font-semibold">{cartesian.z.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-amber-400 font-bold">R:</span>
              <span className="text-dobot-text font-semibold">{cartesian.r.toFixed(2)}°</span>
            </div>
          </div>
        </div>

        {/* Joint Angles Readout */}
        <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-dobot-border/50">
            <span className="text-xs font-semibold text-dobot-muted uppercase tracking-wider">
              Joint Angles (deg)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono font-medium">
              4-DOF FK
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-purple-400 font-bold">J1:</span>
              <span className="text-dobot-text">{joints.j1.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-purple-400 font-bold">J2:</span>
              <span className="text-dobot-text">{joints.j2.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-purple-400 font-bold">J3:</span>
              <span className="text-dobot-text">{joints.j3.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
              <span className="text-purple-400 font-bold">J4:</span>
              <span className="text-dobot-text">{joints.j4.toFixed(2)}°</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- END-EFFECTOR CONTROLLER ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-dobot-accent" />
            <span className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
              End-Effector Accessory
            </span>
          </div>
          {/* Tool On/Off Toggle Button */}
          <button
            onClick={() => setEndEffectorActive(!endEffectorActive)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm ${
              endEffectorActive
                ? 'bg-dobot-success text-white shadow-dobot-success/30 hover:bg-green-600'
                : 'bg-dobot-surface text-dobot-muted hover:text-white border border-dobot-border'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{endEffectorActive ? 'ACTIVE (ON)' : 'STANDBY (OFF)'}</span>
          </button>
        </div>

        {/* Accessory Radio Selector */}
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'suction', label: 'Suction Cup', icon: <CircleDot className="w-4 h-4" /> },
              { id: 'gripper', label: 'Gripper', icon: <Scissors className="w-4 h-4" /> },
              { id: 'laser', label: 'Laser Module', icon: <Sparkles className="w-4 h-4" /> },
            ] as { id: EndEffectorType; label: string; icon: React.ReactNode }[]
          ).map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                setEndEffectorType(tool.id);
                setEndEffectorActive(false);
              }}
              className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                endEffectorType === tool.id
                  ? 'bg-dobot-accent/15 border-dobot-accent text-white shadow-sm'
                  : 'bg-dobot-surface border-dobot-border/70 text-dobot-muted hover:text-white hover:bg-dobot-border/50'
              }`}
            >
              <div className="mb-1 text-dobot-accent">{tool.icon}</div>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- JOG CONTROLS ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
        {/* Jog Mode Switcher */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-dobot-border/50">
          <div className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
            Jog Motion Control
          </div>
          <div className="flex p-0.5 rounded-lg bg-dobot-bg border border-dobot-border/60 text-xs">
            <button
              onClick={() => setJogMode('cartesian')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                jogMode === 'cartesian'
                  ? 'bg-dobot-accent text-white shadow-sm'
                  : 'text-dobot-muted hover:text-white'
              }`}
            >
              Cartesian (IK)
            </button>
            <button
              onClick={() => setJogMode('joint')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                jogMode === 'joint'
                  ? 'bg-dobot-accent text-white shadow-sm'
                  : 'text-dobot-muted hover:text-white'
              }`}
            >
              Joint (FK)
            </button>
          </div>
        </div>

        {/* ---------------- CARTESIAN JOG BUTTONS ---------------- */}
        {jogMode === 'cartesian' ? (
          <div className="space-y-2">
            <div className="text-[11px] text-dobot-muted flex items-center justify-between">
              <span>Click for step, hold for continuous velocity jog</span>
              <span className="text-[10px] text-dobot-accent">IK Solver Active</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* X Jog */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <span className="text-xs font-bold text-red-400 font-mono w-8">X Axis</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'x', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'x', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog X-"
                  >
                    X-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'x', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'x', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog X+"
                  >
                    X+
                  </button>
                </div>
              </div>

              {/* Y Jog */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <span className="text-xs font-bold text-green-400 font-mono w-8">Y Axis</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'y', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'y', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog Y-"
                  >
                    Y-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'y', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'y', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog Y+"
                  >
                    Y+
                  </button>
                </div>
              </div>

              {/* Z Jog */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <span className="text-xs font-bold text-blue-400 font-mono w-8">Z Axis</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'z', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'z', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog Z-"
                  >
                    Z-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'z', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'z', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog Z+"
                  >
                    Z+
                  </button>
                </div>
              </div>

              {/* R Jog (Rotation) */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <span className="text-xs font-bold text-amber-400 font-mono w-8">R Rot</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'r', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'r', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog R-"
                  >
                    R-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'cartesian', key: 'r', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'cartesian', key: 'r', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Jog R+"
                  >
                    R+
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ---------------- JOINT JOG BUTTONS ---------------- */
          <div className="space-y-2">
            <div className="text-[11px] text-dobot-muted flex items-center justify-between">
              <span>Direct motor angle control with soft limit guarding</span>
              <span className="text-[10px] text-purple-400">FK Synced</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Joint 1 */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-purple-300 font-mono">Joint 1</span>
                  <span className="text-[10px] text-dobot-muted">[-90°, 90°]</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j1', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j1', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 1 Negative"
                  >
                    J1-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j1', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j1', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 1 Positive"
                  >
                    J1+
                  </button>
                </div>
              </div>

              {/* Joint 2 */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-purple-300 font-mono">Joint 2</span>
                  <span className="text-[10px] text-dobot-muted">[0°, 85°]</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j2', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j2', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 2 Negative"
                  >
                    J2-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j2', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j2', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 2 Positive"
                  >
                    J2+
                  </button>
                </div>
              </div>

              {/* Joint 3 */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-purple-300 font-mono">Joint 3</span>
                  <span className="text-[10px] text-dobot-muted">[-10°, 90°]</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j3', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j3', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 3 Negative"
                  >
                    J3-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j3', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j3', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 3 Positive"
                  >
                    J3+
                  </button>
                </div>
              </div>

              {/* Joint 4 */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-dobot-surface border border-dobot-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-purple-300 font-mono">Joint 4</span>
                  <span className="text-[10px] text-dobot-muted">[-90°, 90°]</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j4', sign: -1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j4', sign: -1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 4 Negative"
                  >
                    J4-
                  </button>
                  <button
                    onMouseDown={() => startJog({ mode: 'joint', key: 'j4', sign: 1 })}
                    onTouchStart={() => startJog({ mode: 'joint', key: 'j4', sign: 1 })}
                    className="w-10 h-8 rounded bg-dobot-panel hover:bg-dobot-accent hover:text-white text-dobot-text border border-dobot-border/80 flex items-center justify-center font-bold text-xs transition-colors active:scale-95"
                    title="Joint 4 Positive"
                  >
                    J4+
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- SHORTCUT CHEAT-SHEET ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel/60 border border-dobot-border/50 text-[11px] text-dobot-muted">
        <div className="flex items-center gap-1.5 font-semibold text-dobot-text mb-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-dobot-accent" />
          <span>Operator Tip</span>
        </div>
        <p>
          Single click steps by 1–2 units. Hold button to jog continuously at the scale of the top speed slider. Forward Kinematics and Inverse Kinematics remain synchronized in real-time.
        </p>
      </div>
    </div>
  );
};
