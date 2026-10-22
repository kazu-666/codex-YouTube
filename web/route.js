const rad = Math.PI / 180;
const vector = ([lat, lng]) => [Math.cos(lat * rad) * Math.cos(lng * rad), Math.cos(lat * rad) * Math.sin(lng * rad), Math.sin(lat * rad)];

/** Spherical interpolation, including a stable arc for antipodal endpoints. */
export function pointAlong(a, b, progress) {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return [a[1], a[0]];
  if (t === 1) return [b[1], b[0]];
  const start = vector(a), end = vector(b);
  const dot = Math.max(-1, Math.min(1, start.reduce((sum, n, i) => sum + n * end[i], 0)));
  const angle = Math.acos(dot);
  if (angle < 1e-8) return [a[1], a[0]];
  let tangent = end.map((n, i) => n - dot * start[i]);
  let norm = Math.hypot(...tangent);
  if (norm < 1e-8) {
    const axis = Math.abs(start[2]) < .8 ? [0, 0, 1] : [0, 1, 0];
    const projection = start.reduce((sum, n, i) => sum + n * axis[i], 0);
    tangent = axis.map((n, i) => n - projection * start[i]);
    norm = Math.hypot(...tangent);
  }
  const p = start.map((n, i) => n * Math.cos(angle * t) + tangent[i] / norm * Math.sin(angle * t));
  return [Math.atan2(p[1], p[0]) / rad, Math.atan2(p[2], Math.hypot(p[0], p[1])) / rad];
}

/** A growing great-circle line, split where it crosses the antimeridian. */
export function routeBetween(a, b, progress = 1, start = 0) {
  const limit = Math.max(0, Math.min(1, progress));
  const beginning = Math.max(0, Math.min(limit, start));
  const lines = [[]];
  const count = Math.max(1, Math.ceil((limit - beginning) * 100));
  for (let i = 0; i <= count; i++) {
    const coord = pointAlong(a, b, beginning + (limit - beginning) * i / count);
    const line = lines.at(-1), last = line.at(-1);
    if (last && Math.abs(last[0] - coord[0]) > 180) {
      const side = last[0] > 0 ? 180 : -180;
      const unwrapped = coord[0] + (side > 0 ? 360 : -360);
      const lat = last[1] + (coord[1] - last[1]) * (side - last[0]) / (unwrapped - last[0]);
      line.push([side, lat]);
      lines.push([[-side, lat]]);
    }
    lines.at(-1).push(coord);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
}
