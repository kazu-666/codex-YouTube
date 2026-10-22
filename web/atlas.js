import { createJapanGlobe } from './japan-globe.js';

/** One control surface: a Japan-sized globe at overview, WGS84 map at street scale. */
export function createAtlas(options) {
  const { container } = options;
  let active, disposed = false, generation = 0, mode = 'globe', savedView = options.view;
  let revealComplete = !options.animate;
  const complete = (progress, done) => { if(done)revealComplete=true; options.onReveal?.(progress,done); };
  function clear() { active?.destroy(); active=null; container.replaceChildren(); }
  function globe(view) {
    if(disposed)return;
    generation++; clear(); mode='globe';savedView=view;
    container.dataset.mode='globe';
    try {
      active=createJapanGlobe({...options,view,animate:options.animate&&!revealComplete,onReveal:complete,
        onDetail: detailView => queueMicrotask(()=>detail(detailView))});
    } catch(error) {
      console.warn('Japan globe unavailable:',error.message);
      // A detailed map remains playable on devices unable to render the sphere.
      detail({center:[135,35.5],zoom:4.3,bearing:0,pitch:0});
    }
  }
  async function detail(view) {
    if(disposed || mode==='loading-detail')return;
    const ticket=++generation;
    active?.skipReveal?.();clear();mode='loading-detail';savedView=view;
    container.dataset.mode='loading-detail';container.dataset.ready='false';options.onStatus('loading');
    try {
      const {createDetailMap}=await import('./detail-map.js');
      if(disposed||ticket!==generation)return;
      mode='detail';container.dataset.mode='detail';
      active=createDetailMap({...options,view,animate:options.animate&&!revealComplete,onReveal:complete,onView:zoom=>{
        options.onView?.(zoom);
        if(zoom<5.2)queueMicrotask(()=>globe());
      }});
    } catch(error) {
      if(!disposed){console.warn('Detailed map unavailable:',error.message);options.onStatus('error');if(options.correct)complete(1,true);}
    }
  }
  if(options.view?.mode==='detail')detail(options.view);
  else globe(options.view);
  return {
    getView:()=>({...(active?.getView?.() || savedView || {}),mode:mode==='loading-detail'?'detail':mode}),
    zoomIn:()=>active?.zoomIn?.(),zoomOut:()=>active?.zoomOut?.(),
    centerPin:()=>active?.centerPin?.(),
    focus:coordinate=>{if(mode==='detail')active?.focus?.(coordinate);else detail({center:[coordinate[1],coordinate[0]],zoom:16,bearing:0,pitch:0});},
    reset:()=>globe(),
    skipReveal:()=>{if(active)active.skipReveal?.();else if(options.correct)complete(1,true);},
    destroy(){disposed=true;generation++;clear();}
  };
}
