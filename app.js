'use strict';
const $ = id => document.getElementById(id);
const base = window.COMMAND_MATRIX_CONFIG.backendUrl;
let token = sessionStorage.getItem(`matrix-token:${base}`) || '';
let user = null, game = null, online = false, selected = null, mode = 'starhold';
let station = null, viewRevisions = {}, pollBusy = false, viewLoading = false, savePending = 0, conflict = false;
const designs = new Map();
let noticeTimer;

function notice(message, error = false) {
  $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, error ? 12000 : 5000);
}
function setOnline(value) {
  online = value; $('onlineDot').classList.toggle('online', value);
  $('connectionStatus').textContent = value ? 'Game server connected' : 'Server offline · retrying';
  $('stationContainer').classList.toggle('locked', !online || game?.status !== 'playing');
}
async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, {method,
      headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000)});
  } catch (error) {
    setOnline(false);
    throw new Error('Cannot reach the game server. Start the backend and try again. Unsaved edits remain in this tab.');
  }
  const data = await response.json();
  setOnline(true);
  if (!response.ok) {const error = new Error(data.error || 'Request failed.'); error.status = response.status; throw error;}
  return data;
}
function screen(name) {
  for (const id of ['gateway', 'dashboard', 'game']) $(id).hidden = id !== name;
  $('identity').textContent = user?.name || '';
  $('logout').hidden = !user;
}
function button(text, handler, className = '') {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = text;
  element.className = className;
  element.onclick = () => run(handler);
  return element;
}
async function run(handler) {try {await handler();} catch (error) {notice(error.message, true);}}
async function connect() {
  await api('/health');
  if (token) {
    try {user = await api('/me'); await dashboard();} catch (error) {if (error.status !== 401) throw error; token = '';}
  }
  notice('Connected to the host’s game server.');
}
async function dashboard() {
  station?.dispose?.();
  game = null; selected = null; station = null; $('stationContainer').replaceChildren();
  screen('dashboard');
  const games = await api('/games');
  $('savedGames').replaceChildren();
  if (!games.length) $('savedGames').textContent = 'No engagements yet. Create a game or join your host.';
  for (const item of games) {
    const entry = button(item.name, async () => enterGame(await api(`/games/${item.id}`)), 'saved-game');
    const sub = document.createElement('span'); sub.textContent = `${item.status.toUpperCase()} · ${item.code}`; entry.append(sub); $('savedGames').append(entry);
  }
}
async function refreshDesigns() {
  const catalog = await api('/designs');
  $('designSelect').replaceChildren();
  for (const item of catalog) {const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('designSelect').append(option);}
  if (!catalog.length) {const option = document.createElement('option'); option.value = ''; option.textContent = 'No ships in the host library'; $('designSelect').append(option);}
}
async function enterGame(value) {
  station?.dispose?.();
  game = value; selected = null; conflict = false; station = null;
  $('stationContainer').replaceChildren(); $('emptyStation').hidden = false;
  screen('game'); renderGame(); await refreshDesigns();
}
function renderGame() {
  if (!game) return;
  const host = game.host === user.id;
  $('roomName').textContent = game.name; $('phase').textContent = game.status;
  $('copyCode').textContent = game.code; $('role').textContent = host ? 'Host' : 'Player';
  $('members').replaceChildren();
  for (const member of game.members) {
    const row = document.createElement('div'); row.className = `member ${member.ready ? 'ready' : ''}`;
    const name = document.createElement('span'); name.textContent = member.name + (member.id === user.id ? ' · you' : '');
    const status = document.createElement('small'); status.textContent = member.ready ? 'Ready' : 'Selecting';
    row.append(name, status); $('members').append(row);
  }
  $('shipCount').textContent = game.ships.length;
  $('ships').replaceChildren();
  for (const ship of game.ships) {
    const row = document.createElement('div'); row.className = 'ship-row';
    row.append(button(ship.name, () => selectShip(ship.id, ship.owner === user.id ? 'veil' : 'starhold'), `ship-button ${selected === ship.id ? 'selected' : ''}`));
    const owner = document.createElement('div'); owner.className = 'ship-owner'; owner.textContent = game.members.find(x => x.id === ship.owner)?.name || 'Player'; row.append(owner);
    if (ship.owner === user.id && game.status === 'lobby') row.append(button('Remove from fleet', async () => {
      await flush(); game = await api(`/games/${game.id}/ships/${ship.id}`, 'DELETE');
      if (selected === ship.id) {selected = null; station?.dispose?.(); station = null; $('stationContainer').replaceChildren(); $('emptyStation').hidden = false;}
      renderGame();
    }, 'subtle remove-ship'));
    $('ships').append(row);
  }
  if (!game.ships.length) $('ships').textContent = 'No ships selected yet.';
  $('lobby').hidden = game.status !== 'lobby';
  $('hostControls').hidden = !host;
  $('startGame').hidden = game.status === 'playing';
  $('startGame').textContent = game.status === 'paused' ? 'Resume game' : 'Start game';
  $('pauseGame').hidden = game.status !== 'playing';
  $('reopenLobby').hidden = game.status === 'lobby';
  const ready = !!game.members.find(x => x.id === user.id)?.ready;
  $('readyButton').textContent = ready ? 'Ready ✓ · Change' : 'Mark ready';
  $('readyButton').classList.toggle('active', ready);
  $('activity').replaceChildren();
  for (const event of game.events) {const line = document.createElement('div'); line.textContent = `${event.actor}: ${event.kind}${event.ship_id ? ` · ${game.ships.find(x => x.id === event.ship_id)?.name || 'ship'}` : ''}`; $('activity').append(line);}
  const ship = game.ships.find(x => x.id === selected);
  document.body.dataset.theme = ship ? mode : 'starhold';
  $('selectedName').textContent = ship?.name || 'Choose a ship from the fleet';
  $('veilTab').hidden = !ship || ship.owner !== user.id;
  $('starholdTab').hidden = !ship;
  $('saveView').hidden = !ship || (mode === 'starhold' && !host);
  $('reloadView').hidden = !ship;
  $('saveView').disabled = game.status !== 'playing' || conflict;
  $('veilTab').classList.toggle('active', mode === 'veil'); $('starholdTab').classList.toggle('active', mode === 'starhold');
  $('stationCaption').textContent = mode === 'veil' && ship ? 'VEIL / OWNER ACCESS' : 'STARHOLD / SHARED FLEET';
  $('viewNotice').textContent = conflict ? 'Another window changed this ship. Reload ship to recover the saved version.' :
    game.status !== 'playing' ? 'Ship editing opens when the host starts or resumes the game.' :
    mode === 'veil' ? 'Private station · changes save automatically. Host damage updates this ship. Review power after damage.' :
    host ? 'Host station · damage saves automatically after dialogs close and updates the owner’s Veil.' : 'Shared ship view · only the host can change damage.';
  $('stationContainer').classList.toggle('locked', !online || game.status !== 'playing');
}
async function flush() {
  if (viewLoading) throw new Error('The ship view is still loading.');
  while (savePending) await new Promise(resolve => setTimeout(resolve, 50));
  await station?.matrixFlush?.();
  while (savePending) await new Promise(resolve => setTimeout(resolve, 50));
}
function context() {
  const ship = game.ships.find(x => x.id === selected);
  return structuredClone({ship, design: designs.get(ship.design_id), host: game.host === user.id});
}
async function selectShip(id, nextMode, discard = false) {
  if (viewLoading) return;
  if (!discard) await flush();
  const ship = game.ships.find(x => x.id === id);
  if (!ship) return;
  if (nextMode === 'veil' && ship.owner !== user.id) throw new Error('Veil is private to this ship’s owner.');
  designs.set(ship.design_id, await api(`/designs/${ship.design_id}`));
  station?.dispose?.();
  selected = id; mode = nextMode; conflict = false; station = null; viewLoading = true;
  viewRevisions = {damage: ship.damage_revision, private: ship.private_revision};
  $('stationContainer').replaceChildren(); $('emptyStation').hidden = true;
  renderGame();
  try {
    const {mountStation} = await import('./native/station.js');
    station = await mountStation($('stationContainer'), mode, context());
  } catch (error) {
    $('emptyStation').hidden = false;
    throw error;
  } finally {viewLoading = false;}
}
window.Matrix = {
  notice,
  canEdit: () => online && game?.status === 'playing' && !conflict && !viewLoading,
  saveView: async (id, field, value) => {
    if (!window.Matrix.canEdit()) throw new Error('Cannot save: the game is paused, offline, or needs a reload. Keep this tab open.');
    if (id !== selected) throw new Error('Ship selection changed.');
    savePending++;
    try {
      const saved = await api(`/games/${game.id}/ships/${id}/${field}`, 'POST', {revision: viewRevisions[field], value});
      viewRevisions[field] = saved.revision;
      const ship = game.ships.find(x => x.id === id);
      ship[field] = structuredClone(value); ship[`${field}_revision`] = saved.revision;
      $('viewNotice').textContent = `${field === 'private' ? 'Private Veil state' : 'Shared damage'} saved on host PC · ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      if (error.status === 409 && error.message.includes('changed in another window')) {conflict = true; renderGame();}
      throw error;
    } finally {savePending--;}
  }
};

$('authForm').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    await connect();
    const result = await api('/login', 'POST', {name: $('playerName').value, password: $('password').value});
    token = result.token; user = result.user; sessionStorage.setItem(`matrix-token:${base}`, token); $('password').value = '';
    await dashboard();
  });
};
$('logout').onclick = () => run(async () => {await flush(); await api('/logout', 'POST', {}); sessionStorage.removeItem(`matrix-token:${base}`); token = ''; user = null; game = null; station?.dispose?.(); station = null; $('stationContainer').replaceChildren(); screen('gateway');});
$('createForm').onsubmit = event => {event.preventDefault(); run(async () => enterGame(await api('/games', 'POST', {name: $('gameName').value})));};
$('joinForm').onsubmit = event => {event.preventDefault(); run(async () => enterGame(await api('/join', 'POST', {code: $('joinCode').value})));};
$('back').onclick = () => run(async () => {await flush(); await dashboard();});
$('copyCode').onclick = () => run(async () => {await navigator.clipboard.writeText(game.code); notice('Join code copied.');});
$('readyButton').onclick = () => run(async () => {game = await api(`/games/${game.id}/ready`, 'POST', {ready: !game.members.find(x => x.id === user.id).ready}); renderGame();});
for (const [id, status] of [['startGame', 'playing'], ['pauseGame', 'paused'], ['reopenLobby', 'lobby']]) {
  $(id).onclick = () => run(async () => {await flush(); game = await api(`/games/${game.id}/status`, 'POST', {status}); renderGame();});
}
$('selectShipForm').onsubmit = event => {event.preventDefault(); run(async () => {game = await api(`/games/${game.id}/ships`, 'POST', {design_id: $('designSelect').value, name: $('shipName').value.trim()}); $('shipName').value = ''; renderGame();});};
$('veilTab').onclick = () => run(() => selectShip(selected, 'veil'));
$('starholdTab').onclick = () => run(() => selectShip(selected, 'starhold'));
$('saveView').onclick = () => run(async () => {await flush(); notice('Ship state saved on host PC.');});
$('reloadView').onclick = () => run(async () => {
  if ((conflict || station?.matrixHasChanges?.()) && !confirm('Discard unsaved edits and reload this ship from the server?')) return;
  game = await api(`/games/${game.id}`); await selectShip(selected, mode, true);
});
window.addEventListener('beforeunload', event => {if (savePending || station?.matrixHasChanges?.()) {event.preventDefault(); event.returnValue = '';}});
setInterval(async () => {
  if (pollBusy || viewLoading) return;
  pollBusy = true;
  try {
    if (game && user) {
      const id = game.id, updated = await api(`/games/${id}`);
      if (!game || game.id !== id) return;
      if (updated.revision !== game.revision) {
        game = updated; renderGame();
        if (selected && station && !savePending) {
          const current = context();
          if (current.ship.damage_revision >= (viewRevisions.damage || 0)) station.matrixUpdate?.(current);
        }
      }
    } else await api('/health');
  } catch (error) {if (error.status === 401) notice('Session expired. Sign in again to reconnect.', true);}
  finally {pollBusy = false;}
}, 2000);
run(connect);
