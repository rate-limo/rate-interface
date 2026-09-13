import React from 'react';
import { ColorTheme } from './color-theme';

const purpleHexes = ["E9EBFA", "D3D6F4", "BCC2EF", "A6ADE9", "8A84C8", "5D5896", "3A3760", "1D1930"]
const redHexes = ["FFBFC0", "FF8082", "FF3D40", "FF0004", "BF0003", "7F0002", "400001", "140000"]
const greenHexes = ["C1E0D3", "84C2A8", "47A47D", "098551", "076843", "044228", "022114", "010B06"]
const orangeHexes = ["FFD7BF", "FFB180", "FF8940", "FF6200", "BF4900", "7F3100", "401800", "140800"]
const purpleColors = ["bg-primary-100", "bg-primary-200", "bg-primary-300", "bg-primary-default", "bg-primary-500", "bg-primary-600", "bg-primary-700", "bg-primary-800"]
const redColors = ["bg-red-100", "bg-red-200", "bg-red-300", "bg-red-400", "bg-red-500", "bg-red-600", "bg-red-700", "bg-red-800"]
const greenColors = ["bg-green-100", "bg-green-200", "bg-green-300", "bg-green-400", "bg-green-500", "bg-green-600", "bg-green-700", "bg-green-800"]
const orangeColors = ["bg-orange-100", "bg-orange-200", "bg-orange-300", "bg-orange-400", "bg-orange-500", "bg-orange-600", "bg-orange-700", "bg-orange-800"]

export function ThemeColor() {
    return (
      <div className="min-h-screen bg-black p-8 md:p-12 lg:p-16">
        <div className="max-w-7xl mx-auto space-y-12">
          <h1 className="text-dh1 font-regular font-satoshi text-white">
            Theme <span className="text-[#A6ADE9] italic">colors</span>
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            <ColorTheme title="Theme Purple" colors={purpleColors} hexes={purpleHexes}/>
            <ColorTheme title="Theme Red" colors={redColors} hexes={redHexes}/>
            <ColorTheme title="Theme Green" colors={greenColors} hexes={greenHexes}/>
            <ColorTheme title="Theme Orange" colors={orangeColors} hexes={orangeHexes}/>
          </div>
        </div>
      </div>
    )
  }
