// Iter logomark v2: the favicon's own construction (see app/icon.svg),
// reused directly rather than redrawn -- same coordinates, same tile +
// diagonal-wipe technique. A rounded tile sits behind the mark now, instead
// of bars that blended into whatever surface they sat on:
//   - tile   = var(--m-logo)          -- gold in light, ember in dark
//   - rays   = var(--m-text-on-media) -- the one white value that's
//              IDENTICAL in both themes (see globals.css), so the rays
//              stay a fixed white on a per-theme brand tile rather than
//              becoming another theme-varying color
// The diagonal wipe overlay (rays fading back into the tile toward the
// top) is the tile color at increasing opacity, same as the favicon.
export function LogoMarkV2({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Iter"
      className={className}
    >
      <rect width="512" height="512" rx={64} fill="var(--m-logo)" />
      <rect x={402.83} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={375.29} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={347.78} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={320.23} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={292.72} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={265.17} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={237.66} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={210.12} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={182.6} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={155.06} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={127.55} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={100.0} y={101.29} width={9.18} height={309.42} fill="var(--m-text-on-media)" />
      <rect x={402.83} y={101.29} width={9.18} height={148.52} opacity={0.08} fill="var(--m-logo)" />
      <rect x={375.29} y={110.57} width={9.18} height={146.97} opacity={0.16} fill="var(--m-logo)" />
      <rect x={347.78} y={119.86} width={9.18} height={148.52} opacity={0.24} fill="var(--m-logo)" />
      <rect x={320.23} y={135.32} width={9.18} height={148.52} opacity={0.32} fill="var(--m-logo)" />
      <rect x={292.72} y={158.54} width={9.18} height={145.43} opacity={0.4} fill="var(--m-logo)" />
      <rect x={265.17} y={186.39} width={9.18} height={145.43} opacity={0.48} fill="var(--m-logo)" />
      <rect x={237.66} y={211.13} width={9.18} height={145.43} opacity={0.56} fill="var(--m-logo)" />
      <rect x={210.25} y={231.25} width={9.18} height={146.97} opacity={0.64} fill="var(--m-logo)" />
      <rect x={182.6} y={243.61} width={9.18} height={145.43} opacity={0.72} fill="var(--m-logo)" />
      <rect x={155.06} y={259.1} width={9.18} height={140.79} opacity={0.8} fill="var(--m-logo)" />
      <rect x={127.55} y={265.28} width={9.18} height={145.43} opacity={0.88} fill="var(--m-logo)" />
      <rect x={100.0} y={279.22} width={9.18} height={131.5} fill="var(--m-logo)" />
    </svg>
  );
}
