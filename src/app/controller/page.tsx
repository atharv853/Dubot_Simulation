'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useControllerSync } from '@/lib/realtime/useControllerSync';
import { EndEffectorType } from '@/lib/store/useDobotStore';
import {
  Wifi,
  WifiOff,
  Radio,
  OctagonAlert,
  Home,
  RotateCcw,
  Sliders,
  MapPin,
  CircleDot,
  Power,
  Hand,
  Play,
  Scissors,
  Sparkles,
  LogOut,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Smartphone,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';

export default function MobileControllerPage() {
  const router = useRouter();
  const {
    isConnected,
    hostOnline,
    robotState,
    lastCommand,
    activeCycleStep,
    sendMoveTo,
    sendJogAxis,
    sendJogJoint,
    sendSetSpeed,
    sendSetTool,
    sendSetSuction,
    sendPickAndPlace,
    sendPickOnly,
    sendPlaceOnly,
    sendEmergencyStop,
    sendReset,
    sendHome,
  } = useControllerSync('test');

  // Jog mode: 'cartesian' (XYZ) or 'joint' (J1-J4)
  const [jogMode, setJogMode] = useState<'cartesian' | 'joint'>('cartesian');

  // Coordinate target input fields
  const [targetInputs, setTargetInputs] = useState({
    x: '250.72',
    y: '0.00',
    z: '67.47',
    r: '0.00',
  });
  const [isTyping, setIsTyping] = useState(false);

  // Sync inputs with live robot state when user is not actively typing
  useEffect(() => {
    if (!isTyping && robotState) {
      setTargetInputs({
        x: robotState.x.toFixed(2),
        y: robotState.y.toFixed(2),
        z: robotState.z.toFixed(2),
        r: robotState.r.toFixed(2),
      });
    }
  }, [robotState?.x, robotState?.y, robotState?.z, robotState?.r, isTyping, robotState]);

  // Pick & Place inputs
  const [sourcePoint, setSourcePoint] = useState({ x: 240, y: 100, z: 35, r: 0 });
  const [destPoint, setDestPoint] = useState({ x: 200, y: -100, z: 0, r: 0 });
  const [safeZ, setSafeZ] = useState(100);

  // Velocity slider
  const currentSpeed = robotState?.velocity || 50;

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('dobot_auth_token');
      localStorage.removeItem('dobot_user');
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  // Handle explicit "Move" button click
  const handleMoveSubmit = () => {
    const x = parseFloat(targetInputs.x);
    const y = parseFloat(targetInputs.y);
    const z = parseFloat(targetInputs.z);
    const r = parseFloat(targetInputs.r);

    if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(r)) return;
    sendMoveTo(x, y, z, r);
    setIsTyping(false);
  };

  // Continuous Jog loop logic for Mobile D-Pad
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
      if (!jogRef.current.active || !hostOnline || robotState?.isEmergencyStopped) {
        stopJog();
        return;
      }

      const { key, sign } = jogRef.current.active;
      const dt = Math.min(0.05, (time - jogRef.current.lastTime) / 1000);
      jogRef.current.lastTime = time;
      jogRef.current.heldDuration += dt;

      // Rate limit continuous jogging messages over websocket
      if (jogRef.current.heldDuration > 0.18) {
        jogRef.current.heldDuration = 0;
        const delta = (key === 'r' ? 4 : 3) * sign;
        if (jogMode === 'cartesian') {
          sendJogAxis(key as any, delta);
        } else {
          sendJogJoint(key as any, delta);
        }
      }

      jogRef.current.rafId = requestAnimationFrame(runJogStep);
    },
    [hostOnline, robotState?.isEmergencyStopped, jogMode, sendJogAxis, sendJogJoint, stopJog]
  );

  const startJog = (key: string, sign: number) => {
    if (!hostOnline || robotState?.isEmergencyStopped) return;
    stopJog();

    // Initial instant step
    const delta = (key === 'r' ? 3 : 2) * sign;
    if (jogMode === 'cartesian') {
      sendJogAxis(key as any, delta);
    } else {
      sendJogJoint(key as any, delta);
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
    window.addEventListener('touchcancel', handleGlobalMouseUp);
    window.addEventListener('contextmenu', stopJog);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('touchcancel', handleGlobalMouseUp);
      window.removeEventListener('contextmenu', stopJog);
      stopJog();
    };
  }, [stopJog]);

  const isRobotBusy = robotState?.robotStatus === 'moving' || robotState?.robotStatus === 'executing';

  return (
    <div className="min-h-screen w-full bg-dobot-bg text-dobot-text flex flex-col select-none overflow-x-hidden pb-12">
      {/* ============================================================== */}
      {/* TOP HEADER: Branding, Status & Logout                          */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 w-full bg-dobot-panel/95 backdrop-blur-md border-b border-dobot-border px-3.5 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-dobot-accent flex items-center justify-center font-black text-white shadow-sm shadow-dobot-accent/40 text-sm">
            D
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight text-white">
              <span>DOBOT</span>
              <span className="text-dobot-accent">Controller</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-dobot-surface text-emerald-400 border border-dobot-border font-mono font-bold">
                MOBILE
              </span>
            </div>
            <div className="text-[10px] text-dobot-muted flex items-center gap-1">
              <span>User:</span>
              <span className="font-semibold text-white">test</span>
              <span>•</span>
              <span className="font-mono text-dobot-accent">dobot-main</span>
            </div>
          </div>
        </div>

        {/* Right Header: E-STOP & Logout */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendEmergencyStop()}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black shadow-md transition-all active:scale-95 ${
              robotState?.isEmergencyStopped
                ? 'bg-red-600 text-white border border-white animate-pulse'
                : 'bg-dobot-danger hover:bg-dobot-dangerHover text-white shadow-dobot-danger/30'
            }`}
            title="Instant Emergency Stop"
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            <span>{robotState?.isEmergencyStopped ? 'E-STOPPED' : 'E-STOP'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-muted hover:text-white transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* SECTION D: CONNECTION STATUS & ROBOT ACTIVITY BANNER          */}
      {/* ============================================================== */}
      <section className="px-3.5 pt-3 space-y-2">
        <div className="p-3 rounded-xl bg-dobot-panel border border-dobot-border shadow-sm space-y-2.5">
          {/* Status Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Host Online Status */}
            <div
              className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                hostOnline
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  hostOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                  Host Simulator
                </span>
                <span className="font-extrabold text-xs truncate">
                  {hostOnline ? 'ONLINE (Laptop)' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* Robot Activity Status */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-dobot-surface border border-dobot-border">
              <Radio
                className={`w-3.5 h-3.5 ${
                  robotState?.isEmergencyStopped
                    ? 'text-red-500 animate-spin'
                    : isRobotBusy
                    ? 'text-amber-400 animate-pulse'
                    : 'text-dobot-accent'
                }`}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-dobot-muted">
                  Robot State
                </span>
                <span className="font-extrabold text-xs text-white truncate uppercase">
                  {robotState?.isEmergencyStopped
                    ? 'E-STOP HALT'
                    : robotState?.robotStatus || 'IDLE'}
                </span>
              </div>
            </div>
          </div>

          {/* Warning banner when host is offline */}
          {!hostOnline && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold animate-pulse">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Host laptop is currently offline. Open simulator on laptop as atharv.</span>
            </div>
          )}

          {/* Active Cycle Step Banner */}
          {activeCycleStep && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-dobot-accent/15 border border-dobot-accent/40 text-sky-300 text-xs font-mono font-bold animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-dobot-accent shrink-0" />
              <span className="truncate">{activeCycleStep}</span>
            </div>
          )}

          {/* Last Command Status Pill */}
          {lastCommand && (
            <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-dobot-surface/70 border border-dobot-border/60">
              <span className="text-dobot-muted font-medium">Last Command:</span>
              <span
                className={`font-mono font-bold flex items-center gap-1 ${
                  lastCommand.status === 'completed'
                    ? 'text-emerald-400'
                    : lastCommand.status === 'rejected' || lastCommand.status === 'failed'
                    ? 'text-red-400'
                    : 'text-amber-400'
                }`}
              >
                <span>{lastCommand.type}</span>
                <span>({lastCommand.status.toUpperCase()})</span>
              </span>
            </div>
          )}
        </div>

        {/* Live Authoritative Coordinates Display */}
        <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
          <div className="p-2 rounded-lg bg-dobot-panel border border-dobot-border">
            <span className="text-[10px] text-red-400 font-bold block">X</span>
            <span className="text-xs font-black text-white">{robotState?.x.toFixed(1) ?? '250.7'}</span>
            <span className="text-[9px] text-dobot-muted block">mm</span>
          </div>
          <div className="p-2 rounded-lg bg-dobot-panel border border-dobot-border">
            <span className="text-[10px] text-emerald-400 font-bold block">Y</span>
            <span className="text-xs font-black text-white">{robotState?.y.toFixed(1) ?? '0.0'}</span>
            <span className="text-[9px] text-dobot-muted block">mm</span>
          </div>
          <div className="p-2 rounded-lg bg-dobot-panel border border-dobot-border">
            <span className="text-[10px] text-sky-400 font-bold block">Z</span>
            <span className="text-xs font-black text-white">{robotState?.z.toFixed(1) ?? '67.5'}</span>
            <span className="text-[9px] text-dobot-muted block">mm</span>
          </div>
          <div className="p-2 rounded-lg bg-dobot-panel border border-dobot-border">
            <span className="text-[10px] text-amber-400 font-bold block">R</span>
            <span className="text-xs font-black text-white">{robotState?.r.toFixed(1) ?? '0.0'}</span>
            <span className="text-[9px] text-dobot-muted block">deg</span>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION A: COORDINATE CONTROLS & D-PAD JOG                     */}
      {/* ============================================================== */}
      <section className="px-3.5 pt-3">
        <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md space-y-4">
          {/* Header & Mode Switch */}
          <div className="flex items-center justify-between pb-2 border-b border-dobot-border/60">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-dobot-accent" />
              <span className="text-xs font-bold uppercase tracking-wide text-white">
                Coordinate Controls
              </span>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center p-0.5 rounded-full bg-dobot-surface border border-dobot-border">
              <button
                onClick={() => setJogMode('cartesian')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                  jogMode === 'cartesian'
                    ? 'bg-dobot-accent text-white shadow-sm'
                    : 'text-dobot-muted hover:text-white'
                }`}
              >
                XYZ
              </button>
              <button
                onClick={() => setJogMode('joint')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                  jogMode === 'joint'
                    ? 'bg-dobot-accent text-white shadow-sm'
                    : 'text-dobot-muted hover:text-white'
                }`}
              >
                Joint
              </button>
            </div>
          </div>

          {/* Velocity Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-dobot-muted">Velocity</span>
              <span className="font-mono font-bold text-dobot-accent">{currentSpeed}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={currentSpeed}
              onChange={(e) => sendSetSpeed(Number(e.target.value))}
              className="w-full h-2 bg-dobot-surface rounded-lg appearance-none cursor-pointer accent-dobot-accent"
            />
          </div>

          {/* Absolute Coordinate Input Fields + Dedicated "Move" Button */}
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
              {(['x', 'y', 'z', 'r'] as const).map((axis) => {
                const colorMap = {
                  x: 'border-red-500/40 focus:border-red-400 text-red-400',
                  y: 'border-emerald-500/40 focus:border-emerald-400 text-emerald-400',
                  z: 'border-sky-500/40 focus:border-sky-400 text-sky-400',
                  r: 'border-amber-500/40 focus:border-amber-400 text-amber-400',
                };
                return (
                  <div key={axis} className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-dobot-muted block text-center">
                      {axis}
                    </span>
                    <input
                      type="number"
                      step={0.5}
                      value={targetInputs[axis]}
                      onFocus={() => setIsTyping(true)}
                      onChange={(e) => {
                        setIsTyping(true);
                        setTargetInputs((prev) => ({ ...prev, [axis]: e.target.value }));
                      }}
                      onBlur={() => setIsTyping(false)}
                      className={`w-full py-2 px-1 text-center font-bold text-xs rounded-lg bg-dobot-inputBg border ${colorMap[axis]} focus:outline-none`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Dedicated "Move" Button */}
            <button
              onClick={handleMoveSubmit}
              disabled={!hostOnline || isRobotBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-dobot-accent hover:bg-dobot-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-dobot-accent/25 transition-all active:scale-[0.98]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Move to Coordinates</span>
            </button>
          </div>

          {/* Directional Jog D-Pad Wheel for Touch (Mobile Centered) */}
          <div className="flex flex-col items-center pt-2">
            <div className="relative w-44 h-44 rounded-full bg-dobot-wheelBg border border-dobot-border flex items-center justify-center shadow-inner">
              {/* Y+ / J2+ (Top) */}
              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'y' : 'j2', 1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'y' : 'j2', 1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-11 rounded-t-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center pt-1 transition-all disabled:opacity-40"
              >
                {jogMode === 'cartesian' ? 'Y+' : 'J2+'}
              </button>

              {/* Y- / J2- (Bottom) */}
              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'y' : 'j2', -1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'y' : 'j2', -1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-11 rounded-b-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center pb-1 transition-all disabled:opacity-40"
              >
                {jogMode === 'cartesian' ? 'Y-' : 'J2-'}
              </button>

              {/* X- / J1- (Left) */}
              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'x' : 'j1', -1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'x' : 'j1', -1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-20 rounded-l-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center pl-1 transition-all disabled:opacity-40"
              >
                {jogMode === 'cartesian' ? 'X-' : 'J1-'}
              </button>

              {/* X+ / J1+ (Right) */}
              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'x' : 'j1', 1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'x' : 'j1', 1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-20 rounded-r-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center pr-1 transition-all disabled:opacity-40"
              >
                {jogMode === 'cartesian' ? 'X+' : 'J1+'}
              </button>

              {/* Center Core: Z+ / Z- */}
              <div className="w-20 h-20 rounded-full bg-dobot-panel border border-dobot-border flex flex-col items-center justify-center overflow-hidden z-10 shadow-md">
                <button
                  onMouseDown={() => startJog(jogMode === 'cartesian' ? 'z' : 'j3', 1)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startJog(jogMode === 'cartesian' ? 'z' : 'j3', 1);
                  }}
                  disabled={!hostOnline || isRobotBusy}
                  className="w-full h-1/2 bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center border-b border-dobot-border/60 transition-all disabled:opacity-40"
                >
                  {jogMode === 'cartesian' ? 'Z+' : 'J3+'}
                </button>
                <button
                  onMouseDown={() => startJog(jogMode === 'cartesian' ? 'z' : 'j3', -1)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startJog(jogMode === 'cartesian' ? 'z' : 'j3', -1);
                  }}
                  disabled={!hostOnline || isRobotBusy}
                  className="w-full h-1/2 bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs flex items-center justify-center transition-all disabled:opacity-40"
                >
                  {jogMode === 'cartesian' ? 'Z-' : 'J3-'}
                </button>
              </div>
            </div>

            {/* R- / R+ Buttons */}
            <div className="flex items-center justify-between w-44 mt-2 px-1">
              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'r' : 'j4', -1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'r' : 'j4', -1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="flex items-center gap-1 px-3 py-2 rounded-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs transition-all shadow-sm disabled:opacity-40"
              >
                <span>{jogMode === 'cartesian' ? 'R-' : 'J4-'}</span>
                <span className="text-sm">⤹</span>
              </button>

              <button
                onMouseDown={() => startJog(jogMode === 'cartesian' ? 'r' : 'j4', 1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startJog(jogMode === 'cartesian' ? 'r' : 'j4', 1);
                }}
                disabled={!hostOnline || isRobotBusy}
                className="flex items-center gap-1 px-3 py-2 rounded-full bg-dobot-wheelBtn hover:bg-dobot-wheelHover active:bg-dobot-accent active:text-white text-white font-bold text-xs transition-all shadow-sm disabled:opacity-40"
              >
                <span>{jogMode === 'cartesian' ? 'R+' : 'J4+'}</span>
                <span className="text-sm">⤴</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION B: CUSTOM PICK & PLACE                                 */}
      {/* ============================================================== */}
      <section className="px-3.5 pt-3">
        <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-dobot-border/60">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wide text-white">
                Custom Pick & Place
              </span>
            </div>
          </div>

          {/* Pick Source Card */}
          <div className="p-2.5 rounded-lg bg-dobot-surface border border-dobot-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400">1. Source Point</span>
              <button
                onClick={() => setSourcePoint({ x: 240, y: 100, z: 35, r: 0 })}
                className="text-[10px] text-dobot-muted hover:text-white underline"
              >
                Preset Block A
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <div>
                <span className="text-[10px] text-dobot-muted">X</span>
                <input
                  type="number"
                  value={sourcePoint.x}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, x: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Y</span>
                <input
                  type="number"
                  value={sourcePoint.y}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, y: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Z</span>
                <input
                  type="number"
                  value={sourcePoint.z}
                  onChange={(e) => setSourcePoint((prev) => ({ ...prev, z: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
            </div>
          </div>

          {/* Place Destination Card */}
          <div className="p-2.5 rounded-lg bg-dobot-surface border border-dobot-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-400">2. Destination Point</span>
              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  onClick={() => setDestPoint({ x: 200, y: -100, z: 0, r: 0 })}
                  className="text-dobot-muted hover:text-white underline"
                >
                  Table
                </button>
                <span>|</span>
                <button
                  onClick={() => setDestPoint({ x: 240, y: -100, z: 18, r: 0 })}
                  className="text-dobot-muted hover:text-white underline"
                >
                  Scale
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <div>
                <span className="text-[10px] text-dobot-muted">X</span>
                <input
                  type="number"
                  value={destPoint.x}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, x: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Y</span>
                <input
                  type="number"
                  value={destPoint.y}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, y: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
              <div>
                <span className="text-[10px] text-dobot-muted">Z</span>
                <input
                  type="number"
                  value={destPoint.z}
                  onChange={(e) => setDestPoint((prev) => ({ ...prev, z: parseFloat(e.target.value) || 0 }))}
                  className="w-full py-1 px-1 rounded bg-dobot-inputBg text-white text-center font-bold border border-dobot-border"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons: Run Cycle, Pick Only, Place Only */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={() => sendPickAndPlace(sourcePoint, destPoint, safeZ)}
              disabled={!hostOnline || isRobotBusy}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-dobot-success hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-dobot-success/20 transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Cycle</span>
            </button>

            <button
              onClick={() => sendPickOnly()}
              disabled={!hostOnline || isRobotBusy}
              className="flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl bg-dobot-accent hover:bg-dobot-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-sm transition-all active:scale-95"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Pick Only</span>
            </button>

            <button
              onClick={() => sendPlaceOnly()}
              disabled={!hostOnline || isRobotBusy}
              className="flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl bg-dobot-surface hover:bg-dobot-border border border-dobot-border disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs transition-all active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-dobot-accent" />
              <span>Place Only</span>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION C: PNEUMATIC TOOLS & SUCTION CUP                       */}
      {/* ============================================================== */}
      <section className="px-3.5 pt-3">
        <div className="p-4 rounded-xl bg-dobot-panel border border-dobot-border shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-dobot-border/60">
            <div className="flex items-center gap-1.5">
              <CircleDot className="w-4 h-4 text-dobot-accent" />
              <span className="text-xs font-bold uppercase tracking-wide text-white">
                Pneumatic Tools
              </span>
            </div>

            {/* Suction ON / OFF Toggle */}
            <button
              onClick={() => sendSetSuction(!robotState?.suctionEnabled)}
              disabled={!hostOnline || isRobotBusy}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
                robotState?.suctionEnabled
                  ? 'bg-dobot-success text-white shadow-dobot-success/30'
                  : 'bg-dobot-surface text-dobot-muted hover:text-white border border-dobot-border'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{robotState?.suctionEnabled ? 'VACUUM ON' : 'STANDBY OFF'}</span>
            </button>
          </div>

          {/* Accessory Selector Tabs */}
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
                onClick={() => sendSetTool(tool.id)}
                disabled={!hostOnline || isRobotBusy}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs font-semibold transition-all ${
                  robotState?.activeTool === tool.id
                    ? 'bg-dobot-accent/15 border-dobot-accent text-white shadow-sm'
                    : 'bg-dobot-surface border-dobot-border text-dobot-muted hover:text-white'
                }`}
              >
                <div className="mb-0.5 text-dobot-accent">{tool.icon}</div>
                <span className="text-[11px]">{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Vacuum Gauge Pressure Indicator */}
          <div className="p-2.5 rounded-lg bg-dobot-surface/70 border border-dobot-border flex items-center justify-between text-xs">
            <span className="text-dobot-muted font-medium">Vacuum Pressure:</span>
            <span
              className={`font-mono font-bold ${
                robotState?.suctionEnabled
                  ? robotState?.attachedObjectName
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                  : 'text-dobot-muted'
              }`}
            >
              {robotState?.suctionEnabled
                ? robotState?.attachedObjectName
                  ? `-85.4 kPa (${robotState.attachedObjectName.toUpperCase()})`
                  : '-32.0 kPa (OPEN AIR)'
                : '0.0 kPa (OFF)'}
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SYSTEM CONTROLS: Home & Reset                                 */}
      {/* ============================================================== */}
      <section className="px-3.5 pt-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => sendHome()}
            disabled={!hostOnline || isRobotBusy}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-dobot-panel hover:bg-dobot-surface border border-dobot-border font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-40"
          >
            <Home className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Home Reference</span>
          </button>

          <button
            onClick={() => sendReset()}
            disabled={!hostOnline}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-dobot-panel hover:bg-dobot-surface border border-dobot-border font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Scene</span>
          </button>
        </div>
      </section>
    </div>
  );
}
