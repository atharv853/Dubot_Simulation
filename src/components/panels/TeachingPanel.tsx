'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDobotStore, TeachingPoint, getMinSafeZ } from '@/lib/store/useDobotStore';
import { OBJECT_REGISTRY } from '@/lib/objects/types';
import { inverseKinematics } from '@/lib/kinematics';
import {
  Play,
  Pause,
  Square,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  FolderOpen,
  Download,
  Upload,
  Copy,
  Sparkles,
  Check,
  CircleDot,
  RotateCcw,
  Target,
} from 'lucide-react';

export const TeachingPanel: React.FC = () => {
  const {
    cartesian,
    teachingPoints,
    addTeachingPoint,
    updateTeachingPoint,
    deleteTeachingPoint,
    reorderTeachingPoints,
    playbackState,
    setPlaybackState,
    currentPlaybackIndex,
    setCurrentPlaybackIndex,
    setJointsDirect,
    setEndEffectorActive,
    speed,
    isEmergencyStopped,
    objects,
    selectedObjectId,
    saveToLocalStorage,
    loadFromLocalStorage,
    exportToJson,
    importFromJson,
  } = useDobotStore();

  // Add/Edit point dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formX, setFormX] = useState('250');
  const [formY, setFormY] = useState('0');
  const [formZ, setFormZ] = useState('100');
  const [formR, setFormR] = useState('0');
  const [formSuction, setFormSuction] = useState<'none' | 'on' | 'off'>('none');

  // JSON Import dialog
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  // Playback execution refs
  const playbackRef = useRef<{
    rafId: number | null;
    targetIndex: number;
    startTime: number;
    duration: number;
    startPose: { x: number; y: number; z: number; r: number };
    endPose: { x: number; y: number; z: number; r: number };
    isPlaying: boolean;
    settleUntil: number;
  }>({
    rafId: null,
    targetIndex: 0,
    startTime: 0,
    duration: 1,
    startPose: { x: 250, y: 0, z: 100, r: 0 },
    endPose: { x: 250, y: 0, z: 100, r: 0 },
    isPlaying: false,
    settleUntil: 0,
  });

  const stopPlayback = useCallback(() => {
    if (playbackRef.current.rafId) {
      cancelAnimationFrame(playbackRef.current.rafId);
      playbackRef.current.rafId = null;
    }
    playbackRef.current.isPlaying = false;
    useDobotStore.setState({ isMoving: false });
    setPlaybackState('idle');
    setCurrentPlaybackIndex(-1);
  }, [setPlaybackState, setCurrentPlaybackIndex]);

  // Handle emergency stop during playback
  useEffect(() => {
    if (isEmergencyStopped && playbackRef.current.isPlaying) {
      stopPlayback();
    }
  }, [isEmergencyStopped, stopPlayback]);

  // Main playback loop step
  const executePlaybackStep = useCallback(
    (now: number) => {
      const state = useDobotStore.getState();
      if (state.isEmergencyStopped || !playbackRef.current.isPlaying) {
        stopPlayback();
        return;
      }

      // Check settle pause (e.g., waiting for suction latch/drop)
      if (now < playbackRef.current.settleUntil) {
        playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
        return;
      }

      const pts = state.teachingPoints;
      const { startTime, duration, startPose, endPose, targetIndex } = playbackRef.current;
      const elapsed = Math.max(0, (now - startTime) / 1000);
      let t = Math.min(1, Math.max(0, elapsed / duration));

      // Smooth cosine ease-in-out
      const easeT = 0.5 - 0.5 * Math.cos(Math.PI * t);

      const interpX = startPose.x + (endPose.x - startPose.x) * easeT;
      const interpY = startPose.y + (endPose.y - startPose.y) * easeT;
      const rawInterpZ = startPose.z + (endPose.z - startPose.z) * easeT;
      const interpR = startPose.r + (endPose.r - startPose.r) * easeT;

      const { minZ } = getMinSafeZ(interpX, interpY, state.objects);
      const interpZ = Math.max(minZ, rawInterpZ);

      const ik = inverseKinematics(interpX, interpY, interpZ, interpR);
      if (ik) {
        // Continuous check for suction latching during motion
        const currentObjects = state.objects;
        const isSuctionOn = state.endEffectorActive && state.endEffectorType === 'suction';
        const hasAttached = currentObjects.some((o) => o.attachedToTool);

        let nextObjects = currentObjects;
        if (isSuctionOn && !hasAttached) {
          const workpiece = currentObjects.find((o) => !o.attachedToTool && o.typeId === 'box');
          if (workpiece) {
            const def = OBJECT_REGISTRY[workpiece.typeId];
            const topZ = workpiece.position[2] + (def ? def.dimensions.height : 35);
            const distH = Math.hypot(interpX - workpiece.position[0], interpY - workpiece.position[1]);
            const distV = Math.abs(interpZ - topZ);
            if (distH <= 45 && distV <= 25) {
              nextObjects = currentObjects.map((o) =>
                o.id === workpiece.id
                  ? { ...o, attachedToTool: true, attachedRelativeOffset: [0, 0, 0] }
                  : o
              );
            }
          }
        }

        useDobotStore.setState({
          joints: ik,
          cartesian: { x: interpX, y: interpY, z: interpZ, r: interpR },
          objects: nextObjects,
          isMoving: true,
        });

        state.addTrajectoryPoint([interpX, interpY, interpZ]);
      }

      if (t >= 1) {
        // Point target reached: execute point's suction action
        const currentPt = pts[targetIndex];
        if (currentPt) {
          if (currentPt.suction === 'on') {
            useDobotStore.getState().setEndEffectorType('suction');
            useDobotStore.getState().setEndEffectorActive(true);
            playbackRef.current.settleUntil = now + 400; // pause 400ms to ensure grip
          } else if (currentPt.suction === 'off') {
            useDobotStore.getState().setEndEffectorActive(false);
            playbackRef.current.settleUntil = now + 350; // pause 350ms to ensure drop
          }
        }

        const nextIndex = targetIndex + 1;
        if (nextIndex < pts.length) {
          // Advance to next point
          const nextPt = pts[nextIndex];
          playbackRef.current.targetIndex = nextIndex;
          playbackRef.current.startTime = Math.max(now, playbackRef.current.settleUntil);
          playbackRef.current.startPose = { ...endPose };
          playbackRef.current.endPose = { x: nextPt.x, y: nextPt.y, z: nextPt.z, r: nextPt.r };

          // Duration based on distance & speed
          const dist = Math.hypot(
            nextPt.x - endPose.x,
            nextPt.y - endPose.y,
            nextPt.z - endPose.z
          );
          const currentSpeed = useDobotStore.getState().speed;
          const speedFactor = currentSpeed / 50;
          playbackRef.current.duration = Math.max(0.65, dist / (105 * speedFactor));

          setCurrentPlaybackIndex(nextIndex);
          playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
          return;
        } else {
          // Finished entire trajectory
          stopPlayback();
          return;
        }
      }

      playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
    },
    [setCurrentPlaybackIndex, stopPlayback]
  );

  const startPlayback = () => {
    const state = useDobotStore.getState();
    const pts = state.teachingPoints;
    if (pts.length === 0 || state.isEmergencyStopped) return;

    // 1. Determine starting point (restart from 0 unless resuming from mid-pause)
    let startIndex = 0;
    if (
      playbackState === 'paused' &&
      currentPlaybackIndex >= 0 &&
      currentPlaybackIndex < pts.length - 1
    ) {
      startIndex = currentPlaybackIndex;
    }

    // 2. If starting fresh from 0, check if we need to auto-adapt pick points to current workpiece location
    let effectivePts = pts;
    if (startIndex === 0) {
      const workpiece = state.objects.find((o) => o.typeId === 'box');
      if (workpiece && !workpiece.attachedToTool) {
        const pt3 = pts[2];
        if (pt3 && pt3.suction === 'on' && (pt3.name.includes('Pick') || pt3.name.includes('Box'))) {
          const def = OBJECT_REGISTRY[workpiece.typeId];
          const topZ = workpiece.position[2] + (def ? def.dimensions.height : 35);
          const bx = Number(workpiece.position[0].toFixed(1));
          const by = Number(workpiece.position[1].toFixed(1));

          if (Math.hypot(pt3.x - bx, pt3.y - by) > 5) {
            effectivePts = pts.map((p, idx) => {
              if (idx === 1) return { ...p, x: bx, y: by, z: Number((topZ + 40).toFixed(1)) };
              if (idx === 2) return { ...p, x: bx, y: by, z: Number(topZ.toFixed(1)), suction: 'on' as const };
              if (idx === 3) return { ...p, x: bx, y: by, z: Number((topZ + 75).toFixed(1)) };
              return p;
            });
            useDobotStore.setState({ teachingPoints: effectivePts });
          }
        }
      }
    }

    const targetPt = effectivePts[startIndex];
    const currentCartesian = state.cartesian;

    playbackRef.current.isPlaying = true;
    playbackRef.current.targetIndex = startIndex;
    playbackRef.current.startTime = performance.now();
    playbackRef.current.startPose = { ...currentCartesian };
    playbackRef.current.endPose = { x: targetPt.x, y: targetPt.y, z: targetPt.z, r: targetPt.r };

    const dist = Math.hypot(
      targetPt.x - currentCartesian.x,
      targetPt.y - currentCartesian.y,
      targetPt.z - currentCartesian.z
    );
    const speedFactor = state.speed / 50;
    playbackRef.current.duration = Math.max(0.65, dist / (110 * speedFactor));
    playbackRef.current.settleUntil = 0;

    setCurrentPlaybackIndex(startIndex);
    setPlaybackState('playing');
    useDobotStore.setState({ isMoving: true });
    playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
  };

  const pausePlayback = () => {
    if (playbackRef.current.rafId) {
      cancelAnimationFrame(playbackRef.current.rafId);
      playbackRef.current.rafId = null;
    }
    playbackRef.current.isPlaying = false;
    useDobotStore.setState({ isMoving: false });
    setPlaybackState('paused');
  };

  // Dynamically sync / adapt points 2..7 to current object positions on the table
  const handleAdaptToObjects = () => {
    const currentObjects = useDobotStore.getState().objects;
    const workpiece = currentObjects.find((o) => o.typeId === 'box') || currentObjects[1];
    const station = currentObjects.find((o) => o.typeId === 'scale') || currentObjects[0];

    if (!workpiece) return;

    const boxDef = OBJECT_REGISTRY[workpiece.typeId];
    const boxTopZ = workpiece.position[2] + (boxDef ? boxDef.dimensions.height : 35);
    const bx = Number(workpiece.position[0].toFixed(1));
    const by = Number(workpiece.position[1].toFixed(1));

    const stationDef = station ? OBJECT_REGISTRY[station.typeId] : null;
    const stationTopZ = station ? station.position[2] + (stationDef ? stationDef.dimensions.height : 18) : 0;
    const sx = station ? Number(station.position[0].toFixed(1)) : 240;
    const sy = station ? Number(station.position[1].toFixed(1)) : -100;

    const adaptedPoints: TeachingPoint[] = [
      { id: 'tp-1', name: 'Home Standby', x: 250, y: 0, z: 100, r: 0, suction: 'off' },
      { id: 'tp-2', name: `Above ${workpiece.name}`, x: bx, y: by, z: Number((boxTopZ + 40).toFixed(1)), r: 0, suction: 'off' },
      { id: 'tp-3', name: `Pick ${workpiece.name}`, x: bx, y: by, z: Number(boxTopZ.toFixed(1)), r: 0, suction: 'on' },
      { id: 'tp-4', name: `Lift Up with ${workpiece.name}`, x: bx, y: by, z: Number((boxTopZ + 75).toFixed(1)), r: 0, suction: 'none' },
      { id: 'tp-5', name: `Above ${station ? station.name : 'Target'}`, x: sx, y: sy, z: Number((stationTopZ + 80).toFixed(1)), r: 0, suction: 'none' },
      { id: 'tp-6', name: `Place on ${station ? station.name : 'Target'}`, x: sx, y: sy, z: Number((stationTopZ + (boxDef ? boxDef.dimensions.height : 35)).toFixed(1)), r: 0, suction: 'off' },
      { id: 'tp-7', name: 'Retract Up', x: sx, y: sy, z: Number((stationTopZ + 80).toFixed(1)), r: 0, suction: 'none' },
      { id: 'tp-8', name: 'Return Home', x: 250, y: 0, z: 100, r: 0, suction: 'none' },
    ];

    useDobotStore.setState({ teachingPoints: adaptedPoints });
    setStorageNotice('Points adapted to current 3D object positions');
    setTimeout(() => setStorageNotice(null), 3000);
  };

  // Add current position as point
  const handleAddCurrentPosition = () => {
    addTeachingPoint({
      name: `Point ${teachingPoints.length + 1}`,
      x: Number(cartesian.x.toFixed(1)),
      y: Number(cartesian.y.toFixed(1)),
      z: Number(cartesian.z.toFixed(1)),
      r: Number(cartesian.r.toFixed(1)),
      suction: 'none',
    });
  };

  // Open manual add dialog
  const handleOpenAddDialog = () => {
    setEditingPointId(null);
    setFormName(`Target Pt ${teachingPoints.length + 1}`);
    setFormX(cartesian.x.toFixed(1));
    setFormY(cartesian.y.toFixed(1));
    setFormZ(cartesian.z.toFixed(1));
    setFormR(cartesian.r.toFixed(1));
    setFormSuction('none');
    setIsDialogOpen(true);
  };

  // Copy coordinates from selected object
  const handleCopyFromSelectedObject = () => {
    if (!selectedObjectId) return;
    const obj = objects.find((o) => o.id === selectedObjectId);
    if (!obj) return;
    const def = OBJECT_REGISTRY[obj.typeId];
    const topZ = obj.position[2] + (def ? def.dimensions.height : 0);

    setFormX(obj.position[0].toFixed(1));
    setFormY(obj.position[1].toFixed(1));
    setFormZ(topZ.toFixed(1));
    setFormName(`Pick ${obj.name}`);
  };

  // Save dialog form
  const handleSaveDialog = () => {
    const ptData = {
      name: formName.trim() || `Point ${teachingPoints.length + 1}`,
      x: parseFloat(formX) || 0,
      y: parseFloat(formY) || 0,
      z: parseFloat(formZ) || 0,
      r: parseFloat(formR) || 0,
      suction: formSuction,
    };

    if (editingPointId) {
      updateTeachingPoint(editingPointId, ptData);
    } else {
      addTeachingPoint(ptData);
    }
    setIsDialogOpen(false);
  };

  const handleEditPoint = (pt: TeachingPoint) => {
    setEditingPointId(pt.id);
    setFormName(pt.name);
    setFormX(pt.x.toString());
    setFormY(pt.y.toString());
    setFormZ(pt.z.toString());
    setFormR(pt.r.toString());
    setFormSuction(pt.suction);
    setIsDialogOpen(true);
  };

  // Local storage save/load
  const handleSaveStorage = () => {
    saveToLocalStorage();
    setStorageNotice('Saved to browser localStorage');
    setTimeout(() => setStorageNotice(null), 2500);
  };

  const handleLoadStorage = () => {
    loadFromLocalStorage();
    setStorageNotice('Loaded from browser localStorage');
    setTimeout(() => setStorageNotice(null), 2500);
  };

  // Export JSON download
  const handleExportJson = () => {
    const jsonStr = exportToJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dobot-trajectory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 space-y-4 select-none">
      {/* ---------------- PLAYBACK CONTROL BAR ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
              Sequence Player
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                playbackState === 'playing'
                  ? 'bg-dobot-success/20 text-dobot-success animate-pulse'
                  : playbackState === 'paused'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-dobot-surface text-dobot-muted'
              }`}
            >
              {playbackState.toUpperCase()}
            </span>
          </div>

          <div className="text-[11px] text-dobot-muted font-mono">
            {teachingPoints.length} points
          </div>
        </div>

        {/* Action Controls: Play / Pause / Stop */}
        <div className="flex items-center gap-2">
          {playbackState === 'playing' ? (
            <button
              onClick={pausePlayback}
              className="flex-1 py-2 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>PAUSE</span>
            </button>
          ) : (
            <button
              onClick={startPlayback}
              disabled={teachingPoints.length === 0 || isEmergencyStopped}
              className="flex-1 py-2 px-3 rounded-md bg-dobot-accent hover:bg-dobot-accentHover text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-dobot-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{playbackState === 'paused' ? 'RESUME' : 'PLAY SEQUENCE'}</span>
            </button>
          )}

          <button
            onClick={stopPlayback}
            disabled={playbackState === 'idle'}
            className="py-2 px-3 rounded-md bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-muted hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>STOP</span>
          </button>

          <button
            onClick={() => {
              stopPlayback();
              setCurrentPlaybackIndex(0);
            }}
            className="py-2 px-2.5 rounded-md bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-muted hover:text-white font-bold text-xs flex items-center justify-center gap-1 transition-all"
            title="Reset sequence to Point 1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">RESET</span>
          </button>
        </div>
      </div>

      {/* ---------------- TEACHING POINTS TABLE & ACTIONS ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md flex-1">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-dobot-border/50">
          <div className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
            Teaching Trajectory Points
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAdaptToObjects}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-medium shadow-sm transition-all"
              title="Auto-align pick & place trajectory points to current 3D positions of workpiece & station"
            >
              <Target className="w-3 h-3" />
              <span>Adapt to Objects</span>
            </button>

            <button
              onClick={handleAddCurrentPosition}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-dobot-accent hover:bg-dobot-accentHover text-white font-medium shadow-sm transition-all"
              title="Capture robot current XYZR position"
            >
              <Sparkles className="w-3 h-3" />
              <span>Record Current</span>
            </button>

            <button
              onClick={handleOpenAddDialog}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-all"
              title="Add point with manual coordinates"
            >
              <Plus className="w-3 h-3" />
              <span>Manual</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {teachingPoints.length === 0 ? (
          <div className="p-8 text-center text-dobot-muted text-xs border border-dashed border-dobot-border/60 rounded-lg">
            No teaching points recorded yet. Jog the arm and click "Record Current" or "Manual" to add points.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-dobot-border/60 text-dobot-muted font-mono text-[11px]">
                  <th className="py-1.5 px-2">#</th>
                  <th className="py-1.5 px-2">Name</th>
                  <th className="py-1.5 px-2">X</th>
                  <th className="py-1.5 px-2">Y</th>
                  <th className="py-1.5 px-2">Z</th>
                  <th className="py-1.5 px-2">R</th>
                  <th className="py-1.5 px-2">Suction</th>
                  <th className="py-1.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dobot-border/30 font-mono">
                {teachingPoints.map((pt, idx) => {
                  const isCurrent = currentPlaybackIndex === idx;

                  return (
                    <tr
                      key={pt.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-dobot-accent/20 font-bold border-l-2 border-dobot-accent text-white'
                          : 'hover:bg-dobot-surface/50 text-dobot-text'
                      }`}
                    >
                      <td className="py-2 px-2 text-dobot-muted text-[11px]">{idx + 1}</td>
                      <td className="py-2 px-2 font-sans font-medium text-white max-w-[110px] truncate">
                        {pt.name}
                      </td>
                      <td className="py-2 px-2 text-red-300">{pt.x.toFixed(1)}</td>
                      <td className="py-2 px-2 text-green-300">{pt.y.toFixed(1)}</td>
                      <td className="py-2 px-2 text-blue-300">{pt.z.toFixed(1)}</td>
                      <td className="py-2 px-2 text-amber-300">{pt.r.toFixed(1)}°</td>
                      <td className="py-2 px-2 font-sans">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            pt.suction === 'on'
                              ? 'bg-dobot-success/20 text-dobot-success'
                              : pt.suction === 'off'
                              ? 'bg-dobot-danger/20 text-dobot-danger'
                              : 'bg-dobot-bg/60 text-dobot-muted'
                          }`}
                        >
                          {pt.suction.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-sans">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={async () => {
                              const store = useDobotStore.getState();
                              setCurrentPlaybackIndex(idx);
                              await store.moveToCartesianTarget(
                                {
                                  x: pt.x,
                                  y: pt.y,
                                  z: pt.z,
                                  r: pt.r,
                                },
                                0.9
                              );
                              if (pt.suction === 'on') {
                                store.setEndEffectorType('suction');
                                store.setEndEffectorActive(true);
                              } else if (pt.suction === 'off') {
                                store.setEndEffectorActive(false);
                              }
                            }}
                            className="p-1 rounded text-sky-400 hover:text-white hover:bg-sky-500/20 transition-colors"
                            title={`Move Robot to Point ${idx + 1}`}
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                          <button
                            onClick={() => reorderTeachingPoints(idx, Math.max(0, idx - 1))}
                            disabled={idx === 0}
                            className="p-1 rounded text-dobot-muted hover:text-white disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() =>
                              reorderTeachingPoints(
                                idx,
                                Math.min(teachingPoints.length - 1, idx + 1)
                              )
                            }
                            disabled={idx === teachingPoints.length - 1}
                            className="p-1 rounded text-dobot-muted hover:text-white disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleEditPoint(pt)}
                            className="p-1 rounded text-dobot-muted hover:text-dobot-accent"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteTeachingPoint(pt.id)}
                            className="p-1 rounded text-dobot-muted hover:text-dobot-danger"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------- PERSISTENCE & JSON IMPORT/EXPORT ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
            Persistence & Transfer
          </span>
          {storageNotice && (
            <span className="text-[10px] text-dobot-success font-medium flex items-center gap-1">
              <Check className="w-3 h-3" />
              <span>{storageNotice}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <button
            onClick={handleSaveStorage}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-colors"
          >
            <Save className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Save</span>
          </button>
          <button
            onClick={handleLoadStorage}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Load</span>
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-green-400" />
            <span>Export</span>
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* ---------------- MANUAL POINT DIALOG MODAL ---------------- */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dobot-panel border border-dobot-border rounded-xl shadow-2xl w-full max-w-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-dobot-border pb-2">
              <span className="font-bold text-sm text-white">
                {editingPointId ? 'Edit Teaching Point' : 'Add Teaching Point'}
              </span>
              <button
                onClick={() => setIsDialogOpen(false)}
                className="text-dobot-muted hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-dobot-muted mb-1">Point Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-dobot-surface border border-dobot-border rounded px-2.5 py-1.5 text-white"
                  placeholder="e.g. Above Scale"
                />
              </div>

              {/* Shortcut: Copy from Selected Object */}
              {selectedObjectId && (
                <button
                  type="button"
                  onClick={handleCopyFromSelectedObject}
                  className="w-full py-1.5 px-2.5 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-accent/40 text-dobot-accent flex items-center justify-center gap-1.5 transition-colors font-medium text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Coords from Selected Object</span>
                </button>
              )}

              {/* Cartesian Coordinates Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-red-400 font-mono mb-1">X (mm)</label>
                  <input
                    type="number"
                    value={formX}
                    onChange={(e) => setFormX(e.target.value)}
                    className="w-full bg-dobot-surface border border-dobot-border rounded px-2 py-1 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-green-400 font-mono mb-1">Y (mm)</label>
                  <input
                    type="number"
                    value={formY}
                    onChange={(e) => setFormY(e.target.value)}
                    className="w-full bg-dobot-surface border border-dobot-border rounded px-2 py-1 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-blue-400 font-mono mb-1">Z (mm)</label>
                  <input
                    type="number"
                    value={formZ}
                    onChange={(e) => setFormZ(e.target.value)}
                    className="w-full bg-dobot-surface border border-dobot-border rounded px-2 py-1 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-amber-400 font-mono mb-1">R (deg)</label>
                  <input
                    type="number"
                    value={formR}
                    onChange={(e) => setFormR(e.target.value)}
                    className="w-full bg-dobot-surface border border-dobot-border rounded px-2 py-1 text-white font-mono"
                  />
                </div>
              </div>

              {/* Suction Action Selector */}
              <div>
                <label className="block text-dobot-muted mb-1.5">End-Effector Suction Action</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'on', 'off'] as const).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setFormSuction(action)}
                      className={`py-1.5 px-2 rounded border text-center font-medium capitalize transition-all ${
                        formSuction === action
                          ? 'bg-dobot-accent border-dobot-accent text-white shadow-sm'
                          : 'bg-dobot-surface border-dobot-border text-dobot-muted hover:text-white'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-dobot-border">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="px-3 py-1.5 rounded bg-dobot-surface hover:bg-dobot-border text-dobot-muted text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDialog}
                className="px-4 py-1.5 rounded bg-dobot-accent hover:bg-dobot-accentHover text-white font-semibold text-xs shadow-md"
              >
                Save Point
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- JSON IMPORT MODAL ---------------- */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dobot-panel border border-dobot-border rounded-xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-dobot-border pb-2">
              <span className="font-bold text-sm text-white">Import Trajectory JSON</span>
              <button
                onClick={() => setIsImportOpen(false)}
                className="text-dobot-muted hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste exported trajectory JSON here..."
              className="w-full bg-dobot-surface border border-dobot-border rounded p-2 text-xs font-mono text-white resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-3 py-1.5 rounded bg-dobot-surface hover:bg-dobot-border text-dobot-muted text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const ok = importFromJson(importJsonText);
                  if (ok) {
                    setIsImportOpen(false);
                    setImportJsonText('');
                    setStorageNotice('Successfully imported JSON');
                    setTimeout(() => setStorageNotice(null), 2500);
                  } else {
                    alert('Invalid JSON structure. Please check the file contents.');
                  }
                }}
                className="px-4 py-1.5 rounded bg-dobot-accent hover:bg-dobot-accentHover text-white font-semibold text-xs shadow-md"
              >
                Apply Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
