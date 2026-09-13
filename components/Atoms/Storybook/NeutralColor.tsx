import React from 'react';
import { ColorTheme } from './color-theme';

const blackHexes = [
  '#999999',
  '#666666',
  '#333333',
  '#292929', 
  '#1F1F1F',
  '#141414',
  '#0A0A0A',
  '#050505',
  '#050505 opacity 12%',
];
const blackColors = [
  'bg-black-100',
  'bg-black-200',
  'bg-black-300',
  'bg-black-400',
  'bg-black-500',
  'bg-black-600',
  'bg-black-700',
  'bg-black-800',
  'bg-black-dark12',
];
const whiteHexes = [
  '#FFFFFF',
  '#ECEFF1',
  '#D0D7DC',
  '#B3BEC7',
  '#FFFFFF opacity 12%',
];
const whiteColors = [
  'bg-white-100',
  'bg-white-200',
  'bg-white-300',
  'bg-white-400',
  'bg-white-light12',
];

export function NeutralColor() {
  return (
    <div className="min-h-screen bg-black p-8 md:p-12 lg:p-16">
      <div className="mx-auto max-w-7xl space-y-12">
        <h1 className="text-dh1 font-regular font-satoshi text-white">
          Neutral <span className="italic text-[#A6ADE9]">colors</span>
        </h1>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12 lg:grid-cols-4">
          <ColorTheme title="Blacks" colors={blackColors} hexes={blackHexes} />
          <ColorTheme title="Whites" colors={whiteColors} hexes={whiteHexes} />
        </div>
      </div>
    </div>
  );
}
