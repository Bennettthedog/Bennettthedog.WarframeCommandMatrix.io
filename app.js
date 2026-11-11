'use strict';
const $ = id => document.getElementById(id);
const base = window.COMMAND_MATRIX_CONFIG.backendUrl;
let token = sessionStorage.getItem(`matrix-token:${base}`) || '';
let user = null, game = null, online = false, selected = null, mode = 'starhold';
let station = null, viewRevisions = {}, pollBusy = false, viewLoading = false, savePending = 0, conflict = false;
let savingGame = false, answeredSaveRequest = 0;
// Owner IDs whose fleet group the viewer has collapsed; kept across the 2-second re-renders.
const collapsedOwners = new Set();
const designs = new Map();
let noticeTimer;
// Keys match StarHold's damage overlay presets; swatches use their shield stroke colour.
const PLAYER_COLORS = {crimson: ['Red', '#ff4a4a'], cyan: ['Cyan', '#60d8f6'], emerald: ['Green', '#54da7a'],
  gold: ['Yellow', '#ffd24c'], violet: ['Purple', '#aa78f8'], orange: ['Orange', '#ffa44a'], black: ['Black', '#0a0a0c']};
function swatch(color) {
  const element = document.createElement('span'); element.className = 'player-swatch';
  element.style.background = PLAYER_COLORS[color]?.[1] || 'transparent';
  element.title = PLAYER_COLORS[color]?.[0] || 'No colour';
  return element;
}

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
  renderOwnerChoice();
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
  game = value; selected = null; conflict = false; station = null; answeredSaveRequest = game.save_request;
  $('stationContainer').replaceChildren(); $('emptyStation').hidden = false;
  screen('game'); renderGame(); await refreshDesigns();
}
function renderGame() {
  if (!game) return;
  const host = game.host === user.id;
  $('roomName').textContent = game.name; $('phase').textContent = game.status;
  $('copyCode').textContent = game.code; $('role').textContent = host ? 'Host' : 'Player';
  // One collapsible entry per player: colour, name, ready status, then their ships.
  // Owners of ships who are no longer players go last.
  $('members').replaceChildren();
  const owners = [...game.members.map(x => x.id), ...game.ships.map(x => x.owner)].filter((id, i, all) => all.indexOf(id) === i);
  for (const ownerId of owners) {
    const ships = game.ships.filter(x => x.owner === ownerId);
    const member = game.members.find(x => x.id === ownerId);
    const group = document.createElement('details'); group.className = `fleet-group ${member?.ready ? 'ready' : ''}`;
    group.open = !collapsedOwners.has(ownerId);
    group.ontoggle = () => { if (group.open) collapsedOwners.delete(ownerId); else collapsedOwners.add(ownerId); };
    const summary = document.createElement('summary');
    const name = document.createElement('span'); name.className = 'member-name';
    if (member) name.append(swatch(member.color));
    name.append(document.createTextNode((member?.name || 'Player') + (ownerId === user.id ? ' · you' : '')));
    const status = document.createElement('small'); status.className = 'ready-status';
    status.textContent = !member ? 'Left game' : member.ready ? 'Ready ✓' : 'Selecting';
    const count = document.createElement('span'); count.className = 'count'; count.textContent = ships.length;
    count.title = `${ships.length} ship${ships.length === 1 ? '' : 's'}`;
    summary.append(name, status, count); group.append(summary);
    if (host && member) {
      const picker = document.createElement('select'); picker.className = 'color-picker';
      picker.setAttribute('aria-label', `Colour for ${member.name}`);
      for (const [key, [label]] of Object.entries(PLAYER_COLORS)) {
        const option = document.createElement('option'); option.value = key; option.textContent = label; picker.append(option);
      }
      picker.value = member.color;
      picker.onchange = () => run(async () => {
        game = await api(`/games/${game.id}/color`, 'POST', {user_id: member.id, color: picker.value});
        renderGame();
        if (selected && station) station.matrixUpdate?.(context());
      });
      group.append(picker);
    }
    if (!ships.length) {
      const empty = document.createElement('p'); empty.className = 'hint no-ships'; empty.textContent = 'No ships yet.';
      group.append(empty);
    }
    for (const ship of ships) {
      const row = document.createElement('div'); row.className = 'ship-row';
      row.append(button(ship.name, () => selectShip(ship.id, ship.owner === user.id ? 'veil' : 'starhold'), `ship-button ${selected === ship.id ? 'selected' : ''}`));
      if (ship.owner === user.id && game.status === 'lobby') row.append(button('Remove from fleet', async () => {
        await flush(); game = await api(`/games/${game.id}/ships/${ship.id}`, 'DELETE');
        if (selected === ship.id) {selected = null; station?.dispose?.(); station = null; $('stationContainer').replaceChildren(); $('emptyStation').hidden = false;}
        renderGame();
      }, 'subtle remove-ship'));
      group.append(row);
    }
    $('members').append(group);
  }
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
  $('saveGame').hidden = !host || game.status === 'lobby';
  $('saveGame').disabled = savingGame;
  $('reloadView').hidden = !ship;
  $('veilTab').classList.toggle('active', mode === 'veil'); $('starholdTab').classList.toggle('active', mode === 'starhold');
  $('stationCaption').textContent = mode === 'veil' && ship ? 'VEIL / OWNER ACCESS' : 'STARHOLD / SHARED FLEET';
  $('viewNotice').textContent = conflict ? 'Another window changed this ship. Reload ship to recover the saved version.' :
    game.status !== 'playing' ? 'Ship editing opens when the host starts or resumes the game.' :
    mode === 'veil' ? 'Private station · changes save automatically. Host damage updates this ship. Review power after damage.' :
    host ? 'Host station · damage saves automatically after dialogs close and updates the owner’s Veil.' : 'Shared ship view · only the host can change damage.';
  $('stationContainer').classList.toggle('locked', !online || game.status !== 'playing');
  renderOwnerChoice();
}
async function flush() {
  if (viewLoading) throw new Error('The ship view is still loading.');
  while (savePending) await new Promise(resolve => setTimeout(resolve, 50));
  await station?.matrixFlush?.();
  while (savePending) await new Promise(resolve => setTimeout(resolve, 50));
}
function context() {
  const ship = game.ships.find(x => x.id === selected);
  const players = game.members.map(member => ({id: member.id, name: member.name, color: member.color}));
  return structuredClone({ship, design: designs.get(ship.design_id), host: game.host === user.id, players});
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
// ---- Damage choices: when the host's StarHold needs to know which box is hit (e.g. which
// phaser), the ship's owner chooses. The host waits and can still choose for them or cancel.
const answeredChoices = new Set();
let ownerChoiceId = null;
function renderOwnerChoice() {
  const dialog = $('ownerChoice');
  const choice = game?.status === 'playing' ? game.choices?.find(x => !answeredChoices.has(x.id)) : null;
  if (!choice) {ownerChoiceId = null; if (dialog.open) dialog.close(); return;}
  if (choice.id === ownerChoiceId && dialog.open) return;
  ownerChoiceId = choice.id;
  const ship = game.ships.find(x => x.id === choice.ship_id);
  $('ownerChoiceShip').textContent = `${ship?.name || 'Your ship'} · the host is assigning damage`;
  $('ownerChoiceTitle').textContent = choice.prompt.title;
  $('ownerChoiceLead').textContent = choice.prompt.lead;
  const answer = body => run(async () => {
    for (const element of dialog.querySelectorAll('button')) element.disabled = true;
    answeredChoices.add(choice.id);
    try {await api(`/games/${game.id}/choices/${choice.id}`, 'POST', body); notice('Choice sent to the host.');}
    finally {dialog.close(); ownerChoiceId = null;}
  });
  $('ownerChoiceOptions').replaceChildren(...choice.prompt.options.map(option => {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'secondary choice-option';
    const label = document.createElement('span'); label.textContent = option.label; element.append(label);
    if (option.detail) {const detail = document.createElement('small'); detail.textContent = option.detail; element.append(detail);}
    element.onclick = () => answer({optionId: option.optionId});
    return element;
  }));
  $('ownerChoiceSkip').hidden = !choice.prompt.allowSkip; $('ownerChoiceSkip').disabled = false;
  $('ownerChoiceSkip').onclick = () => answer({skip: true});
  // Docked and non-modal, so the owner can look at their ship while choosing.
  if (!dialog.open) dialog.show();
  run(() => showChoiceShip(choice.ship_id));
}
// Bring the ship being damaged into view (its Veil) so the owner can see it while choosing.
async function showChoiceShip(shipId) {
  if (!viewLoading && (selected !== shipId || mode !== 'veil')) await selectShip(shipId, 'veil');
  if (selected === shipId) station?.matrixRevealShip?.();
  $('stationContainer').closest('.station')?.scrollIntoView({behavior: 'smooth', block: 'start'});
}
$('ownerChoice').oncancel = event => event.preventDefault();
$('hostWait').oncancel = event => event.preventDefault();
// Resolves to {optionId}, {skip: true}, {local: true} (host chooses as before) or null (cancel).
async function askOwner(shipId, prompt) {
  const ship = game?.ships.find(x => x.id === shipId);
  if (!ship || ship.owner === user.id) return {local: true};
  const owner = game.members.find(x => x.id === ship.owner)?.name || 'The owner';
  const {choice_id} = await api(`/games/${game.id}/ships/${shipId}/choice`, 'POST', prompt);
  const path = `/games/${game.id}/choices/${choice_id}`, dialog = $('hostWait');
  $('hostWaitTitle').textContent = `Waiting for ${owner}`;
  $('hostWaitLead').textContent = `${owner} is choosing the ${prompt.title} on ${ship.name}.`;
  $('hostWaitOptions').textContent = prompt.options.map(option => option.label).join(' · ');
  $('hostWaitStatus').textContent = '';
  return new Promise(resolve => {
    let done = false, checking = false;
    const finish = (value, withdraw = true) => {
      if (done) return;
      done = true; clearInterval(timer); dialog.close();
      if (withdraw) api(path, 'DELETE').catch(() => {});
      resolve(value);
    };
    const timer = setInterval(async () => {
      if (checking || done) return;
      checking = true;
      try {
        const result = await api(path);
        $('hostWaitStatus').textContent = game?.status === 'playing' ? '' : 'The game is paused; the owner can choose once it resumes.';
        if (result.status === 'answered') finish(result.answer);
      } catch (error) {
        if (error.status === 404) {notice('The owner’s choice was withdrawn. Choose the box yourself.', true); finish({local: true}, false);}
        else $('hostWaitStatus').textContent = error.message;
      } finally {checking = false;}
    }, 1000);
    $('hostWaitLocal').onclick = () => finish({local: true});
    $('hostWaitCancel').onclick = () => finish(null);
    dialog.showModal();
  });
}

window.Matrix = {
  notice, askOwner,
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
// ---- Save game (host only): every player's tab saves its pending edits, then the host
// PC writes the whole game to disk. Players who don't answer keep their last autosave.
const SAVE_WAIT_MS = 8000;
$('saveGame').onclick = () => run(async () => {
  savingGame = true; renderGame();
  try {
    if (game.status === 'playing') await flush();
    let state = await api(`/games/${game.id}/save`, 'POST', {});
    const request = state.save_request, others = () => state.members.filter(m => m.id !== user.id && m.saved < request);
    answeredSaveRequest = request;
    $('viewNotice').textContent = 'Saving game · waiting for every player’s tab to save…';
    for (const end = Date.now() + SAVE_WAIT_MS; others().length && Date.now() < end;) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      state = await api(`/games/${game.id}`);
    }
    const missing = others().map(m => m.name);
    game = await api(`/games/${game.id}/save`, 'POST', {finish: true});
    notice(missing.length ? `Game saved. No answer from ${missing.join(', ')}: their last autosave is kept.` : 'Game saved on host PC · every player’s ships.', !!missing.length);
  } finally {savingGame = false; renderGame();}
});
// Every tab answers the host's save request by saving its own pending edits first.
async function answerSaveRequest() {
  const request = game?.save_request;
  if (!request || request === answeredSaveRequest) return;
  answeredSaveRequest = request;
  try {
    if (game.status === 'playing') await flush();
    await api(`/games/${game.id}/saved`, 'POST', {request});
  } catch (error) {notice(`Could not save for the host: ${error.message}`, true);}
}
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
        answerSaveRequest();
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
