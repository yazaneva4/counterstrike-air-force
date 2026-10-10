// Render at a fixed 4K long edge, preserving the screen's aspect ratio.
// Ordinary presets retain adaptive scaling; 4K stays fixed unless the GPU
// cannot allocate a surface that large.
export function renderPlan(width, height, { quality = 'medium', dpr = 1, scale = 1, maxDimension = 8192 } = {}) {
  width = Math.max(1, width); height = Math.max(1, height);
  const locked = quality === '4k';
  const longest = Math.max(width, height);
  const wanted = locked ? 3840 / longest : Math.min(dpr, { high: 1.75, medium: 1.35, low: 1 }[quality] || 1.35) * scale;
  const ratio = Math.min(wanted, Math.max(1, maxDimension) / longest);
  // Avoid losing the final pixel to floating-point division on odd viewports.
  const pixelRatio = locked ? ratio * (1 + Number.EPSILON * 2) : ratio;
  return { pixelRatio, width: Math.floor(width * pixelRatio), height: Math.floor(height * pixelRatio), locked, limited: ratio < wanted };
}
