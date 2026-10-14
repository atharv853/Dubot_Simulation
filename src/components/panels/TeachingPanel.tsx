'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDobotStore, TeachingPoint } from '@/lib/store/useDobotStore';
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
    isPaused: boolean;
    settleUntil: number;
  }>({
    rafId: null,
    targetIndex: 0,
    startTime: 0,
    duration: 1,
    startPose: { x: 250, y: 0, z: 100, r: 0 },
    endPose: { x: 250, y: 0, z: 100, r: 0 },
    isPaused: false,
    settleUntil: 0,
  });

  const stopPlayback = useCallback(() => {
    if (playbackRef.current.rafId) {
      cancelAnimationFrame(playbackRef.current.rafId);
      playbackRef.current.rafId = null;
    }
    setPlaybackState('idle');
    setCurrentPlaybackIndex(-1);
  }, [setPlaybackState, setCurrentPlaybackIndex]);

  // Handle emergency stop during playback
  useEffect(() => {
    if (isEmergencyStopped && playbackState === 'playing') {
      stopPlayback();
    }
  }, [isEmergencyStopped, playbackState, stopPlayback]);

  // Main playback loop step
  const executePlaybackStep = useCallback(
    (now: number) => {
      if (isEmergencyStopped || playbackState !== 'playing') {
        stopPlayback();
        return;
      }

      // Check settle pause (e.g., waiting for suction latch/drop)
      if (now < playbackRef.current.settleUntil) {
        playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
        return;
      }

      const { startTime, duration, startPose, endPose, targetIndex } = playbackRef.current;
      const elapsed = (now - startTime) / 1000;
      let t = Math.min(1, Math.max(0, elapsed / duration));

      // Smooth cosine ease-in-out
      const easeT = 0.5 - 0.5 * Math.cos(Math.PI * t);

      const interpX = startPose.x + (endPose.x - startPose.x) * easeT;
      const interpY = startPose.y + (endPose.y - startPose.y) * easeT;
      const interpZ = startPose.z + (endPose.z - startPose.z) * easeT;
      const interpR = startPose.r + (endPose.r - startPose.r) * easeT;

      const ik = inverseKinematics(interpX, interpY, interpZ, interpR);
      if (ik) {
        setJointsDirect(ik);
      }

      if (t >= 1) {
        // Point target reached: execute point's suction action
        const currentPt = teachingPoints[targetIndex];
        if (currentPt) {
          if (currentPt.suction === 'on') {
            setEndEffectorActive(true);
            playbackRef.current.settleUntil = now + 350; // pause 350ms to ensure grip
          } else if (currentPt.suction === 'off') {
            setEndEffectorActive(false);
            playbackRef.current.settleUntil = now + 300; // pause 300ms to ensure drop
          }
        }

        const nextIndex = targetIndex + 1;
        if (nextIndex < teachingPoints.length) {
          // Advance to next point
          const nextPt = teachingPoints[nextIndex];
          playbackRef.current.targetIndex = nextIndex;
          playbackRef.current.startTime = now + (playbackRef.current.settleUntil > now ? 300 : 0);
          playbackRef.current.startPose = { ...endPose };
          playbackRef.current.endPose = { x: nextPt.x, y: nextPt.y, z: nextPt.z, r: nextPt.r };

          // Duration based on distance & speed
          const dist = Math.hypot(
            nextPt.x - endPose.x,
            nextPt.y - endPose.y,
            nextPt.z - endPose.z
          );
          const speedFactor = speed / 50;
          playbackRef.current.duration = Math.max(0.6, dist / (110 * speedFactor));

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
    [
      isEmergencyStopped,
      playbackState,
      teachingPoints,
      speed,
      setJointsDirect,
      setEndEffectorActive,
      setCurrentPlaybackIndex,
      stopPlayback,
    ]
  );

  const startPlayback = () => {
    if (teachingPoints.length === 0 || isEmergencyStopped) return;

    const startIndex = currentPlaybackIndex >= 0 ? currentPlaybackIndex : 0;
    const targetPt = teachingPoints[startIndex];

    playbackRef.current.targetIndex = startIndex;
    playbackRef.current.startTime = performance.now();
    playbackRef.current.startPose = { ...cartesian };
    playbackRef.current.endPose = { x: targetPt.x, y: targetPt.y, z: targetPt.z, r: targetPt.r };

    const dist = Math.hypot(
      targetPt.x - cartesian.x,
      targetPt.y - cartesian.y,
      targetPt.z - cartesian.z
    );
    const speedFactor = speed / 50;
    playbackRef.current.duration = Math.max(0.6, dist / (110 * speedFactor));
    playbackRef.current.settleUntil = 0;

    setCurrentPlaybackIndex(startIndex);
    setPlaybackState('playing');
    playbackRef.current.rafId = requestAnimationFrame(executePlaybackStep);
  };

  const pausePlayback = () => {
    if (playbackRef.current.rafId) {
      cancelAnimationFrame(playbackRef.current.rafId);
      playbackRef.current.rafId = null;
    }
    setPlaybackState('paused');
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
