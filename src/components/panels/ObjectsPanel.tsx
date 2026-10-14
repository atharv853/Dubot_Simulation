'use client';

import React, { useState } from 'react';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { OBJECT_REGISTRY } from '@/lib/objects/types';
import {
  Box,
  Scale,
  Plus,
  Trash2,
  Copy,
  Check,
  Move,
  MapPin,
  Info,
  CheckCircle2,
} from 'lucide-react';

export const ObjectsPanel: React.FC = () => {
  const {
    objects,
    selectedObjectId,
    setSelectedObjectId,
    ghostPlacementType,
    setGhostPlacementType,
    deleteObject,
    updateObjectPosition,
  } = useDobotStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCoords = (x: number, y: number, z: number, id: string) => {
    const text = `X: ${x.toFixed(1)}, Y: ${y.toFixed(1)}, Z: ${z.toFixed(1)}`;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 space-y-4 select-none">
      {/* ---------------- OBJECT CATALOG ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
            Workspace Object Catalog
          </span>
          <span className="text-[10px] text-dobot-muted">Data-driven registry</span>
        </div>
        <p className="text-xs text-dobot-muted mb-3">
          Click an object to enter placement mode, then move mouse over the 3D table to place it within reach.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {Object.values(OBJECT_REGISTRY).map((item) => {
            const isCurrentlyPlacing = ghostPlacementType === item.typeId;

            return (
              <div
                key={item.typeId}
                className={`flex flex-col p-3 rounded-lg border transition-all ${
                  isCurrentlyPlacing
                    ? 'bg-dobot-accent/20 border-dobot-accent ring-1 ring-dobot-accent shadow-md'
                    : 'bg-dobot-surface border-dobot-border/80 hover:border-dobot-accent/50'
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="p-2 rounded bg-dobot-panel border border-dobot-border/60 text-dobot-accent">
                    {item.typeId === 'scale' ? (
                      <Scale className="w-5 h-5" />
                    ) : (
                      <Box className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dobot-bg/80 text-dobot-muted">
                    {item.dimensions.width}×{item.dimensions.depth}×{item.dimensions.height}mm
                  </span>
                </div>

                <div className="font-semibold text-xs text-white mb-0.5">{item.name}</div>
                <div className="text-[11px] text-dobot-muted mb-3 line-clamp-1">
                  {item.description}
                </div>

                <button
                  onClick={() =>
                    setGhostPlacementType(isCurrentlyPlacing ? null : item.typeId)
                  }
                  className={`w-full py-1.5 px-2 rounded flex items-center justify-center gap-1.5 text-xs font-semibold transition-all ${
                    isCurrentlyPlacing
                      ? 'bg-dobot-danger hover:bg-dobot-dangerHover text-white'
                      : 'bg-dobot-accent hover:bg-dobot-accentHover text-white shadow-sm shadow-dobot-accent/20'
                  }`}
                >
                  {isCurrentlyPlacing ? (
                    <span>Cancel Placement</span>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Place on Table</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- PLACED OBJECTS LIST ---------------- */}
      <div className="p-3 rounded-lg bg-dobot-panel border border-dobot-border/80 shadow-md flex-1">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-dobot-border/50">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-dobot-accent" />
            <span className="text-xs font-semibold text-dobot-text uppercase tracking-wider">
              Placed Objects ({objects.length})
            </span>
          </div>
          <span className="text-[10px] text-dobot-muted">Select to view or copy coordinates</span>
        </div>

        {objects.length === 0 ? (
          <div className="p-6 text-center text-dobot-muted text-xs border border-dashed border-dobot-border/60 rounded-lg">
            No objects placed on the table yet. Click an object above to place one.
          </div>
        ) : (
          <div className="space-y-2.5">
            {objects.map((obj) => {
              const def = OBJECT_REGISTRY[obj.typeId];
              const isSelected = selectedObjectId === obj.id;

              // Calculate top-center coordinates in robot frame
              const topX = obj.position[0];
              const topY = obj.position[1];
              const topZ = obj.position[2] + (def ? def.dimensions.height : 0);

              return (
                <div
                  key={obj.id}
                  onClick={() => setSelectedObjectId(obj.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-dobot-surface border-dobot-accent ring-1 ring-dobot-accent/60 shadow-md'
                      : 'bg-dobot-surface/60 border-dobot-border/70 hover:bg-dobot-surface hover:border-dobot-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm border"
                        style={{ backgroundColor: def?.color || '#999' }}
                      />
                      <span className="text-xs font-bold text-white">{obj.name}</span>
                      {obj.attachedToTool && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                          Attached to Tool
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Copy Top-Center Coordinates Shortcut */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCoords(topX, topY, topZ, obj.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-dobot-panel hover:bg-dobot-border border border-dobot-border text-dobot-text hover:text-white transition-colors"
                        title="Copy Top-Center (Pickup) Coordinates to Clipboard"
                      >
                        {copiedId === obj.id ? (
                          <>
                            <Check className="w-3 h-3 text-dobot-success" />
                            <span className="text-dobot-success text-[11px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-dobot-accent" />
                            <span className="text-[11px]">Copy Pick XYZ</span>
                          </>
                        )}
                      </button>

                      {/* Delete Object */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteObject(obj.id);
                        }}
                        className="p-1 rounded text-dobot-muted hover:text-dobot-danger hover:bg-dobot-danger/10 transition-colors"
                        title="Delete object"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Coordinates Badges */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
                      <div className="text-[10px] text-dobot-muted font-sans mb-0.5">
                        Base Position:
                      </div>
                      <span className="text-dobot-text">
                        [{obj.position[0].toFixed(1)}, {obj.position[1].toFixed(1)},{' '}
                        {obj.position[2].toFixed(1)}]
                      </span>
                    </div>

                    <div className="p-1.5 rounded bg-dobot-bg/60 border border-dobot-border/40">
                      <div className="text-[10px] text-sky-400 font-sans mb-0.5">
                        Top Pickup Target:
                      </div>
                      <span className="text-sky-300 font-bold">
                        [{topX.toFixed(1)}, {topY.toFixed(1)}, {topZ.toFixed(1)}]
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
