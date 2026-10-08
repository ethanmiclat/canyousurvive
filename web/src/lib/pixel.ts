/** A stepped circular outline for SVG game props; no raster filters or hit-area changes. */
export function pixelCircle(cx: number, cy: number, radius: number, grid = 6) {
  const snap = (n: number) => Math.round(n / grid) * grid
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = i / 64 * Math.PI * 2
    return [snap(cx + Math.cos(angle) * radius), snap(cy + Math.sin(angle) * radius)]
  })
  return `M${points[0][0]} ${points[0][1]} ${points.slice(1).map(([x, y]) => `H${x} V${y}`).join(' ')} Z`
}
