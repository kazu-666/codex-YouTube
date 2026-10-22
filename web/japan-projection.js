// A Japan-sized game world. Display angles never enter distance scoring.
export const JAPAN_GLOBE = { longitude: 136, latitude: 35.5, scale: 13 };
const rad = Math.PI / 180;
export function toGlobe([latitude, longitude]) {
  // Compress latitude smoothly so enlarging Japan cannot fold it over a pole.
  return [Math.atan((latitude - JAPAN_GLOBE.latitude) * JAPAN_GLOBE.scale * rad) / rad,
    (longitude - JAPAN_GLOBE.longitude) * JAPAN_GLOBE.scale];
}
export function fromGlobe([latitude, longitude]) {
  return [Math.tan(latitude * rad) / (JAPAN_GLOBE.scale * rad) + JAPAN_GLOBE.latitude,
    longitude / JAPAN_GLOBE.scale + JAPAN_GLOBE.longitude];
}
export function globeVector(coordinate, radius = 1) {
  const [lat, lng] = toGlobe(coordinate).map(n => n * rad);
  return [radius * Math.cos(lat) * Math.sin(lng), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lng)];
}
export function coordinateFromVector([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return fromGlobe([Math.asin(Math.max(-1, Math.min(1, y / length))) / rad, Math.atan2(x, z) / rad]);
}
