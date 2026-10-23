// Keep saved links to the map prototype usable while the new demo opens by default.
const query = new URLSearchParams(location.search);
if (query.get('mode') === 'fieldwork') {
  import('./fieldwork.js');
} else if (query.get('mode') === 'casebook') {
  import('./casebook.js');
} else if (query.has('round')) {
  import('./legacy-main.js');
} else {
  import('./fieldwork.js');
}
