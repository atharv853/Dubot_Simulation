'use client';

import React, { useEffect } from 'react';
import { useDobotStore } from '@/lib/store/useDobotStore';
import { AlertTriangle, Info, CheckCircle, X } from 'lucide-react';

export const StatusBanner: React.FC = () => {
  const { jogWarning, setJogWarning, suctionHint, setSuctionHint, isEmergencyStopped } =
    useDobotStore();

  useEffect(() => {
    if (jogWarning && !isEmergencyStopped) {
      const timer = setTimeout(() => {
        setJogWarning(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [jogWarning, isEmergencyStopped, setJogWarning]);

  useEffect(() => {
    if (suctionHint) {
      const timer = setTimeout(() => {
        setSuctionHint(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [suctionHint, setSuctionHint]);

  if (!jogWarning && !suctionHint) return null;

  return (
    <div className="px-4 py-2 space-y-1.5 shrink-0 z-20">
      {/* Jog / Limit / Safety Warning */}
      {jogWarning && (
        <div
          className={`flex items-center justify-between px-3 py-2 rounded-md text-xs border transition-all ${
            isEmergencyStopped
              ? 'bg-dobot-danger/20 border-dobot-danger/60 text-dobot-danger font-semibold'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{jogWarning}</span>
          </div>
          {!isEmergencyStopped && (
            <button
              onClick={() => setJogWarning(null)}
              className="text-dobot-muted hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Suction / Tool Action Hint */}
      {suctionHint && !jogWarning && (
        <div className="flex items-center justify-between px-3 py-2 rounded-md text-xs bg-dobot-accent/15 border border-dobot-accent/40 text-sky-300">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-dobot-accent shrink-0" />
            <span>{suctionHint}</span>
          </div>
          <button
            onClick={() => setSuctionHint(null)}
            className="text-dobot-muted hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
