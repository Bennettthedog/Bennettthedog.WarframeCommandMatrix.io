let matrixContext = null, matrixBaseline = '', matrixSaving = false;
const matrixStyle = document.createElement('style');
matrixStyle.textContent = '#btnOpenShip,#btnLoadGame,#btnSaveGame,#btnSettings,#btnCloseShip,#btnRotateShips,#shipSwitcher{display:none!important} body.matrix-readonly #btnAssignDamage,body.matrix-readonly #btnManualMarkDamage,body.matrix-readonly #btnManualRemoveDamage,body.matrix-readonly #btnOptionMounts{display:none!important}';
document.head.append(matrixStyle);
// Player colours: each player's colour is one of StarHold's damage overlay presets.
function matrixPlayers() {
  return (matrixContext?.players || []).filter(player => player && Object.prototype.hasOwnProperty.call(DAMAGE_OVERLAY_PRESETS, player.color));
}
function matrixLabelDamageColors() {
  const select = document.getElementById('damageColorSelect');
  if (!select) return;
  for (const option of select.options) {
    const base = DAMAGE_OVERLAY_PRESETS[option.value]?.label || option.value;
    const names = matrixPlayers().filter(player => player.color === option.value).map(player => player.name);
    option.textContent = names.length ? `${base} — ${names.join(', ')}` : base;
  }
}
const matrixBaseAssignState = buildAssignDamageWindowStateForActiveShip;
buildAssignDamageWindowStateForActiveShip = function () {
  const value = matrixBaseAssignState();
  value.attackers = matrixPlayers().map(player => ({name: player.name, color: player.color,
    label: getDamageOverlayLabel(player.color), swatch: DAMAGE_OVERLAY_PRESETS[player.color].shield.stroke}));
  value.selectedAttackerColor = getDamageOverlayPreset();
  if (value.available && value.attackers.length) {
    value.hintText = 'Choose the attacking player; the damage is marked in their colour. Marks shield boxes, then armor boxes if present.';
  }
  return value;
};
const matrixBaseAssignSubmit = handleAssignDamageWindowSubmit;
handleAssignDamageWindowSubmit = function (payload) {
  const color = String(payload?.attackerColor || '');
  if (Object.prototype.hasOwnProperty.call(DAMAGE_OVERLAY_PRESETS, color)) {
    // Set the colour for this assignment without re-syncing the open dialog mid-submit.
    state.damageOverlayPreset = normalizeDamageOverlayPreset(color);
    renderDamageColorSelector();
    storeDamageOverlayPresetToStorage(state.damageOverlayPreset);
  }
  return matrixBaseAssignSubmit(payload);
};
// When damage needs a choice of which box is hit (e.g. which phaser), the ship's owner makes it.
// Only labels go to the owner; the host keeps the rule values and applies the answer. The host
// can still choose for them (the original prompt) or cancel, and chooses as before on own ships.
const matrixBasePrompt = promptForDamagePromptItems;
promptForDamagePromptItems = async function (chartCellLabel, promptItems, options = {}) {
  const items = (Array.isArray(promptItems) ? promptItems : []).filter(Boolean).filter(item => getDamagePromptItemValue(item) != null);
  if (items.length <= 1 || !matrixContext?.host) return matrixBasePrompt(chartCellLabel, promptItems, options);
  const title = String(options.title || getDamagePromptTitle(chartCellLabel)).trim() || 'Internal';
  const prompt = {title: `${title} Hit`, lead: String(options.lead || 'Select which box is hit.').trim() || 'Select which box is hit.',
    allowSkip: options.allowSkip === true,
    options: items.map((item, index) => ({optionId: String(index), label: String(item?.prompt?.label || `Option ${index + 1}`).slice(0, 200),
      detail: String(item?.prompt?.detail || '').slice(0, 500)}))};
  let answer;
  try {answer = await parent.Matrix.askOwner(matrixContext.ship.id, prompt);}
  catch (error) {parent.Matrix.notice(`Could not ask the owner (${error.message}). Choose the box yourself.`, true); answer = {local: true};}
  if (answer?.local) return matrixBasePrompt(chartCellLabel, promptItems, options);
  if (!answer) return null;
  if (answer.skip) return {skipSelection: true};
  return getDamagePromptItemValue(items[Number(answer.optionId)]) ?? null;
};
function matrixDamage() {
  const ship = getActiveShipRecord();
  return {runtimeDamage: structuredClone(ensureShipRuntimeDamageState(ship)), damageAssignment: structuredClone(ship?.damageAssignment || null)};
}
window.matrixLoad = async context => {
  matrixContext = context;
  await Promise.all([waitForRollsConfigLoad(), waitForShipyardDataConfigLoad()]);
  const ship = await restoreShipRecordFromSave({doc: context.design.doc, imageDataUrl: context.design.imageDataUrl,
    shipLabel: context.ship.name, ...context.ship.damage}, 0);
  state.ships = [ship];
  activateLoadedShip(0, {quiet: true});
  document.body.classList.toggle('matrix-readonly', !context.host);
  matrixLabelDamageColors();
  matrixBaseline = JSON.stringify(matrixDamage());
};
window.matrixFlush = async () => {
  if (!matrixContext?.host) return;
  while (matrixSaving) await new Promise(resolve => setTimeout(resolve, 25));
  if (window.WCMDesktop.busy()) throw new Error('Finish or cancel the damage dialog before switching views.');
  const value = matrixDamage(), serialized = JSON.stringify(value);
  if (serialized === matrixBaseline) return;
  matrixSaving = true;
  try {
    await parent.Matrix.saveView(matrixContext.ship.id, 'damage', value);
    matrixBaseline = serialized;
  } finally {matrixSaving = false;}
};
window.matrixUpdate = context => {
  if (!matrixContext || matrixContext.ship.id !== context.ship.id || matrixSaving) return;
  matrixContext.players = context.players;
  matrixLabelDamageColors();
  if (context.ship.damage_revision !== matrixContext.ship.damage_revision && !window.matrixHasChanges()) {
    matrixContext = context;
    const ship = getActiveShipRecord();
    ship.runtimeDamage = structuredClone(context.ship.damage.runtimeDamage || {});
    ship.damageAssignment = structuredClone(context.ship.damage.damageAssignment || null);
    ensureShipRuntimeDamageState(ship); refreshShipRollsDamageCategories(ship);
    renderShipCanvas(); renderDamageAssignmentSummary(); renderShipInfo();
    matrixBaseline = JSON.stringify(matrixDamage());
  }
};
window.matrixHasChanges = () => !!matrixContext?.host && JSON.stringify(matrixDamage()) !== matrixBaseline;
setInterval(() => {
  if (matrixContext?.host && !matrixSaving && !window.WCMDesktop.busy() && parent.Matrix.canEdit()) {
    window.matrixFlush().catch(error => parent.Matrix.notice(error.message, true));
  }
}, 1500);
parent.Matrix.viewReady(window, 'starhold');
