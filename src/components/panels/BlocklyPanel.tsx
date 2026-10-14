'use client';

import React, { useState, useRef } from 'react';
import { useDobotStore } from '@/lib/store/useDobotStore';
import {
  Play,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  FolderOpen,
  Sliders,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Code,
} from 'lucide-react';

export interface BlocklyStep {
  id: string;
  type: 'wait' | 'repeat' | 'moveTo' | 'jumpTo' | 'home' | 'suction';
  color: string;
  category: string;
  params: Record<string, any>;
  comment?: string;
}

const CATEGORIES = [
  { id: 'control', label: 'Control', color: '#ffab19', bg: 'bg-[#ffab19]' },
  { id: 'operators', label: 'Operators', color: '#59c059', bg: 'bg-[#59c059]' },
  { id: 'variables', label: 'Variables', color: '#ff8c1a', bg: 'bg-[#ff8c1a]' },
  { id: 'sensing', label: 'Sensing', color: '#5cb1d6', bg: 'bg-[#5cb1d6]' },
  { id: 'events', label: 'Events', color: '#ffbf00', bg: 'bg-[#ffbf00]' },
  { id: 'setting', label: 'Setting', color: '#4c97ff', bg: 'bg-[#4c97ff]' },
  { id: 'motion', label: 'Motion', color: '#9966ff', bg: 'bg-[#9966ff]' },
  { id: 'status', label: 'Status', color: '#cf63cf', bg: 'bg-[#cf63cf]' },
  { id: 'io', label: 'I/O', color: '#ff4d4f', bg: 'bg-[#ff4d4f]' },
  { id: 'coordinates', label: 'Coordinates', color: '#20b2aa', bg: 'bg-[#20b2aa]' },
];

// Default Pick & Place Program
const DEFAULT_PROGRAM: BlocklyStep[] = [
  {
    id: 'b1',
    type: 'wait',
    color: '#ffab19',
    category: 'control',
    params: { seconds: 1 },
  },
  {
    id: 'b2',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 240, y: 100, z: 80, r: 0 },
    comment: 'Hover above Cube',
  },
  {
    id: 'b3',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 240, y: 100, z: 35, r: 0 },
    comment: 'Descend to Cube Top',
  },
  {
    id: 'b4',
    type: 'suction',
    color: '#ff4d4f',
    category: 'io',
    params: { state: 'on' },
    comment: 'Engage Vacuum',
  },
  {
    id: 'b5',
    type: 'wait',
    color: '#ffab19',
    category: 'control',
    params: { seconds: 0.5 },
  },
  {
    id: 'b6',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 240, y: 100, z: 120, r: 0 },
    comment: 'Lift up with Cube',
  },
  {
    id: 'b7',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 200, y: -100, z: 120, r: 0 },
    comment: 'Transfer across to Destination',
  },
  {
    id: 'b8',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 200, y: -100, z: 35, r: 0 },
    comment: 'Lower to Destination Table Surface',
  },
  {
    id: 'b9',
    type: 'suction',
    color: '#ff4d4f',
    category: 'io',
    params: { state: 'off' },
    comment: 'Release Vacuum',
  },
  {
    id: 'b10',
    type: 'wait',
    color: '#ffab19',
    category: 'control',
    params: { seconds: 0.5 },
  },
  {
    id: 'b11',
    type: 'moveTo',
    color: '#9966ff',
    category: 'motion',
    params: { x: 250, y: 0, z: 100, r: 0 },
    comment: 'Retract to Home',
  },
];

export const BlocklyPanel: React.FC = () => {
  const {
    moveToCartesianTarget,
    setEndEffectorActive,
    homeRobot,
    isEmergencyStopped,
    setEndEffectorType,
  } = useDobotStore();

  const [activeCategory, setActiveCategory] = useState<string>('control');
  const [blocks, setBlocks] = useState<BlocklyStep[]>(DEFAULT_PROGRAM);
  const [runningIndex, setRunningIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const cancelRunRef = useRef<boolean>(false);

  // Add block from palette
  const addBlock = (type: BlocklyStep['type'], category: string, color: string, defaultParams: Record<string, any>) => {
    const newBlock: BlocklyStep = {
      id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      category,
      color,
      params: { ...defaultParams },
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const updateBlockParam = (id: string, key: string, val: any) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, params: { ...b.params, [key]: val } } : b))
    );
  };

  const deleteBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  // Run the sequence
  const runProgram = async () => {
    if (isRunning || isEmergencyStopped || blocks.length === 0) return;
    setIsRunning(true);
    cancelRunRef.current = false;
    setEndEffectorType('suction');

    for (let i = 0; i < blocks.length; i++) {
      if (cancelRunRef.current || isEmergencyStopped) break;
      setRunningIndex(i);
      const b = blocks[i];

      if (b.type === 'wait') {
        const ms = (Number(b.params.seconds) || 1) * 1000;
        await new Promise((r) => setTimeout(r, ms));
      } else if (b.type === 'moveTo') {
        await moveToCartesianTarget({
          x: Number(b.params.x),
          y: Number(b.params.y),
          z: Number(b.params.z),
          r: Number(b.params.r) || 0,
        });
      } else if (b.type === 'suction') {
        setEndEffectorActive(b.params.state === 'on');
        await new Promise((r) => setTimeout(r, 300));
      } else if (b.type === 'home') {
        homeRobot();
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    setRunningIndex(-1);
    setIsRunning(false);
  };

  const stopProgram = () => {
    cancelRunRef.current = true;
    setIsRunning(false);
    setRunningIndex(-1);
  };

  return (
    <div className="flex flex-col h-full bg-dobot-panel select-none overflow-hidden text-dobot-text">
      {/* Top Header Bar matching Scratch / Dobot Blockly */}
      <div className="h-12 border-b border-dobot-border px-4 flex items-center justify-between shrink-0 bg-dobot-surface/50">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-dobot-accent" />
          <span className="font-bold text-xs uppercase tracking-wider">
            DobotStudio Blockly Process Studio
          </span>
        </div>

        {/* Play / Stop controls */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={stopProgram}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dobot-danger hover:bg-dobot-dangerHover text-white text-xs font-bold shadow-md transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={runProgram}
              disabled={isEmergencyStopped || blocks.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-dobot-success hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-dobot-success/20 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Process</span>
            </button>
          )}

          <button
            onClick={() => setBlocks(DEFAULT_PROGRAM)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-dobot-surface hover:bg-dobot-border text-dobot-muted hover:text-dobot-text text-xs border border-dobot-border transition-colors"
            title="Reset to default Pick & Place program"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: 3-column Scratch layout matching Image 1 */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Left Column 1: Category icons matching Image 1 */}
        <div className="w-20 bg-dobot-surface border-r border-dobot-border flex flex-col items-center py-2 space-y-1 overflow-y-auto shrink-0">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex flex-col items-center justify-center w-16 py-2 px-1 rounded-lg text-[10px] font-semibold transition-all ${
                  isActive
                    ? 'bg-dobot-panel text-white shadow-sm'
                    : 'text-dobot-muted hover:text-dobot-text'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full mb-1 shadow-sm"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="truncate w-full text-center">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Column 2: Block Palette matching Image 1 */}
        <div className="w-48 bg-dobot-panel border-r border-dobot-border p-3 space-y-2 overflow-y-auto shrink-0">
          <div className="text-[11px] font-bold text-dobot-muted uppercase tracking-wider mb-2">
            Blocks (Click to Add)
          </div>

          {activeCategory === 'control' && (
            <>
              <button
                onClick={() =>
                  addBlock('wait', 'control', '#ffab19', { seconds: 1 })
                }
                className="w-full text-left p-2 rounded-md bg-[#ffab19] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                wait <span className="bg-white/30 px-1.5 py-0.5 rounded">1</span> secs
              </button>
              <button
                onClick={() =>
                  addBlock('repeat', 'control', '#ffab19', { times: 5 })
                }
                className="w-full text-left p-2 rounded-md bg-[#ffab19] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                repeat <span className="bg-white/30 px-1.5 py-0.5 rounded">5</span> times
              </button>
            </>
          )}

          {activeCategory === 'motion' && (
            <>
              <button
                onClick={() =>
                  addBlock('moveTo', 'motion', '#9966ff', { x: 240, y: 100, z: 80, r: 0 })
                }
                className="w-full text-left p-2 rounded-md bg-[#9966ff] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                MoveTo X, Y, Z
              </button>
              <button
                onClick={() => addBlock('home', 'motion', '#9966ff', {})}
                className="w-full text-left p-2 rounded-md bg-[#9966ff] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                Go Home
              </button>
            </>
          )}

          {activeCategory === 'io' && (
            <>
              <button
                onClick={() =>
                  addBlock('suction', 'io', '#ff4d4f', { state: 'on' })
                }
                className="w-full text-left p-2 rounded-md bg-[#ff4d4f] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                Set Suction [ ON ]
              </button>
              <button
                onClick={() =>
                  addBlock('suction', 'io', '#ff4d4f', { state: 'off' })
                }
                className="w-full text-left p-2 rounded-md bg-[#ff4d4f] text-white text-xs font-bold shadow hover:brightness-105 active:scale-95 transition-all"
              >
                Set Suction [ OFF ]
              </button>
            </>
          )}

          {activeCategory !== 'control' && activeCategory !== 'motion' && activeCategory !== 'io' && (
            <div className="text-xs text-dobot-muted italic p-2">
              Select <strong>Control</strong>, <strong>Motion</strong>, or <strong>I/O</strong> to pick runnable blocks.
            </div>
          )}
        </div>

        {/* Column 3: Main Block Script Stack Canvas (matching Image 1 right section) */}
        <div className="flex-1 bg-dobot-inputBg p-4 overflow-y-auto space-y-2">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-dobot-muted">
              <Sparkles className="w-8 h-8 text-dobot-accent mb-2 opacity-50" />
              <p className="text-xs font-semibold">Workspace is empty</p>
              <p className="text-[11px]">Click any block from the palette or click Reset Demo</p>
            </div>
          ) : (
            blocks.map((b, idx) => {
              const isCurrent = runningIndex === idx;
              return (
                <div
                  key={b.id}
                  className={`relative flex items-center justify-between p-2.5 rounded-lg text-white font-bold text-xs shadow-md transition-all group ${
                    isCurrent ? 'ring-4 ring-white animate-pulse' : ''
                  }`}
                  style={{ backgroundColor: b.color }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 text-[10px] text-white/70 font-mono">
                      #{idx + 1}
                    </span>

                    {/* Block Content */}
                    {b.type === 'wait' && (
                      <div className="flex items-center gap-1.5">
                        <span>wait</span>
                        <input
                          type="number"
                          value={b.params.seconds}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'seconds', parseFloat(e.target.value) || 0)
                          }
                          className="w-12 px-1.5 py-0.5 rounded bg-white text-gray-900 text-center font-bold text-xs"
                        />
                        <span>seconds</span>
                      </div>
                    )}

                    {b.type === 'repeat' && (
                      <div className="flex items-center gap-1.5">
                        <span>repeat</span>
                        <input
                          type="number"
                          value={b.params.times}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'times', parseInt(e.target.value) || 1)
                          }
                          className="w-12 px-1.5 py-0.5 rounded bg-white text-gray-900 text-center font-bold text-xs"
                        />
                        <span>times</span>
                      </div>
                    )}

                    {b.type === 'moveTo' && (
                      <div className="flex items-center gap-1.5">
                        <span>MoveTo</span>
                        <span className="text-[10px] opacity-80">X:</span>
                        <input
                          type="number"
                          value={b.params.x}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'x', parseFloat(e.target.value) || 0)
                          }
                          className="w-14 px-1 py-0.5 rounded bg-white text-gray-900 text-center font-mono text-xs"
                        />
                        <span className="text-[10px] opacity-80">Y:</span>
                        <input
                          type="number"
                          value={b.params.y}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'y', parseFloat(e.target.value) || 0)
                          }
                          className="w-14 px-1 py-0.5 rounded bg-white text-gray-900 text-center font-mono text-xs"
                        />
                        <span className="text-[10px] opacity-80">Z:</span>
                        <input
                          type="number"
                          value={b.params.z}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'z', parseFloat(e.target.value) || 0)
                          }
                          className="w-14 px-1 py-0.5 rounded bg-white text-gray-900 text-center font-mono text-xs"
                        />
                      </div>
                    )}

                    {b.type === 'suction' && (
                      <div className="flex items-center gap-1.5">
                        <span>Set Suction Cup</span>
                        <select
                          value={b.params.state}
                          onChange={(e) =>
                            updateBlockParam(b.id, 'state', e.target.value)
                          }
                          className="px-2 py-0.5 rounded bg-white text-gray-900 font-bold text-xs"
                        >
                          <option value="on">ON (Vacuum)</option>
                          <option value="off">OFF (Release)</option>
                        </select>
                      </div>
                    )}

                    {b.type === 'home' && <span>Go to Home Reference</span>}

                    {b.comment && (
                      <span className="text-[10px] text-white/80 font-normal italic ml-2">
                        // {b.comment}
                      </span>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteBlock(b.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/20 text-white/80 hover:text-white transition-opacity"
                    title="Delete block"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
