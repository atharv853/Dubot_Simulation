'use client';

import React from 'react';
import { useDobotStore, TabType } from '@/lib/store/useDobotStore';
import {
  Sliders,
  Box,
  GraduationCap,
  Code2,
  PenTool,
  Printer,
  Sparkles,
  Hand,
  Home,
  OctagonAlert,
  Gauge,
  Sun,
  Moon,
  RotateCcw,
} from 'lucide-react';

interface TabItem {
  id: TabType;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const TABS: TabItem[] = [
  { id: 'operation', label: 'Operation Panel', icon: <Sliders className="w-4 h-4" /> },
  { id: 'objects', label: 'Objects & Stations', icon: <Box className="w-4 h-4" /> },
  { id: 'teaching', label: 'Teaching & Playback', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'blockly', label: 'Blockly Process', icon: <Code2 className="w-4 h-4" /> },
  { id: 'draw', label: 'Write & Draw', icon: <PenTool className="w-4 h-4" />, disabled: true },
  { id: 'laser', label: 'Laser Engraving', icon: <Sparkles className="w-4 h-4" />, disabled: true },
  { id: 'print', label: '3D Printer', icon: <Printer className="w-4 h-4" />, disabled: true },
  { id: 'leap', label: 'Leap Motion', icon: <Hand className="w-4 h-4" />, disabled: true },
];

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    homeRobot,
    resetAll,
    isEmergencyStopped,
    setEmergencyStopped,
    speed,
    setSpeed,
    theme,
    toggleTheme,
    isMoving,
  } = useDobotStore();

  return (
    <header className="w-full h-14 bg-dobot-panel border-b border-dobot-border px-4 flex items-center justify-between select-none shrink-0 z-30 transition-colors">
      {/* Left: Branding & Connection Status */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-dobot-accent flex items-center justify-center font-black text-white shadow-md shadow-dobot-accent/30 text-base tracking-tighter">
            D
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-wide text-dobot-text flex items-center gap-1.5">
              DOBOT <span className="text-dobot-accent">Magician</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-dobot-surface text-dobot-muted border border-dobot-border font-mono font-medium">
                4-DOF
              </span>
            </div>
            <div className="text-[10px] text-dobot-muted flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isEmergencyStopped
                    ? 'bg-dobot-danger animate-ping'
                    : isMoving
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-dobot-success animate-pulse'
                } inline-block`}
              />
              <span className="font-medium">
                {isEmergencyStopped ? 'E-STOP HALT' : isMoving ? 'Robot Moving' : 'Online Simulator'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Navigation Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto max-w-[55%] scrollbar-none py-1 mx-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          if (tab.disabled) {
            return (
              <button
                key={tab.id}
                disabled
                title="Coming Soon"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-dobot-muted/40 cursor-not-allowed hover:bg-transparent"
              >
                {tab.icon}
                <span className="whitespace-nowrap">{tab.label}</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-dobot-surface/50 text-dobot-muted/60">
                  Soon
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-dobot-accent text-white shadow-sm shadow-dobot-accent/30'
                  : 'text-dobot-muted hover:text-dobot-text hover:bg-dobot-surface'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Quick Global Controls & Theme Switcher */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-muted hover:text-dobot-text transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
        </button>

        {/* Global Speed Slider */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dobot-surface border border-dobot-border">
          <Gauge className="w-3.5 h-3.5 text-dobot-muted" />
          <span className="text-[11px] text-dobot-muted font-mono w-7 font-bold">{speed}%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-16 h-1.5 bg-dobot-border rounded-lg appearance-none cursor-pointer accent-dobot-accent"
            title="Global Jog & Movement Speed"
          />
        </div>

        {/* Reset All Button */}
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white text-xs font-semibold transition-all shadow-sm active:scale-95"
          title="Reset Dobot and Scene to Initial State (clear all, reset objects, trajectory & warnings)"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>Reset All</span>
        </button>

        {/* Home Button */}
        <button
          onClick={homeRobot}
          disabled={isEmergencyStopped}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          title="Return Dobot to Home Reference Position"
        >
          <Home className="w-3.5 h-3.5 text-dobot-accent" />
          <span>Home</span>
        </button>

        {/* Emergency Stop / Reset Button */}
        <button
          onClick={() => {
            if (isEmergencyStopped) {
              resetAll();
            } else {
              setEmergencyStopped(true);
            }
          }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 ${
            isEmergencyStopped
              ? 'bg-red-600 text-white border-2 border-white animate-bounce shadow-red-500/50'
              : 'bg-dobot-danger hover:bg-dobot-dangerHover text-white shadow-dobot-danger/30'
          }`}
          title={isEmergencyStopped ? 'Reset all and restore normal operation' : 'Emergency Stop: Freeze all motion'}
        >
          <OctagonAlert className="w-4 h-4" />
          <span>{isEmergencyStopped ? 'RESET & RESTORE' : 'E-STOP'}</span>
        </button>
      </div>
    </header>
  );
};
