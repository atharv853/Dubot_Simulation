'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useDobotStore, EndEffectorType } from '@/lib/store/useDobotStore';
import { ROBOT_LIMITS } from '@/lib/kinematics';
import {
  CircleDot,
  Power,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Scissors,
  Hand,
  Play,
  ArrowRight,
  MapPin,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

export const OperationPanel: React.FC = () => {
  const {
    cartesian,
    joints,
    speed,
    setSpeed,
    endEffectorType,
    setEndEffectorType,
    endEffectorActive,
    setEndEffectorActive,
    jogCartesian,
    jogJoint,
    moveToCartesianTarget,
    moveToJointTarget,
    executeCustomPickAndPlace,
    isEmergencyStopped,
    isMoving,
    objects,
    pickNearestObject,
    releaseObject,
    suctionHint,
  } = useDobotStore();

  // Mode: 'cartesian' (XYZ) or 'joint' (J1-J4)
  const [mode, setMode] = useState<'cartesian' | 'joint'>('cartesian');

  // Input states for Cartesian (X, Y, Z, R) and Joint (J1, J2, J3, J4)
  const [cartesianInputs, setCartesianInputs] = useState({
    x: cartesian.x.toFixed(2),
    y: cartesian.y.toFixed(2),
    z: cartesian.z.toFixed(2),
    r: cartesian.r.toFixed(2),
  });

  const [jointInputs, setJointInputs] = useState({
    j1: joints.j1.toFixed(2),
    j2: joints.j2.toFixed(2),
    j3: joints.j3.toFixed(2),
    j4: joints.j4.toFixed(2),
  });

  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Custom Pick & Place Source and Destination state (Arbitrary coordinates!)
  const [sourcePoint, setSourcePoint] = useState({ x: 240, y: 100, z: 35, r: 0 });
  const [destPoint, setDestPoint] = useState({ x: 200, y: -100, z: 0, r: 0 });
  const [safeZ, setSafeZ] = useState(100);
  const [cycleStatus, setCycleStatus] = useState<string | null>(null);
  const [isExecutingCycle, setIsExecutingCycle] = useState(false);

  // Sync inputs with live robot position when NOT currently focused/typing
  useEffect(() => {
    if (!activeInput) {
      setCartesianInputs({
        x: cartesian.x.toFixed(2),
        y: cartesian.y.toFixed(2),
        z: cartesian.z.toFixed(2),
        r: cartesian.r.toFixed(2),
      });
      setJointInputs({
        j1: joints.j1.toFixed(2),
        j2: joints.j2.toFixed(2),
        j3: joints.j3.toFixed(2),
        j4: joints.j4.toFixed(2),
      });
    }
  }, [cartesian, joints, activeInput]);

  // Handle Enter or blur to submit value and move robot
  const handleCartesianSubmit = (axis: 'x' | 'y' | 'z' | 'r') => {
    const val = parseFloat(cartesianInputs[axis]);
    if (isNaN(val)) {
      setCartesianInputs((prev) => ({ ...prev, [axis]: cartesian[axis].toFixed(2) }));
      return;
    }
    moveToCartesianTarget({ [axis]: val });
    setActiveInput(null);
  };

  const handleJointSubmit = (joint: 'j1' | 'j2' | 'j3' | 'j4') => {
    const val = parseFloat(jointInputs[joint]);
    if (isNaN(val)) {
      setJointInputs((prev) => ({ ...prev, [joint]: joints[joint].toFixed(2) }));
      return;
    }
    moveToJointTarget({ [joint]: val });
    setActiveInput(null);
  };

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  // Continuous Jog loop logic
  const jogRef = useRef<{
    active: { key: string; sign: number } | null;
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

      const { key, sign } = jogRef.current.active;
      const dt = Math.min(0.05, (time - jogRef.current.lastTime) / 1000);
      jogRef.current.lastTime = time;
      jogRef.current.heldDuration += dt;

      if (jogRef.current.heldDuration > 0.15) {
        const velocityScale = speed / 100;
        let success = true;

        if (mode === 'cartesian') {
          const step = (key === 'r' ? 45 : 75) * velocityScale * dt * sign;
          success = jogCartesian(key as any, step);
        } else {
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
    [speed, isEmergencyStopped, jogCartesian, jogJoint, mode, stopJog]
  );

  const startJog = (key: string, sign: number) => {
    if (isEmergencyStopped) return;
    stopJog();

    if (mode === 'cartesian') {
      const step = (key === 'r' ? (speed >= 50 ? 3 : 1.5) : (speed >= 50 ? 2 : 1)) * sign;
      jogCartesian(key as any, step);
    } else {
      const step = (speed >= 50 ? 2 : 1) * sign;
      jogJoint(key as any, step);
    }

    jogRef.current.active = { key, sign };
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

  const attachedObj = objects.find((o) => o.attachedToTool);

  // Autonomous Pick & Place execution handlers
  const handleRunFullCycle = async () => {
    if (isExecutingCycle || isEmergencyStopped) return;
    setIsExecutingCycle(true);
    setCycleStatus('Starting autonomous cycle...');
    await executeCustomPickAndPlace(sourcePoint, destPoint, safeZ, (msg) => {
      setCycleStatus(msg);
    });
    setIsExecutingCycle(false);
  };

  const handlePickOnly = async () => {
    if (isExecutingCycle || isEmergencyStopped) return;
    setIsExecutingCycle(true);
    setCycleStatus('Approaching Pick Position...');
    setEndEffectorType('suction');
    await moveToCartesianTarget({ x: sourcePoint.x, y: sourcePoint.y, z: safeZ, r: sourcePoint.r }, 1.2);
    setCycleStatus('Descending to Workpiece...');
    await moveToCartesianTarget({ x: sourcePoint.x, y: sourcePoint.y, z: sourcePoint.z, r: sourcePoint.r }, 0.9);
    setCycleStatus('Vacuum Latching...');
    setEndEffectorActive(true);
    await new Promise((r) => setTimeout(r, 400));
    setCycleStatus('Lifting Workpiece (100% visible!)...');
    await moveToCartesianTarget({ x: sourcePoint.x, y: sourcePoint.y, z: safeZ, r: sourcePoint.r }, 1.1);
    setCycleStatus('Pick Complete: Workpiece Held');
    setIsExecutingCycle(false);
  };

  const handlePlaceOnly = async () => {
    if (isExecutingCycle || isEmergencyStopped) return;
    setIsExecutingCycle(true);
    setCycleStatus('Transferring to Destination...');
    await moveToCartesianTarget({ x: destPoint.x, y: destPoint.y, z: safeZ, r: destPoint.r }, 1.3);
    setCycleStatus('Lowering to Destination Surface...');
    await moveToCartesianTarget({ x: destPoint.x, y: destPoint.y, z: destPoint.z + 35, r: destPoint.r }, 0.9);
    setCycleStatus('Releasing Vacuum...');
    setEndEffectorActive(false);
    await new Promise((r) => setTimeout(r, 350));
    setCycleStatus('Retracting to Clearance...');
    await moveToCartesianTarget({ x: destPoint.x, y: destPoint.y, z: safeZ, r: destPoint.r }, 0.8);
    setCycleStatus('Place Complete: Workpiece on Destination');
    setIsExecutingCycle(false);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 space-y-4 select-none">
      {/* ==================== 1. DOBOTSTUDIO JOG PANEL (IMAGE 2 MATCH) ==================== */}
      <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md">
        {/* Top Header: "Coordinate" with Toggle Switch */}
        <div className="flex items-center justify-between mb-4">
          <span className="font-bold text-sm tracking-wide text-dobot-text flex items-center gap-1.5">
            Coordinate
          </span>

          {/* Toggle pill matching Image 2 */}
          <div className="flex items-center p-1 rounded-full bg-dobot-surface border border-dobot-border">
            <button
              onClick={() => setMode('cartesian')}
              className={`flex items-center justify-center w-10 h-7 rounded-full transition-all ${
                mode === 'cartesian'
                  ? 'bg-dobot-accent text-white shadow-sm'
                  : 'text-dobot-muted hover:text-dobot-text'
              }`}
              title="Cartesian Mode (X, Y, Z, R)"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M4 19h16v2H2V4h2v15zm4-6l4-4 3 3 5-5 1.4 1.4-6.4 6.4-3-3-4 4L8 13z" />
              </svg>
            </button>

            <button
              onClick={() => setMode('joint')}
              className={`flex items-center justify-center w-10 h-7 rounded-full transition-all ${
                mode === 'joint'
                  ? 'bg-dobot-accent text-white shadow-sm'
                  : 'text-dobot-muted hover:text-dobot-text'
              }`}
              title="Joint Mode (J1, J2, J3, J4)"
            >
              <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="6" r="3" />
                <path d="M8.5 16.5L15.5 8.5" />
                <path d="M11 18a7 7 0 0 1 7-7" strokeDasharray="2 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Velocity Slider matching Image 2 */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs font-semibold text-dobot-muted w-14">Velocity</span>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 h-1.5 bg-dobot-surface rounded-lg appearance-none cursor-pointer accent-dobot-accent"
            />
            <span className="text-[11px] font-mono text-dobot-muted w-8 text-right font-medium">
              {speed}%
            </span>
          </div>
        </div>

        {/* Main Body: Left (Editable Coordinates) & Right (Circular D-Pad Wheel) */}
        <div className="grid grid-cols-12 gap-3 items-center">
          {/* ---------------- LEFT: EDITABLE & COPIABLE VALUES ---------------- */}
          <div className="col-span-5 space-y-2">
            {mode === 'cartesian' ? (
              <>
                {(['x', 'y', 'z', 'r'] as const).map((axis) => {
                  const colors: Record<string, string> = {
                    x: 'text-red-400',
                    y: 'text-green-400',
                    z: 'text-blue-400',
                    r: 'text-amber-400',
                  };
                  return (
                    <div key={axis} className="flex items-center gap-1.5">
                      <span className={`w-4 text-xs font-bold font-mono uppercase ${colors[axis]}`}>
                        {axis}
                      </span>
                      <div className="relative flex-1 group">
                        <input
                          type="text"
                          value={cartesianInputs[axis]}
                          onFocus={() => setActiveInput(axis)}
                          onChange={(e) =>
                            setCartesianInputs((prev) => ({ ...prev, [axis]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCartesianSubmit(axis);
                          }}
                          onBlur={() => handleCartesianSubmit(axis)}
                          className="w-full px-2.5 py-1.5 rounded-full bg-dobot-inputBg text-dobot-text text-center text-xs font-mono font-semibold border border-dobot-border/60 hover:border-dobot-accent focus:border-dobot-accent focus:outline-none transition-colors"
                          title={`Click to edit ${axis.toUpperCase()}, press Enter to move`}
                        />
                        <button
                          onClick={() => copyToClipboard(cartesianInputs[axis], axis)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-dobot-muted hover:text-dobot-text p-0.5 transition-opacity"
                          title="Copy coordinate"
                        >
                          {copiedKey === axis ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {(['j1', 'j2', 'j3', 'j4'] as const).map((j) => (
                  <div key={j} className="flex items-center gap-1.5">
                    <span className="w-5 text-xs font-bold font-mono uppercase text-purple-400">
                      {j}
                    </span>
                    <div className="relative flex-1 group">
                      <input
                        type="text"
                        value={jointInputs[j]}
                        onFocus={() => setActiveInput(j)}
                        onChange={(e) =>
                          setJointInputs((prev) => ({ ...prev, [j]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleJointSubmit(j);
                        }}
                        onBlur={() => handleJointSubmit(j)}
                        className="w-full px-2.5 py-1.5 rounded-full bg-dobot-inputBg text-dobot-text text-center text-xs font-mono font-semibold border border-dobot-border/60 hover:border-dobot-accent focus:border-dobot-accent focus:outline-none transition-colors"
                        title={`Click to edit ${j.toUpperCase()} angle, press Enter to move`}
                      />
                      <button
                        onClick={() => copyToClipboard(jointInputs[j], j)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-dobot-muted hover:text-dobot-text p-0.5 transition-opacity"
                        title="Copy angle"
                      >
                        {copiedKey === j ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="text-[10px] text-dobot-muted pt-1 flex items-center gap-1">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-dobot-surface border border-dobot-border text-[9px]">Enter</kbd> to move</span>
            </div>
          </div>

          {/* ---------------- RIGHT: CIRCULAR D-PAD WHEEL (IMAGE 2) ---------------- */}
          <div className="col-span-7 flex flex-col items-center justify-center">
            <div className="relative w-44 h-44 rounded-full bg-dobot-wheelBg border border-dobot-border flex items-center justify-center shadow-inner">
              {/* Top button: Y+ or J2+ */}
              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'y' : 'j2', 1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'y' : 'j2', 1)}
                className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-10 rounded-t-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center transition-all pt-1"
                title={mode === 'cartesian' ? 'Jog Y+' : 'Jog J2+'}
              >
                {mode === 'cartesian' ? 'Y+' : 'J2+'}
              </button>

              {/* Bottom button: Y- or J2- */}
              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'y' : 'j2', -1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'y' : 'j2', -1)}
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-10 rounded-b-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center transition-all pb-1"
                title={mode === 'cartesian' ? 'Jog Y-' : 'Jog J2-'}
              >
                {mode === 'cartesian' ? 'Y-' : 'J2-'}
              </button>

              {/* Left button: X- or J1- */}
              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'x' : 'j1', -1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'x' : 'j1', -1)}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-20 rounded-l-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center transition-all pl-1"
                title={mode === 'cartesian' ? 'Jog X-' : 'Jog J1-'}
              >
                {mode === 'cartesian' ? 'X-' : 'J1-'}
              </button>

              {/* Right button: X+ or J1+ */}
              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'x' : 'j1', 1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'x' : 'j1', 1)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-20 rounded-r-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center transition-all pr-1"
                title={mode === 'cartesian' ? 'Jog X+' : 'Jog J1+'}
              >
                {mode === 'cartesian' ? 'X+' : 'J1+'}
              </button>

              {/* Center circular core: Z+ / Z- */}
              <div className="w-20 h-20 rounded-full bg-dobot-panel border border-dobot-border flex flex-col items-center justify-center overflow-hidden z-10 shadow-md">
                <button
                  onMouseDown={() => startJog(mode === 'cartesian' ? 'z' : 'j3', 1)}
                  onTouchStart={() => startJog(mode === 'cartesian' ? 'z' : 'j3', 1)}
                  className="w-full h-1/2 bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center border-b border-dobot-border/60 transition-all"
                  title={mode === 'cartesian' ? 'Jog Z+' : 'Jog J3+'}
                >
                  {mode === 'cartesian' ? 'Z+' : 'J3+'}
                </button>
                <button
                  onMouseDown={() => startJog(mode === 'cartesian' ? 'z' : 'j3', -1)}
                  onTouchStart={() => startJog(mode === 'cartesian' ? 'z' : 'j3', -1)}
                  className="w-full h-1/2 bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs flex items-center justify-center transition-all"
                  title={mode === 'cartesian' ? 'Jog Z-' : 'Jog J3-'}
                >
                  {mode === 'cartesian' ? 'Z-' : 'J3-'}
                </button>
              </div>
            </div>

            {/* Bottom curved R- / R+ */}
            <div className="flex items-center justify-between w-44 mt-2 px-1">
              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'r' : 'j4', -1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'r' : 'j4', -1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs transition-all shadow-sm"
                title={mode === 'cartesian' ? 'Rotate CCW (R-)' : 'Jog Joint 4 -'}
              >
                <span>{mode === 'cartesian' ? 'R-' : 'J4-'}</span>
                <span className="text-[13px]">⤹</span>
              </button>

              <button
                onMouseDown={() => startJog(mode === 'cartesian' ? 'r' : 'j4', 1)}
                onTouchStart={() => startJog(mode === 'cartesian' ? 'r' : 'j4', 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-dobot-text font-bold text-xs transition-all shadow-sm"
                title={mode === 'cartesian' ? 'Rotate CW (R+)' : 'Jog Joint 4 +'}
              >
                <span>{mode === 'cartesian' ? 'R+' : 'J4+'}</span>
                <span className="text-[13px]">⤴</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 2. AUTONOMOUS PICK & PLACE (USER / EXAMINER CUSTOM POINTS) ==================== */}
      <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-dobot-border">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-dobot-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-dobot-text">
              Custom Pick & Place (Arbitrary Points)
            </span>
          </div>
          {cycleStatus && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-dobot-accent/20 text-dobot-accent border border-dobot-accent/40 animate-pulse">
              {cycleStatus}
            </span>
          )}
        </div>

        {/* Source and Destination coordinate inputs grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Source (Pick) Input Card */}
          <div className="p-2.5 rounded-lg bg-dobot-surface border border-dobot-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400">1. Pick Source</span>
              <button
                onClick={() => {
                  const b = objects.find((o) => o.typeId === 'box');
                  if (b) setSourcePoint({ x: b.position[0], y: b.position[1], z: b.position[2] + 35, r: 0 });
                }}
                className="text-[10px] text-dobot-muted hover:text-dobot-text underline"
              >
                Target Block A
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <div>
                <span className="text-[10px] text-dobot-muted">X</span>
                <input
                  type="number"
                  value={sourcePoint.x}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, x: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Y</span>
                <input
                  type="number"
                  value={sourcePoint.y}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, y: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Z</span>
                <input
                  type="number"
                  value={sourcePoint.z}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, z: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
            </div>
          </div>

          {/* Destination (Place) Input Card */}
          <div className="p-2.5 rounded-lg bg-dobot-surface border border-dobot-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-400">2. Place Destination</span>
              <div className="flex items-center gap-1 text-[10px] text-dobot-muted">
                <button
                  onClick={() => setDestPoint({ x: 200, y: -100, z: 0, r: 0 })}
                  className="hover:text-dobot-text underline"
                  title="Place on table surface"
                >
                  Table
                </button>
                <span>|</span>
                <button
                  onClick={() => setDestPoint({ x: 240, y: -100, z: 18, r: 0 })}
                  className="hover:text-dobot-text underline"
                  title="Place on weighing scale"
                >
                  Scale
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <div>
                <span className="text-[10px] text-dobot-muted">X</span>
                <input
                  type="number"
                  value={destPoint.x}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, x: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Y</span>
                <input
                  type="number"
                  value={destPoint.y}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, y: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Z</span>
                <input
                  type="number"
                  value={destPoint.z}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, z: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1.5 py-1 rounded bg-dobot-inputBg text-dobot-text text-center text-xs font-bold border border-dobot-border/60"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons: Full Cycle, Pick Only, Place Only */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={handleRunFullCycle}
            disabled={isEmergencyStopped || isMoving || isExecutingCycle}
            className="col-span-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-dobot-success hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-dobot-success/20 transition-all active:scale-95"
            title="Execute full autonomous pick, transfer, and place cycle"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Cycle</span>
          </button>

          <button
            onClick={handlePickOnly}
            disabled={isEmergencyStopped || isMoving || isExecutingCycle || Boolean(attachedObj)}
            className="flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-dobot-accent hover:bg-dobot-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            title="Approach Source, engage suction, and lift workpiece"
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Pick Only</span>
          </button>

          <button
            onClick={handlePlaceOnly}
            disabled={isEmergencyStopped || isMoving || isExecutingCycle || !attachedObj}
            className="flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border disabled:opacity-40 disabled:cursor-not-allowed text-dobot-text text-xs font-semibold transition-all active:scale-95"
            title="Transfer held workpiece and drop on destination surface"
          >
            <RotateCcw className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Place Only</span>
          </button>
        </div>
      </div>

      {/* ==================== 3. ADVANCED END-EFFECTOR & SUCTION CUP SECTION ==================== */}
      <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-dobot-border/60">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-dobot-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-dobot-text">
              Pneumatic Suction Cup & Tools
            </span>
          </div>

          <button
            onClick={() => setEndEffectorActive(!endEffectorActive)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
              endEffectorActive
                ? 'bg-dobot-success text-white shadow-dobot-success/30 hover:bg-green-600'
                : 'bg-dobot-surface text-dobot-muted hover:text-dobot-text border border-dobot-border'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{endEffectorActive ? 'VACUUM ON' : 'STANDBY OFF'}</span>
          </button>
        </div>

        {/* Accessory Selector */}
        <div className="grid grid-cols-3 gap-2 mb-3">
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
              className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg border text-xs font-semibold transition-all ${
                endEffectorType === tool.id
                  ? 'bg-dobot-accent/15 border-dobot-accent text-dobot-text shadow-sm'
                  : 'bg-dobot-surface border-dobot-border/70 text-dobot-muted hover:text-dobot-text'
              }`}
            >
              <div className="mb-0.5 text-dobot-accent">{tool.icon}</div>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>

        {/* Suction Vacuum State & Quick Actions */}
        {endEffectorType === 'suction' && (
          <div className="p-3 rounded-lg bg-dobot-surface/70 border border-dobot-border/70 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-dobot-muted">Vacuum Status:</span>
              <span
                className={`font-mono font-bold ${
                  endEffectorActive
                    ? attachedObj
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                    : 'text-dobot-muted'
                }`}
              >
                {endEffectorActive ? (attachedObj ? '-85.4 kPa (LATCHED TO WORKPIECE)' : '-32.0 kPa (OPEN AIR)') : '0.0 kPa (OFF)'}
              </span>
            </div>

            {/* Quick 1-Click Pick / Drop Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={pickNearestObject}
                disabled={isEmergencyStopped || isMoving || Boolean(attachedObj)}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-dobot-accent hover:bg-dobot-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition-all"
                title="Automatically navigate to nearest cube and pick it up with suction"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Pick Nearest Block</span>
              </button>

              <button
                onClick={releaseObject}
                disabled={isEmergencyStopped || !attachedObj}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border disabled:opacity-40 disabled:cursor-not-allowed text-dobot-text text-xs font-semibold transition-all"
                title="Release currently held object"
              >
                <RotateCcw className="w-3.5 h-3.5 text-dobot-accent" />
                <span>Drop / Release</span>
              </button>
            </div>

            {suctionHint && (
              <div className="text-[11px] text-dobot-muted font-mono bg-dobot-panel px-2.5 py-1 rounded border border-dobot-border/60">
                {suctionHint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
