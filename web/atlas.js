import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Bundle the worker and its imports for both Vite development and static builds.
maplibregl.setWorkerUrl(workerUrl);

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const INITIAL_VIEW = { center: [115, 25], zoom: .55, bearing: 0, pitch: 0 };

export function boundsFor(guess, correct) {
  let end = correct[1];
  while (end - guess[1] > 180) end -= 360;
  while (end - guess[1] < -180) end += 360;
  return [[Math.min(guess[1], end), Math.min(guess[0], correct[0])], [Math.max(guess[1], end), Math.max(guess[0], correct[0])]];
}

/** A spherical great circle, split at the antimeridian for GeoJSON rendering. */
export function routeBetween(a, b) {
  const vector = ([lat, lng]) => {
    const phi = lat * Math.PI / 180, theta = lng * Math.PI / 180;
    return [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)];
  };
  const start = vector(a), end = vector(b);
  const angle = Math.acos(Math.max(-1, Math.min(1, start.reduce((sum, n, i) => sum + n * end[i], 0))));
  // For coincident/antipodal endpoints there is no unique useful interpolation.
  if (Math.sin(angle) < 1e-8) return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
  const lines = [[]];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const p = start.map((n, k) => (n * Math.sin((1 - t) * angle) + end[k] * Math.sin(t * angle)) / Math.sin(angle));
    const coord = [Math.atan2(p[1], p[0]) * 180 / Math.PI, Math.atan2(p[2], Math.hypot(p[0], p[1])) * 180 / Math.PI];
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

export function createAtlas({ container, locale, view, guess, correct, readOnly, onSelect, onStatus, onView }) {
  let map;
  let guessMarker;
  let imageryFailed = false;
  const markers = [];
  const initialView = { ...INITIAL_VIEW, zoom: Math.max(0, Math.min(2.2, .55 + Math.log2(Math.min(container.clientWidth, container.clientHeight) * .82 / 225))) };
  try {
    map = new maplibregl.Map({
      container, style: MAP_STYLE, ...initialView, ...(view || {}),
      minZoom: 0, maxZoom: 19, maxPitch: 55,
      attributionControl: { compact: true, customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>' },
      dragRotate: false, touchZoomRotate: true, touchPitch: false,
      clickTolerance: 7,
      canvasContextAttributes: { antialias: true },
      locale: { 'AttributionControl.ToggleAttribution': locale === 'ja' ? '地図の出典' : 'Map attribution' }
    });
  } catch (error) {
    onStatus('error');
    return { destroy() {}, getView: () => view };
  }
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  map.getCanvas().setAttribute('aria-label', locale === 'ja' ? '回転とピンチ拡大ができる地球儀' : 'Interactive globe: drag to rotate and pinch to zoom');
  container.dataset.ready = 'false';
  container.dataset.zoom = String(map.getZoom());
  onStatus('loading');
  function marker(coordinate, kind) {
    const element = document.createElement('div');
    element.className = `atlas-pin ${kind}`;
    const label = kind === 'correct' ? (locale === 'ja' ? '正解' : 'Answer') : (locale === 'ja' ? '選択地点' : 'Your pin');
    element.innerHTML = `<span class="pin-label">${label}</span><span class="pin-dot"></span>`;
    const result = new maplibregl.Marker({ element, anchor: 'bottom', opacityWhenCovered: 0 }).setLngLat([coordinate[1], coordinate[0]]).addTo(map);
    markers.push(result);
    return result;
  }
  function setGuess(coordinate) {
    if (guessMarker) guessMarker.setLngLat([coordinate[1], coordinate[0]]);
    else guessMarker = marker(coordinate, 'guess');
  }
  if (guess) setGuess(guess);
  if (correct) marker(correct, 'correct');
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' });
    map.setSky({ 'sky-color': '#090f16', 'horizon-color': '#88aab0', 'sky-horizon-blend': .2, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, .7, 5, 0] });
    // Imagery sits above the vector land/roads and below every label. The vector
    // style remains usable when an imagery request is unavailable.
    const firstLabel = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id;
    map.addSource('fieldnotes-imagery', {
      type: 'raster', tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 19,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    });
    map.addLayer({ id: 'fieldnotes-imagery', type: 'raster', source: 'fieldnotes-imagery', paint: { 'raster-fade-duration': 200, 'raster-opacity': 1 } }, firstLabel);
    container.dataset.imagery = 'loading';
    map.on('sourcedata', event => {
      if (event.sourceId === 'fieldnotes-imagery' && event.isSourceLoaded && !imageryFailed) container.dataset.imagery = 'ready';
    });
    // Keep OpenFreeMap labels and feature detail; prefer the chosen language where available.
    for (const layer of map.getStyle().layers || []) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', locale === 'ja' ? 'name:ja' : 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
      }
    }
    if (guess && correct) {
      map.addSource('answer-route', { type: 'geojson', data: routeBetween(guess, correct) });
      map.addLayer({ id: 'answer-route', type: 'line', source: 'answer-route', paint: { 'line-color': '#cf8f48', 'line-width': 2.5, 'line-dasharray': [2, 2] } });
      map.fitBounds(boundsFor(guess, correct), { padding: 65, maxZoom: 16, duration: 0 });
    }
    container.dataset.ready = 'true';
    onStatus('ready');
  });
  map.on('error', event => {
    console.warn('Map request failed:', event.error?.message);
    if (event.sourceId === 'fieldnotes-imagery' || /server\.arcgisonline\.com/.test(event.error?.message || '')) {
      if (!imageryFailed) { imageryFailed = true; container.dataset.imagery = 'unavailable'; onStatus('imagery-error'); }
    } else if (!map.isStyleLoaded()) onStatus('error');
  });
  // MapLibre suppresses clicks after drag and multi-touch gestures.
  map.on('click', event => {
    if (readOnly || !map.isStyleLoaded()) return;
    const coord = [Math.max(-85.051129, Math.min(85.051129, event.lngLat.lat)), ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180];
    setGuess(coord);
    onSelect(coord);
  });
  map.on('moveend', () => {
    const center = map.getCenter();
    container.dataset.zoom = String(map.getZoom());
    container.dataset.longitude = String(center.lng);
    container.dataset.latitude = String(center.lat);
    onView?.(map.getZoom());
  });
  return {
    getView() { const center = map.getCenter(); return { center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; },
    zoomIn() { map.zoomIn({ duration: 250 }); },
    zoomOut() { map.zoomOut({ duration: 250 }); },
    reset() { map.flyTo({ ...initialView, duration: 900 }); },
    focus(coordinate) { map.flyTo({ center: [coordinate[1], coordinate[0]], zoom: 16, pitch: 0, bearing: 0, duration: 1000 }); },
    centerPin() { if (readOnly || !map.isStyleLoaded()) return; const c = map.getCenter(); const coord = [c.lat, ((c.lng + 180) % 360 + 360) % 360 - 180]; setGuess(coord); onSelect(coord); },
    destroy() { markers.forEach(m => m.remove()); map.remove(); }
  };
}
