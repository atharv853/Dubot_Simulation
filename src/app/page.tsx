'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDobotStore, TabType } from '@/lib/store/useDobotStore';
import { Navbar } from '@/components/layout/Navbar';
import { StatusBanner } from '@/components/panels/StatusBanner';
import { OperationPanel } from '@/components/panels/OperationPanel';
import { ObjectsPanel } from '@/components/panels/ObjectsPanel';
import { TeachingPanel } from '@/components/panels/TeachingPanel';
import { BlocklyPanel } from '@/components/panels/BlocklyPanel';
import { ComingSoonTab } from '@/components/panels/ComingSoonTab';
import { useHostSync } from '@/lib/realtime/useHostSync';
import { Smartphone, Radio, CheckCircle2 } from 'lucide-react';

// Dynamic import for Viewport3D to ensure WebGL/Canvas loads strictly client-side
const Viewport3D = dynamic(
  () => import('@/components/viewport/Viewport3D').then((mod) => mod.Viewport3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-dobot-bg text-dobot-muted">
        <div className="w-10 h-10 border-2 border-dobot-accent border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono">Initializing Three.js 3D Viewport...</span>
      </div>
    ),
  }
);

export default function SimulatorPage() {
  const { activeTab, setActiveTab, loadFromLocalStorage, theme } = useDobotStore();
  const [mounted, setMounted] = useState(false);

  // Authoritative Host Synchronization Agent
  const syncStatus = useHostSync('atharv');

  useEffect(() => {
    setMounted(true);
    loadFromLocalStorage();

    // Sync tab from URL query if present
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as TabType;
    if (tabParam && ['operation', 'objects', 'teaching', 'blockly'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [loadFromLocalStorage, setActiveTab]);

  // Sync tab back to URL query state
  useEffect(() => {
    if (!mounted) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState({}, '', url.toString());
  }, [activeTab, mounted]);

  // Sync theme class to html element
  useEffect(() => {
    if (!mounted) return;
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme, mounted]);

  if (!mounted) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-dobot-bg text-dobot-text">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-dobot-accent rounded-full animate-ping" />
          <span className="text-xs font-mono">Loading Dobot Magician Simulator...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col bg-dobot-bg text-dobot-text select-none">
      {/* ---------------- 100% FULL-WIDTH TOP NAVBAR ---------------- */}
      <Navbar syncStatus={syncStatus} />

      {/* Global Warning / Feedback Banner */}
      <StatusBanner />

      {/* ---------------- MAIN CONTENT AREA (60% VIEWPORT / 40% CONTROL) ---------------- */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* LEFT 60%: 3D VIEWPORT */}
        <section className="w-[60%] h-full relative overflow-hidden border-r border-dobot-border">
          <Viewport3D />

          {/* Floating HUD: Live Remote Teleoperation Activity */}
          {syncStatus.lastRemoteCommand && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-dobot-panel/90 backdrop-blur-md border border-dobot-accent shadow-xl text-xs font-mono">
              <Smartphone className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-dobot-muted font-bold uppercase tracking-wider">
                  Remote Teleoperation ({syncStatus.lastRemoteCommand.sender})
                </span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="text-dobot-accent">{syncStatus.lastRemoteCommand.type}</span>
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded font-bold uppercase ${
                      syncStatus.lastRemoteCommand.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : syncStatus.lastRemoteCommand.status === 'failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-amber-500/20 text-amber-400 animate-pulse'
                    }`}
                  >
                    {syncStatus.lastRemoteCommand.status}
                  </span>
                </span>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT 40%: CONTROL AREA */}
        <section className="w-[40%] h-full flex flex-col bg-dobot-panel overflow-hidden">
          {/* Routed Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'operation' && <OperationPanel />}
            {activeTab === 'objects' && <ObjectsPanel />}
            {activeTab === 'teaching' && <TeachingPanel />}
            {activeTab === 'blockly' && <BlocklyPanel />}

            {/* Stubs for other DobotStudio tabs */}
            {activeTab === 'draw' && (
              <ComingSoonTab
                title="Write & Draw Module"
                description="Pen holder attachment and SVG path plotting tool."
              />
            )}
            {activeTab === 'laser' && (
              <ComingSoonTab
                title="Laser Engraving"
                description="Greyscale raster and vector laser engraving studio."
              />
            )}
            {activeTab === 'print' && (
              <ComingSoonTab
                title="3D Printer Extruder"
                description="G-code slicer integration and heated bed control."
              />
            )}
            {activeTab === 'leap' && (
              <ComingSoonTab
                title="Leap Motion Gesture Control"
                description="Real-time hand tracking and robotic teleoperation."
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
