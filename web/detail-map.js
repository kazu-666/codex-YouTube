import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { routeBetween, pointAlong } from './route.js';
import { glide, REVEAL_DURATION_MS } from './reveal-motion.js';

// Bundle the worker and its imports for both Vite development and static builds.
maplibregl.setWorkerUrl(workerUrl);

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const INITIAL_VIEW = { center: [137, 36.5], zoom: 3.4, bearing: 0, pitch: 0 };

export function boundsFor(guess, correct) {
  let end = correct[1];
  while (end - guess[1] > 180) end -= 360;
  while (end - guess[1] < -180) end += 360;
  return [[Math.min(guess[1], end), Math.min(guess[0], correct[0])], [Math.max(guess[1], end), Math.max(guess[0], correct[0])]];
}

export function createDetailMap({ container, locale, view, guess, correct, readOnly, animate = false, routeColor = '#d7a164', onReveal, onSelect, onStatus, onView }) {
  let map;
  let guessMarker;
  let correctMarker;
  let frame;
  let revealTimer;
  let destroyed = false;
  let revealed = false;
  let imageryFailed = false;
  const markers = [];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initialView = { ...INITIAL_VIEW, zoom: INITIAL_VIEW.zoom + Math.log2(Math.min(container.clientWidth, container.clientHeight) / 390) };
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
    onReveal?.(1, true);
    return { destroy() {}, getView: () => view };
  }
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  map.getCanvas().setAttribute('aria-label', locale === 'ja' ? '回転とピンチ拡大ができる地球儀' : 'Interactive globe: drag to rotate and pinch to zoom');
  container.dataset.ready = 'false';
  container.dataset.zoom = String(map.getZoom());
  container.dataset.longitude = String(map.getCenter().lng);
  container.dataset.latitude = String(map.getCenter().lat);
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
  if (correct) {
    correctMarker = marker(correct, 'correct');
    if (animate && !reduceMotion) correctMarker.getElement().classList.add('awaiting-reveal');
  }
  function updateRoute(progress) {
    map.getSource('answer-route')?.setData(routeBetween(guess, correct, progress));
    map.getSource('route-trail')?.setData(routeBetween(guess, correct, progress, Math.max(0,progress-.16)));
    map.getSource('route-head')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pointAlong(guess, correct, progress) } });
    container.dataset.routeProgress = String(progress);
  }
  function finishReveal() {
    if (destroyed || revealed || !correct) return;
    revealed = true;
    clearTimeout(revealTimer);
    cancelAnimationFrame(frame);
    updateRoute(1);
    correctMarker?.getElement().classList.remove('awaiting-reveal');
    correctMarker?.getElement().classList.add('arrived');
    if (map.getLayer('route-head')) map.setPaintProperty('route-head', 'circle-opacity', 0);
    if (map.getLayer('route-head-glow')) map.setPaintProperty('route-head-glow', 'circle-opacity', 0);
    if (map.getLayer('route-trail')) map.setPaintProperty('route-trail', 'line-opacity', 0);
    container.dataset.reveal = 'complete';
    onReveal?.(1, true);
  }
  function animateRoute() {
    if (destroyed || revealed) return;
    const started = performance.now();
    container.dataset.reveal = 'drawing';
    function draw(now) {
      if (destroyed || revealed) return;
      const t = Math.min(1, (now - started) / REVEAL_DURATION_MS);
      const progress = glide(t);
      updateRoute(progress);
      onReveal?.(progress, false);
      if (t < 1) frame = requestAnimationFrame(draw);
      else finishReveal();
    }
    frame = requestAnimationFrame(draw);
  }
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
    map.addLayer({ id: 'fieldnotes-imagery', type: 'raster', source: 'fieldnotes-imagery', paint: { 'raster-fade-duration': 200, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 11, 1, 14, .5, 17, .08] } }, firstLabel);
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
      map.addSource('answer-route', { type: 'geojson', data: routeBetween(guess, correct, animate && !reduceMotion ? 0 : 1) });
      map.addLayer({ id: 'answer-route-glow', type: 'line', source: 'answer-route', paint: { 'line-color': routeColor, 'line-width': 9, 'line-opacity': .12, 'line-blur': 4 } });
      map.addLayer({ id: 'answer-route', type: 'line', source: 'answer-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': routeColor, 'line-width': 2.2, 'line-opacity': .7 } });
      map.addSource('route-trail', { type: 'geojson', data: routeBetween(guess, correct, 0) });
      map.addLayer({ id: 'route-trail', type: 'line', source: 'route-trail', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#fff2d2', 'line-width': 5, 'line-opacity': .6, 'line-blur': 2 } });
      map.addSource('route-head', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pointAlong(guess, correct, 0) } } });
      map.addLayer({ id: 'route-head-glow', type: 'circle', source: 'route-head', paint: { 'circle-radius': 14, 'circle-color': routeColor, 'circle-opacity': .55, 'circle-blur': 1 } });
      map.addLayer({ id: 'route-head', type: 'circle', source: 'route-head', paint: { 'circle-radius': 4, 'circle-color': '#fff3d6', 'circle-stroke-width': 5, 'circle-stroke-color': routeColor, 'circle-stroke-opacity': .4 } });
      if (!view) map.fitBounds(boundsFor(guess, correct), { padding: { top: 90, bottom: 90, left: 60, right: 60 }, maxZoom: 13, duration: animate && !reduceMotion ? 650 : 0 });
      if (revealed) {
        updateRoute(1);
        map.setPaintProperty('route-head', 'circle-opacity', 0);
      } else if (animate && !reduceMotion) revealTimer = setTimeout(animateRoute, 80);
      else finishReveal();
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
    skipReveal: finishReveal,
    centerPin() { if (readOnly || !map.isStyleLoaded()) return; const c = map.getCenter(); const coord = [c.lat, ((c.lng + 180) % 360 + 360) % 360 - 180]; setGuess(coord); onSelect(coord); },
    destroy() { destroyed = true; clearTimeout(revealTimer); cancelAnimationFrame(frame); markers.forEach(m => m.remove()); map.remove(); }
  };
}
