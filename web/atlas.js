import { createDetailMap } from './detail-map.js';

// One flat map, one WebGL context, from regional overview to building detail.
export function createAtlas(options) {
  options.container.dataset.mode = 'flat';
  return createDetailMap(options);
}
