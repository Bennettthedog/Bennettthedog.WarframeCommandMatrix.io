let matrixContext = null, matrixBaseline = '', matrixSaving = false;
const matrixStyle = document.createElement('style');
matrixStyle.textContent = '#btnOpenShip,#btnLoadGame,#btnSaveGame,#btnSettings,#btnCloseShip,#btnRotateShips,#shipSwitcher{display:none!important} body.matrix-readonly #btnAssignDamage,body.matrix-readonly #btnManualMarkDamage,body.matrix-readonly #btnManualRemoveDamage,body.matrix-readonly #btnOptionMounts{display:none!important}';
document.head.append(matrixStyle);
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
