// Display coordinates belong to a Japan-sized game globe, never to real Earth.
// Convert back to WGS84 before submitting or calculating any real-world distance.
export const JAPAN_GLOBE = { longitude: 135, latitude: 35.5, scale: 6.5 };
export function toGlobe([latitude, longitude]) {
  return [(latitude - JAPAN_GLOBE.latitude) * JAPAN_GLOBE.scale, (longitude - JAPAN_GLOBE.longitude) * JAPAN_GLOBE.scale];
}
export function fromGlobe([latitude, longitude]) {
  return [latitude / JAPAN_GLOBE.scale + JAPAN_GLOBE.latitude, longitude / JAPAN_GLOBE.scale + JAPAN_GLOBE.longitude];
}
export function globeVector(coordinate, radius = 1) {
  const [lat, lng] = toGlobe(coordinate).map(n => n * Math.PI / 180);
  return [radius * Math.cos(lat) * Math.sin(lng), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lng)];
}
export function coordinateFromVector([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return fromGlobe([Math.asin(Math.max(-1, Math.min(1, y / length))) * 180 / Math.PI, Math.atan2(x, z) * 180 / Math.PI]);
}
