import React from 'react';

interface ColorSwatchProps {
  hex: string;
  color: string;
}

export function ColorSwatch({ hex, color }: ColorSwatchProps) {
  return (
    <div className="flex w-full items-center gap-4">
      <div className={`h-10 w-[100px] rounded ${color}`} />
      <div className="flex-col space-y-2">
        <code className="w-[40px] font-bold text-xs text-gray-300">
          {color} <br/>
        </code>
        <code className="w-16 font-mono text-xs text-gray-400">{hex}</code>
      </div>
    </div>
  );
}
