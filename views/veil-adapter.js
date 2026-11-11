/* Multiplayer state adapter compiled into the native Veil component. */
let matrixContext = null, matrixBaseline = '', matrixSaving = false;
const matrixStyle = document.createElement('style');
matrixStyle.textContent = '#btnOpen,#btnLoadGame,#btnEditSetup,#btnMarkDamage,#btnRefitRemove,.tabClose{display:none!important} .panelHeader img{max-height:48px}';
document.head.append(matrixStyle);
document.querySelector('#shipControlsSection .hint').textContent = 'Deployment is private. The game host assigns damage through StarHold.';
const destroyedBanner = document.createElement('div');
destroyedBanner.style.cssText = 'display:none;background:#702d35;color:white;padding:9px;text-align:center;font-weight:bold';
destroyedBanner.textContent = 'SHIP DESTROYED — assigned by game host';
document.getElementById('contentPanel').prepend(destroyedBanner);

// The ship image is the station's primary scale. It is as large as possible while fitting the
// width beside the energy panel and staying within one screen height (players may scroll to
// it); the station is made exactly that tall and the image panel exactly that wide. The energy
// allocation panel shares the height and scrolls within it. Phone layouts keep their CSS size.
const MATRIX_SCREEN_MARGIN = 16, MATRIX_MIN_IMAGE_HEIGHT = 300;
function matrixFitImagePanel() {
  const body = document.getElementById('contentBody'), panel = document.getElementById('imagePanel');
  const props = document.getElementById('propsPanel'), canvas = document.getElementById('canvas');
  const img = getActiveTab()?.imageObj;
  if (!body || !panel || !props || !canvas) return;
  const set = (height, flex) => {
    if (body.style.height === height && panel.style.flex === flex) return;
    body.style.height = height; panel.style.flex = flex; requestAnimationFrame(renderCanvas);
  };
  if (!img?.width || !img?.height || getComputedStyle(body).flexDirection === 'column') return set('', '');
  // Measure only things that do not depend on the size set here, so the fit is stable.
  const bodyRect = body.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
  const extraY = bodyRect.height - canvasRect.height, extraX = panel.getBoundingClientRect().width - canvasRect.width;
  const maxWidth = body.clientWidth - props.getBoundingClientRect().width - extraX;
  const maxHeight = Math.max(MATRIX_MIN_IMAGE_HEIGHT, globalThis.innerHeight - extraY - MATRIX_SCREEN_MARGIN);
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
  set(`${Math.ceil(img.height * scale + extraY)}px`, `0 1 ${Math.floor(img.width * scale + extraX)}px`);
}
window.addEventListener('resize', matrixFitImagePanel);
// Refit when the station's width changes (window, sidebar or page scrollbar); the window
// resize listener above covers screen height. The fit does not depend on what it sets.
new ResizeObserver(() => matrixFitImagePanel()).observe(document.getElementById('contentBody'));

function matrixPrivate() {
  const tab = getActiveTab();
  if (!tab?.doc) return {};
  const value = buildTurnSavePayload(tab);
  value.squares.forEach(square => delete square.damaged);
  return {...value, turnLocked: !!tab.turnLocked,
    moveChartHighlightedSpeeds: state.moveChartHighlightedSpeeds,
    batteryAvailBase: tab.batteryAvailBase, phaserCapsCleared: !!tab.phaserCapsCleared,
    energyReset: !!tab.energyReset};
}

function matrixApplyDamage(damage) {
  const tab = getActiveTab();
  if (!tab || !matrixContext) return;
  const runtime = damage?.runtimeDamage || {};
  destroyedBanner.style.display = runtime.shipDestroyed ? 'block' : 'none';
  const damaged = MatrixMapping.damagedSources(matrixContext.design.doc, runtime);
  for (const square of tab.doc.squares || []) square.damaged = damaged.has(square.matrixSource);
  renderCanvas(); renderCurrentProps();
}

async function matrixLoad(context) {
  matrixContext = context;
  const doc = buildVeilDocFromSuperluminal(structuredClone(context.design.doc), context.ship.name);
  // Attach source identifiers without changing the copied desktop renderer.
  let n = 0;
  for (const [key, entries] of Object.entries(context.design.doc.ssd || {})) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, source) => {
      if (parseSuperluminalPosToBbox(entry?.pos) && doc.squares[n]) doc.squares[n++].matrixSource = `${key}:${source}`;
    });
  }
  const tab = getActiveTab();
  applyLoadedDatasetToTab(tab, {imageDataUrl: context.design.imageDataUrl}, doc);
  tab.uiState = 'loadShip'; tab.title = context.ship.name; tab.shipName = context.ship.name;
  const saved = context.ship.private || {};
  if (Object.keys(saved).length) {
    applySavedTurnToTab(tab, {turns: [{...saved, turnState: {advanceTurn: false, turnLocked: saved.turnLocked}}]});
    for (const square of tab.doc.squares) square.fired = !!saved.squares?.find(item => item.id === square.id)?.fired;
  }
  for (const key of ['batteryAvailBase', 'phaserCapsCleared', 'energyReset']) if (key in saved) tab[key] = saved[key];
  state.moveChartHighlightedSpeeds = saved.moveChartHighlightedSpeeds || [];
  await applyHeavyLabelSetToTab(tab);
  await ensureTabImageLoaded(tab);
  matrixApplyDamage(context.ship.damage);
  renderTabs(); updateShipControlsVisibility(); updateTurnControlsUI();
  matrixFitImagePanel();
  matrixBaseline = JSON.stringify(matrixPrivate());
}

window.matrixFlush = async () => {
  if (!matrixContext) return;
  while (matrixSaving) await new Promise(resolve => setTimeout(resolve, 25));
  const value = matrixPrivate(), serialized = JSON.stringify(value);
  if (serialized === matrixBaseline) return;
  matrixSaving = true;
  try {
    await parent.Matrix.saveView(matrixContext.ship.id, 'private', value);
    matrixBaseline = serialized;
  } finally {matrixSaving = false;}
};
window.matrixUpdate = context => {
  if (!matrixContext || matrixContext.ship.id !== context.ship.id) return;
  if (JSON.stringify(context.ship.damage) !== JSON.stringify(matrixContext.ship.damage)) {
    matrixContext.ship.damage = context.ship.damage;
    matrixApplyDamage(context.ship.damage);
    parent.Matrix.notice('Host damage received. Review your energy allocation.');
  }
};
window.matrixHasChanges = () => matrixContext && JSON.stringify(matrixPrivate()) !== matrixBaseline;
window.matrixLoad = matrixLoad;
// Uncover the ship when the owner must choose which box is hit: close the Move Chart (its
// highlights are already kept). Prompts the owner opened themselves are left alone.
window.matrixRevealShip = () => {
  const close = Array.from(document.querySelectorAll('#moveChartOverlay .modalActions button')).find(b => b.textContent === 'Close');
  close?.click();
};
function matrixSetupButton(label, action) {
  const button = document.createElement('button'); button.textContent = label;
  button.onclick = async () => {
    if (!parent.Matrix.canEdit()) return;
    try {await action(getActiveTab()); await window.matrixFlush();}
    catch (error) {parent.Matrix.notice(error.message, true);}
  };
  document.querySelector('#shipControlsSection .stack').append(button);
}
matrixSetupButton('Set weapon status', async tab => {
  if (tab.turnNumber > 1 || tab.turnLocked) throw new Error('Set initial weapon status before locking turn 1.');
  const choice = await askWeaponStatus();
  if (choice === 'cancel') return;
  if (choice === 'loadgame') {parent.Matrix.notice('Resume a saved engagement from the main screen.'); return;}
  const caps = computeMaxPhaserCaps(tab);
  const key = setEnergyValue(tab, 'held phaser capacitors', choice === 'ws0' || choice === 'ws1' ? 0 : caps, 'HELD PHASER CAPACITORS');
  tab.energyDisplay[key] = tab.energyValues[key];
  renderCurrentProps();
});
matrixSetupButton('Option mount power', async tab => {await askOptionMountPowerRecords(tab); renderCurrentProps();});
setInterval(() => {
  if (matrixContext && !matrixSaving && !document.querySelector('input:focus') && parent.Matrix.canEdit()) {
    window.matrixFlush().catch(error => parent.Matrix.notice(error.message, true));
  }
}, 1500);
parent.Matrix.viewReady(window, 'veil');
