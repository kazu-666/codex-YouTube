import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import land from './japan-land.json';
import { globeVector, coordinateFromVector, toGlobe, JAPAN_GLOBE } from './japan-projection.js';
import { pointAlong } from './route.js';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const INITIAL_DISTANCE = 3.35;
const DETAIL_DISTANCE = 1.85;
const tileLatitude = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
const cities = [
  [[43.0618,141.3545], '札幌', 'Sapporo'], [[38.2682,140.8694], '仙台', 'Sendai'],
  [[35.6762,139.6503], '東京', 'Tokyo'], [[34.6937,135.5023], '大阪', 'Osaka'],
  [[33.5904,130.4017], '福岡', 'Fukuoka'], [[26.2124,127.6809], '那覇', 'Naha']
];

export function createJapanGlobe({ container, locale, view, guess, correct, readOnly, animate = false, routeColor, onSelect, onStatus, onReveal, onDetail }) {
  let disposed = false, dirty = true, frame, finished = false, progress = 0;
  let cameraTransition, routeStart, transitioning = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = !!(correct && animate && !reduced);
  const width = () => Math.max(1, container.clientWidth), height = () => Math.max(1, container.clientHeight);
  let fitDistance = INITIAL_DISTANCE / Math.min(1, width() / height());
  container.dataset.mode = 'globe';
  container.dataset.ready = 'false';
  container.dataset.imagery = 'loading';
  onStatus('loading');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, width() / height(), .05, 50);
  camera.position.fromArray(view?.camera || [0, 0, fitDistance]);
  if (view?.center) camera.position.fromArray(globeVector([view.center[1], view.center[0]], fitDistance));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(width(), height());
  const canvas = renderer.domElement;
  canvas.className = 'japan-globe-canvas';
  canvas.setAttribute('aria-label', locale === 'ja' ? '日本列島を大きく描いた、指で回せる球体地図。ピンチで詳細へ拡大できます。' : 'Rotatable Japan globe. Pinch to zoom into the detailed map.');
  canvas.style.touchAction = 'none';
  container.append(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .8;
  controls.minDistance = 1.3;
  controls.maxDistance = fitDistance * 1.5;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 2048; textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext('2d');
  const ocean = ctx.createLinearGradient(0, 0, 0, 1024);
  ocean.addColorStop(0, '#17384c'); ocean.addColorStop(.45, '#1c4c63'); ocean.addColorStop(1, '#103247');
  ctx.fillStyle = ocean; ctx.fillRect(0, 0, 2048, 1024);
  ctx.strokeStyle = '#abd3d815'; ctx.lineWidth = .8;
  for (let x = 0; x < 2048; x += 2048 / 12) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,1024); ctx.stroke(); }
  for (let y = 0; y < 1024; y += 1024 / 12) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(2048,y); ctx.stroke(); }
  const texturePoint = coordinate => {
    const [lat, lng] = toGlobe(coordinate);
    return [(lng + 180) / 360 * 2048, (90 - lat) / 180 * 1024];
  };
  function landPath() {
    ctx.beginPath();
    for (const polygon of land.geometry.coordinates) for (const ring of polygon) {
      ring.forEach(([lng, lat], index) => { const [x,y] = texturePoint([lat,lng]); if (!index) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.closePath();
    }
  }
  landPath(); ctx.fillStyle = '#87977b'; ctx.fill('evenodd');
  ctx.strokeStyle = '#d8e1bd99'; ctx.lineWidth = 1; ctx.stroke();
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: texture, roughness: .94, metalness: .02 }));
  globe.rotation.y = -Math.PI / 2;
  scene.add(globe);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 48), new THREE.MeshBasicMaterial({ color: '#7ebcce', side: THREE.BackSide, transparent: true, opacity: .16, depthWrite: false }));
  scene.add(halo);
  scene.add(new THREE.AmbientLight('#dce9f4', 1.6));
  const light = new THREE.DirectionalLight('#fff3db', 2.1); light.position.set(-3, 4, 5); scene.add(light);

  const labels = [];
  const objects = [];
  function addLabel(coordinate, kind, label) {
    const el = document.createElement('div');
    el.className = kind === 'city' ? 'globe-city' : `atlas-pin ${kind}`;
    if (kind === 'city') el.textContent = label;
    else {
      const text = kind === 'correct' ? (locale === 'ja' ? '正解' : 'Answer') : (locale === 'ja' ? '選択地点' : 'Your pin');
      el.innerHTML = `<span class="pin-label">${text}</span><span class="pin-dot"></span>`;
    }
    container.append(el);
    const item = { el, coordinate, kind };
    labels.push(item); return item;
  }
  cities.forEach(([coordinate, ja, en]) => addLabel(coordinate, 'city', locale === 'ja' ? ja : en));
  let guessLabel = guess && addLabel(guess, 'guess');
  const correctLabel = correct && addLabel(correct, 'correct');
  if (shouldAnimate) correctLabel.el.classList.add('awaiting-reveal');
  function setGuess(coordinate) {
    guess = coordinate;
    if (guessLabel) guessLabel.coordinate = coordinate;
    else guessLabel = addLabel(coordinate, 'guess');
    dirty = true;
  }

  let tube, head;
  if (guess && correct && Math.hypot(...guess.map((n,i)=>n-correct[i])) > 1e-8) {
    const points = Array.from({ length: 121 }, (_, i) => {
      const [lng,lat] = pointAlong(guess,correct,i / 120);
      return new THREE.Vector3(...globeVector([lat,lng],1.009));
    });
    tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 180, .0035, 6, false), new THREE.MeshBasicMaterial({ color: routeColor || '#e4b974' }));
    head = new THREE.Mesh(new THREE.SphereGeometry(.012, 12, 8), new THREE.MeshBasicMaterial({color: '#fff2ce'}));
    scene.add(tube,head); objects.push(tube,head);
    const destination = new THREE.Vector3(...globeVector(guess)).add(new THREE.Vector3(...globeVector(correct))).normalize().multiplyScalar(fitDistance);
    cameraTransition = shouldAnimate ? { start: performance.now(), from: camera.position.clone(), to: destination } : null;
    if (!shouldAnimate) camera.position.copy(destination);
    routeStart = performance.now() + (shouldAnimate ? 650 : 0);
  }
  if (guess && correct && !routeStart) routeStart = performance.now() + (shouldAnimate ? 650 : 0);
  function updateRoute(value) {
    progress = value;
    if (tube) {
      tube.geometry.setDrawRange(0, Math.floor(value * 180) * 36);
      const [lng, lat] = pointAlong(guess,correct,value);
      head.position.fromArray(globeVector([lat,lng],1.015));
      head.visible = value < 1;
    }
    container.dataset.routeProgress = String(value);
    dirty = true;
  }
  function finishReveal() {
    if (!correct || finished || disposed) return;
    finished = true; updateRoute(1);
    correctLabel.el.classList.remove('awaiting-reveal');
    correctLabel.el.classList.add('arrived');
    container.dataset.reveal = 'complete';
    onReveal?.(1,true);
  }
  updateRoute(shouldAnimate ? 0 : 1);
  if (correct && !shouldAnimate) finishReveal();

  const attribution = document.createElement('div'); attribution.className = 'globe-attribution';
  attribution.innerHTML = '<details><summary>© Esri · Natural Earth ⓘ</summary><div>Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community.<br><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · <a href="/licenses/world-atlas-LICENSE.txt" target="_blank" rel="noopener noreferrer">world-atlas (ISC)</a></div></details>';
  container.append(attribution);

  // Render only Japan's land on the game sphere. No other country is enlarged
  // into this Japan-only world. Requests retain the provider's normal CORS/cache.
  const boxes = land.geometry.coordinates.map(polygon => {
    const coords = polygon.flat();
    return [Math.min(...coords.map(p=>p[0])), Math.min(...coords.map(p=>p[1])), Math.max(...coords.map(p=>p[0])), Math.max(...coords.map(p=>p[1]))];
  });
  const requests = [];
  const z = 5, n = 2 ** z;
  for (let x=26;x<=29;x++) for (let y=11;y<=14;y++) {
    const west=x/n*360-180, east=(x+1)/n*360-180, north=tileLatitude(y,n), south=tileLatitude(y+1,n);
    if (!boxes.some(b=>b[0]<=east && b[2]>=west && b[1]<=north && b[3]>=south)) continue;
    requests.push(new Promise(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!disposed) {
          ctx.save(); landPath(); ctx.clip('evenodd');
          for(let row=0;row<16;row++) {
            const top=tileLatitude(y+row/16,n), bottom=tileLatitude(y+(row+1)/16,n);
            const [dx,dy]=texturePoint([top,west]); const [right,lower]=texturePoint([bottom,east]);
            ctx.drawImage(img,0,row*img.height/16,img.width,img.height/16,dx,dy,right-dx,lower-dy+.2);
          }
          ctx.restore(); texture.needsUpdate=true; dirty=true;
        }
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = `${IMAGERY}/${z}/${y}/${x}`;
    }));
  }
  Promise.all(requests).then(results => {
    if (disposed) return;
    const available=results.some(Boolean);
    container.dataset.imagery = available ? 'ready' : 'unavailable';
    if (!available) onStatus('imagery-error');
  });

  const raycaster = new THREE.Raycaster();
  function underPointer(x=0,y=0) {
    raycaster.setFromCamera(new THREE.Vector2(x,y),camera);
    const hit=raycaster.intersectObject(globe,false)[0];
    return hit && coordinateFromVector(hit.point.toArray());
  }
  const pointers=new Map(); let multiTouch=false;
  function down(event) {
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:false});
    if(pointers.size>1)multiTouch=true;
  }
  function move(event) {
    const start=pointers.get(event.pointerId);
    if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>7)start.moved=true;
  }
  function up(event) {
    const start=pointers.get(event.pointerId);
    const choose=start && !start.moved && !multiTouch && pointers.size===1 && !readOnly;
    pointers.delete(event.pointerId); if(!pointers.size)multiTouch=false;
    if(choose) {
      const rect=canvas.getBoundingClientRect();
      const coordinate=underPointer((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
      if(coordinate){setGuess(coordinate);onSelect(coordinate);}
    }
  }
  const cancel=event=>{pointers.delete(event.pointerId);if(!pointers.size)multiTouch=false;};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);
  controls.addEventListener('start',()=>{cameraTransition=null;if(correct&&!finished)finishReveal();});
  controls.addEventListener('change',()=>{
    dirty=true;
    if(!disposed && !transitioning && camera.position.length()<DETAIL_DISTANCE) {
      const coordinate=underPointer() || [JAPAN_GLOBE.latitude,JAPAN_GLOBE.longitude];
      transitioning=true; onDetail({center:[coordinate[1],coordinate[0]],zoom:6.3,bearing:0,pitch:0});
    }
  });
  const resize=new ResizeObserver(()=>{if(disposed)return;const distance=INITIAL_DISTANCE/Math.min(1,width()/height());camera.position.multiplyScalar(distance/fitDistance);if(cameraTransition){cameraTransition.from.multiplyScalar(distance/fitDistance);cameraTransition.to.multiplyScalar(distance/fitDistance);}fitDistance=distance;controls.maxDistance=fitDistance*1.5;camera.aspect=width()/height();camera.updateProjectionMatrix();renderer.setSize(width(),height());dirty=true;});resize.observe(container);
  const projected=new THREE.Vector3();
  function tick(now) {
    if(disposed)return;
    if(cameraTransition) {
      const t=Math.min(1,(now-cameraTransition.start)/650), ease=1-(1-t)**3;
      camera.position.lerpVectors(cameraTransition.from,cameraTransition.to,ease);dirty=true;
      if(t===1)cameraTransition=null;
    }
    controls.update();
    if(correct&&!finished&&now>=routeStart) {
      const t=Math.min(1,(now-routeStart)/1250);updateRoute(t*(2-t));onReveal?.(progress,false);
      if(t===1)finishReveal();
    }
    if(dirty) {
      renderer.render(scene,camera);
      for(const label of labels) {
        const v=new THREE.Vector3(...globeVector(label.coordinate,1.008));
        const visible=v.dot(camera.position.clone().sub(v))>0;
        projected.copy(v).project(camera);
        const x=(projected.x+1)/2*width(),y=(1-projected.y)/2*height();
        label.el.style.display=visible&&projected.z<1&&x>-40&&x<width()+40&&y>-30&&y<height()+40?'':'none';
        label.el.style.transform=label.kind==='city'?`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`:`translate3d(${x-12}px,${y-35}px,0)`;
      }
      const coordinate=coordinateFromVector(camera.position.toArray());
      container.dataset.zoom=String(3.4+Math.log2(fitDistance/camera.position.length())*1.4);
      container.dataset.latitude=String(coordinate[0]);container.dataset.longitude=String(coordinate[1]);dirty=false;
    }
    frame=requestAnimationFrame(tick);
  }
  controls.update();camera.lookAt(0,0,0);frame=requestAnimationFrame(tick);
  container.dataset.ready='true';onStatus('ready');
  return {
    getView:()=>({camera:camera.position.toArray()}),
    zoomIn(){camera.position.multiplyScalar(.72);dirty=true;controls.update();},
    zoomOut(){camera.position.multiplyScalar(1.3);dirty=true;controls.update();},
    centerPin(){if(readOnly)return;const coordinate=underPointer();if(coordinate){setGuess(coordinate);onSelect(coordinate);}},
    focus(coordinate){onDetail({center:[coordinate[1],coordinate[0]],zoom:16,bearing:0,pitch:0});},
    skipReveal:finishReveal,
    destroy(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);labels.forEach(l=>l.el.remove());attribution.remove();[globe,halo,...objects].forEach(object=>{object.geometry.dispose();object.material.dispose();});texture.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  };
}
