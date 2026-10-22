import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { routeBetween, pointAlong } from './route.js';
import { glide, REVEAL_DURATION_MS } from './reveal-motion.js';

maplibregl.setWorkerUrl(workerUrl);
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const JAPAN = [[122, 23], [147, 46.5]];
const empty = () => ({ type: 'FeatureCollection', features: [] });

export function createDetailMap(initialOptions) {
  let options = initialOptions;
  const { container } = options;
  let destroyed = false, ready = false, frame, timer, revealed = false, lastStatus = 'loading', lastLocale;
  const status = value => { lastStatus = value; options.onStatus?.(value); };
  let guessMarker, correctMarker;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let map;
  try {
    map = new maplibregl.Map({
      container, style: MAP_STYLE, center: [137, 36], zoom: 4,
      ...(options.view || {}), minZoom: 2.2, maxZoom: 19, maxPitch: 0,
      renderWorldCopies: false, maxBounds: [[118, 18], [153, 50]],
      attributionControl: { compact: true, customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>' },
      dragRotate: false, touchZoomRotate: true, touchPitch: false,
      clickTolerance: 7, canvasContextAttributes: { antialias: true }
    });
  } catch (error) {
    status('error');
    const noop = () => {};
    return { destroy: noop, getView: () => options.view, update(next) { options = next; status('error'); if (options.correct) options.onReveal?.(1, true); }, zoomIn: noop, zoomOut: noop, reset: noop, area: noop, focus: noop, focusPin: noop, centerPin: noop, skipReveal() { if (options.correct) options.onReveal?.(1, true); } };
  }
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
  container.dataset.ready = 'false';
  status('loading');
  function recordView() {
    const c = map.getCenter();
    Object.assign(container.dataset, { zoom: String(map.getZoom()), longitude: String(c.lng), latitude: String(c.lat) });
    if (guessMarker) {
      const p = map.project(guessMarker.getLngLat());
      options.onPinVisibility?.(p.x >= 0 && p.y >= 0 && p.x <= container.clientWidth && p.y <= container.clientHeight);
    }
  }
  function marker(coordinate, kind) {
    const el = document.createElement('div'); el.className = `atlas-pin ${kind}`;
    el.innerHTML = '<span class="pin-label"></span><span class="pin-dot"></span>';
    const result = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([coordinate[1], coordinate[0]]).addTo(map);
    return result;
  }
  function setGuess(coordinate) {
    if (guessMarker) guessMarker.setLngLat([coordinate[1], coordinate[0]]);
    else guessMarker = marker(coordinate, 'guess');
    guessMarker.getElement().querySelector('.pin-label').textContent = options.locale === 'ja' ? '選択地点' : 'Your pin';
    recordView();
  }
  function data(id, value) { map.getSource(id)?.setData(value); }
  function setBasemap(mode) {
    options.basemap = mode;
    container.dataset.basemap = mode;
    if (!ready || !map.getLayer('site-imagery')) return;
    map.setLayoutProperty('site-imagery', 'visibility', mode === 'satellite' ? 'visible' : 'none');
    if (map.getLayer('answer-route')) map.setPaintProperty('answer-route', 'line-color', mode === 'satellite' ? '#ffda8a' : '#a45f3b');
  }
  function route(progress) {
    if (!options.guess || !options.correct) return;
    data('answer-route', routeBetween(options.guess, options.correct, progress));
    data('route-trail', progress === 1 ? empty() : routeBetween(options.guess, options.correct, progress, Math.max(0, progress - .18)));
    data('route-head', progress === 1 ? empty() : { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pointAlong(options.guess, options.correct, progress) } });
    container.dataset.routeProgress = String(progress);
  }
  function finishReveal() {
    if (destroyed || revealed || !options.correct) return;
    revealed = true; clearTimeout(timer); cancelAnimationFrame(frame);
    route(1); correctMarker?.getElement().classList.remove('awaiting-reveal');
    correctMarker?.getElement().classList.add('arrived');
    container.dataset.reveal = 'complete'; options.onReveal?.(1, true);
  }
  function startReveal() {
    if (!options.correct) return;
    if (!options.animate || reduceMotion || !options.guess) return finishReveal();
    const start = performance.now(); container.dataset.reveal = 'drawing';
    function draw(now) {
      if (destroyed || revealed) return;
      const p = glide(Math.min(1, (now - start) / REVEAL_DURATION_MS));
      route(p); options.onReveal?.(p, false);
      if (now - start < REVEAL_DURATION_MS) frame = requestAnimationFrame(draw);
      else finishReveal();
    }
    frame = requestAnimationFrame(draw);
  }
  function fitArea(duration = 650) {
    const b = options.searchBounds;
    if (!b) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 145, bottom: 45, left: 22, right: 50 }, maxZoom: 12, duration: reduceMotion ? 0 : duration });
  }
  function apply(previousKey) {
    if (!ready || destroyed) return;
    setBasemap(options.basemap || 'satellite');
    if (lastLocale !== options.locale) {
      for (const layer of map.getStyle().layers || []) {
        if (layer.type === 'symbol' && layer.layout?.['text-field']) map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', options.locale === 'ja' ? 'name:ja' : 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
      }
      lastLocale = options.locale;
    }
    clearTimeout(timer); cancelAnimationFrame(frame); revealed = false;
    for (const id of ['answer-route', 'route-trail', 'route-head']) data(id, empty());
    correctMarker?.remove(); correctMarker = null;
    if (options.guess) setGuess(options.guess);
    else { guessMarker?.remove(); guessMarker = null; }
    const b = options.searchBounds;
    data('search-area', b ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } } : empty());
    data('previous-attempts', { type: 'FeatureCollection', features: (options.attempts || []).map(a => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [a.guess[1], a.guess[0]] } })) });
    if (options.questionKey !== previousKey && !options.view) fitArea(0);
    map.getCanvas().setAttribute('aria-label', options.locale === 'ja' ? '日本地図。指で移動・ピンチで拡大、タップでピンを置けます' : 'Japan map: drag, pinch to zoom, tap to place a pin');
    if (options.correct) {
      correctMarker = marker(options.correct, 'correct');
      correctMarker.getElement().querySelector('.pin-label').textContent = options.locale === 'ja' ? '目的地' : 'Destination';
      if (options.animate && !reduceMotion && options.guess) correctMarker.getElement().classList.add('awaiting-reveal');
      // Preserve the player's centre and zoom. Destination controls are explicit.
      timer = setTimeout(startReveal, 40);
    }
    recordView();
  }
  map.on('style.load', () => {
    ready = true; map.setProjection({ type: 'mercator' });
    const firstLabel = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id;
    map.addSource('site-imagery', { type: 'raster', tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community' });
    map.addLayer({ id: 'site-imagery', type: 'raster', source: 'site-imagery', layout: { visibility: options.basemap === 'map' ? 'none' : 'visible' }, paint: { 'raster-opacity': 1, 'raster-fade-duration': 200 } }, firstLabel);
    for (const id of ['search-area', 'previous-attempts', 'answer-route', 'route-trail', 'route-head']) map.addSource(id, { type: 'geojson', data: empty() });
    map.addLayer({ id: 'search-area-outline', type: 'line', source: 'search-area', paint: { 'line-color': '#ad843d', 'line-width': 2, 'line-dasharray': [3, 3] } });
    map.addLayer({ id: 'previous-attempts', type: 'circle', source: 'previous-attempts', paint: { 'circle-radius': 5, 'circle-color': '#a36a3c', 'circle-opacity': .6, 'circle-stroke-color': '#fff5de', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'route-glow', type: 'line', source: 'answer-route', paint: { 'line-color': '#b66f48', 'line-width': 9, 'line-opacity': .15, 'line-blur': 3 } });
    map.addLayer({ id: 'answer-route', type: 'line', source: 'answer-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#a45f3b', 'line-width': 2.5 } });
    map.addLayer({ id: 'route-trail', type: 'line', source: 'route-trail', paint: { 'line-color': '#fff9d7', 'line-width': 5, 'line-blur': 2 } });
    map.addLayer({ id: 'route-head-glow', type: 'circle', source: 'route-head', paint: { 'circle-color': '#f7b956', 'circle-radius': 15, 'circle-blur': 1, 'circle-opacity': .8 } });
    map.addLayer({ id: 'route-head', type: 'circle', source: 'route-head', paint: { 'circle-color': '#fff8d8', 'circle-radius': 4, 'circle-stroke-width': 2, 'circle-stroke-color': '#b77c44' } });
    container.dataset.ready = 'true'; status('ready'); apply(null);
  });
  map.on('error', event => {
    console.warn('Map request failed:', event.error?.message);
    if (event.sourceId === 'site-imagery' || /arcgisonline/.test(event.error?.message || '')) {
      setBasemap('map'); options.onBasemapFallback?.(); status('imagery-error'); return;
    }
    if (!ready) status('error');
    else status('tile-error');
  });
  map.on('click', event => {
    if (options.readOnly || !ready) return;
    const coord = [event.lngLat.lat, event.lngLat.lng];
    options.guess = coord; setGuess(coord); options.onSelect?.(coord);
  });
  map.on('moveend', recordView); recordView();
  return {
    update(next) { const previousKey = options.questionKey; options = next; apply(previousKey); map.resize(); status(lastStatus); },
    getView() { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: 0, pitch: 0 }; },
    resize() { map.resize(); },
    zoomIn() { map.zoomIn({ duration: reduceMotion ? 0 : 220 }); },
    zoomOut() { map.zoomOut({ duration: reduceMotion ? 0 : 220 }); },
    reset() { map.fitBounds(JAPAN, { padding: 30, duration: reduceMotion ? 0 : 650 }); },
    area() { fitArea(); },
    setBasemap,
    focus(coordinate, zoom = 16) { if (!coordinate) return; map.easeTo({ center: [coordinate[1], coordinate[0]], zoom, duration: reduceMotion ? 0 : 650 }); },
    focusPin() { if (guessMarker) { const c = guessMarker.getLngLat(); map.easeTo({ center: [c.lng, c.lat], duration: reduceMotion ? 0 : 500 }); } },
    skipReveal: finishReveal,
    centerPin() { if (options.readOnly || !ready) return; const c = map.getCenter(), coord = [c.lat, c.lng]; options.guess = coord; setGuess(coord); options.onSelect?.(coord); },
    destroy() { destroyed = true; clearTimeout(timer); cancelAnimationFrame(frame); guessMarker?.remove(); correctMarker?.remove(); map.remove(); }
  };
}
