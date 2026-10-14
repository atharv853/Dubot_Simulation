'use client';

import React from 'react';
import { Construction } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

export const ComingSoonTab: React.FC<Props> = ({ title, description }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-dobot-surface border border-dobot-border/80 flex items-center justify-center text-dobot-accent mb-4 shadow-lg">
        <Construction className="w-8 h-8" />
      </div>
      <h2 className="text-base font-bold text-white mb-2">{title}</h2>
      <p className="text-xs text-dobot-muted max-w-xs mb-4">{description}</p>
      <span className="text-[11px] px-3 py-1 rounded-full bg-dobot-accent/10 border border-dobot-accent/30 text-dobot-accent font-medium">
        Planned in next firmware update
      </span>
    </div>
  );
};
