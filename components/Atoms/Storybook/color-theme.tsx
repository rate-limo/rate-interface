import React from "react"
import { ColorSwatch } from "./color-swatch"

interface ColorThemeProps {
  title: string
  colors: Array<string>
  hexes: Array<string>
}

export function ColorTheme({ title, colors, hexes }: ColorThemeProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-normal text-white">{title}</h2>
      <div className="space-y-2">
        {hexes.map((hex, index) => (
          <ColorSwatch key={hex} hex={hex} color={colors[index]} />
        ))}
      </div>
    </div>
  )
}

