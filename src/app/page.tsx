'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDobotStore, TabType } from '@/lib/store/useDobotStore';
import { Navbar } from '@/components/layout/Navbar';
import { StatusBanner } from '@/components/panels/StatusBanner';
import { OperationPanel } from '@/components/panels/OperationPanel';
import { ObjectsPanel } from '@/components/panels/ObjectsPanel';
import { TeachingPanel } from '@/components/panels/TeachingPanel';
import { ComingSoonTab } from '@/components/panels/ComingSoonTab';

// Dynamic import for Viewport3D to ensure WebGL/Canvas loads strictly client-side
const Viewport3D = dynamic(
  () => import('@/components/viewport/Viewport3D').then((mod) => mod.Viewport3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#101216] text-dobot-muted">
        <div className="w-10 h-10 border-2 border-dobot-accent border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono">Initializing Three.js 3D Viewport...</span>
      </div>
    ),
  }
);

export default function SimulatorPage() {
  const { activeTab, setActiveTab, loadFromLocalStorage } = useDobotStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadFromLocalStorage();

    // Sync tab from URL query if present
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as TabType;
    if (tabParam && ['operation', 'objects', 'teaching'].includes(tabParam)) {
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

  if (!mounted) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-dobot-bg text-white">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-dobot-accent rounded-full animate-ping" />
          <span className="text-xs font-mono">Loading Dobot Magician Simulator...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-row bg-dobot-bg text-dobot-text select-none">
      {/* ---------------- LEFT 60%: 3D VIEWPORT ---------------- */}
      <section className="w-[60%] h-full relative overflow-hidden border-r border-dobot-border">
        <Viewport3D />
      </section>

      {/* ---------------- RIGHT 40%: CONTROL AREA ---------------- */}
      <section className="w-[40%] h-full flex flex-col bg-dobot-panel overflow-hidden">
        {/* Top Navbar */}
        <Navbar />

        {/* Global Warning / Feedback Banner */}
        <StatusBanner />

        {/* Routed Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'operation' && <OperationPanel />}
          {activeTab === 'objects' && <ObjectsPanel />}
          {activeTab === 'teaching' && <TeachingPanel />}

          {/* Stubs for other DobotStudio tabs */}
          {activeTab === 'blockly' && (
            <ComingSoonTab
              title="Blockly Visual Programming"
              description="Drag-and-drop block coding module for Dobot Magician will be available in future releases."
            />
          )}
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
    </main>
  );
}
