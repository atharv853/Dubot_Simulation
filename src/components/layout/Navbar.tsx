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
} from 'lucide-react';

interface TabItem {
  id: TabType;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const TABS: TabItem[] = [
  { id: 'operation', label: 'Operation Panel', icon: <Sliders className="w-4 h-4" /> },
  { id: 'objects', label: 'Objects', icon: <Box className="w-4 h-4" /> },
  { id: 'teaching', label: 'Teaching & Playback', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'blockly', label: 'Blockly', icon: <Code2 className="w-4 h-4" />, disabled: true },
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
    isEmergencyStopped,
    setEmergencyStopped,
    speed,
    setSpeed,
  } = useDobotStore();

  return (
    <header className="h-14 bg-dobot-panel border-b border-dobot-border px-4 flex items-center justify-between select-none shrink-0 z-30">
      {/* Left: Branding & Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-dobot-accent flex items-center justify-center font-bold text-white shadow-md shadow-dobot-accent/30 text-sm">
            D
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide text-white flex items-center gap-1.5">
              DOBOT <span className="text-dobot-accent">Magician</span>
            </div>
            <div className="text-[10px] text-dobot-muted flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-dobot-success animate-pulse inline-block" />
              Connected (Simulator)
            </div>
          </div>
        </div>
      </div>

      {/* Center: Navigation Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto max-w-[50%] scrollbar-none py-1">
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-dobot-accent text-white shadow-sm shadow-dobot-accent/20'
                  : 'text-dobot-muted hover:text-white hover:bg-dobot-surface'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Quick Global Controls */}
      <div className="flex items-center gap-3">
        {/* Speed Slider */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-dobot-surface border border-dobot-border/60">
          <Gauge className="w-3.5 h-3.5 text-dobot-muted" />
          <span className="text-[11px] text-dobot-muted font-mono w-7">{speed}%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-16 h-1 bg-dobot-border rounded-lg appearance-none cursor-pointer accent-dobot-accent"
            title="Global Jog & Playback Speed"
          />
        </div>

        {/* Home Button */}
        <button
          onClick={homeRobot}
          disabled={isEmergencyStopped}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dobot-surface hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Return to Home Position"
        >
          <Home className="w-3.5 h-3.5 text-dobot-accent" />
          <span>Home</span>
        </button>

        {/* Emergency Stop Button */}
        <button
          onClick={() => setEmergencyStopped(!isEmergencyStopped)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-md ${
            isEmergencyStopped
              ? 'bg-white text-dobot-danger border border-dobot-danger animate-bounce'
              : 'bg-dobot-danger hover:bg-dobot-dangerHover text-white shadow-dobot-danger/30'
          }`}
          title="Emergency Stop: Immediately halt all robot motion"
        >
          <OctagonAlert className="w-4 h-4" />
          <span>{isEmergencyStopped ? 'RESET E-STOP' : 'E-STOP'}</span>
        </button>
      </div>
    </header>
  );
};
