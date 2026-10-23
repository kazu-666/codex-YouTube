// Keep saved links to the map prototype usable while the new demo opens by default.
const query = new URLSearchParams(location.search);
if (query.has('round') && query.get('mode') !== 'casebook') {
  import('./legacy-main.js');
} else {
  import('./casebook.js');
}
