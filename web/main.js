// Keep saved links to the map prototype usable while the new demo opens by default.
const query = new URLSearchParams(location.search);
async function openGame() {
  try {
    if (query.get('mode') === 'connections') {
      await import('./connections.js');
    } else if (query.get('mode') === 'fieldwork') {
      await import('./fieldwork.js');
    } else if (query.get('mode') === 'casebook') {
      await import('./casebook.js');
    } else if (query.has('round')) {
      await import('./legacy-main.js');
    } else {
      await import('./connections.js');
    }
  } catch (error) {
    console.error('Game startup failed', error);
    window.showGameLoadError();
  }
}
openGame();
