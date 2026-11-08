/* Browser replacement for Electron IPC. All auxiliary windows stay inside the page. */
(() => {
  if (window.parent !== window && window.parent.WCMDesktop) {
    window.api = window.parent.WCMDesktop.apiFor(window);
    return;
  }
  const listeners = new Map(), dialogs = new Map();
  const emit = (name, payload) => {
    for (const item of listeners.get(name) || []) {
      if (item.owner === window || item.owner.frameElement?.isConnected) item.handler(payload);
    }
  };
  async function open(kind, file) {
    if (dialogs.has(kind)) return {ok: true};
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000b;z-index:99999;display:grid;place-items:center;padding:16px';
    const frame = document.createElement('iframe');
    frame.title = kind;
    frame.style.cssText = 'width:min(960px,95vw);height:min(850px,93vh);border:1px solid #557082;border-radius:12px;background:#111820';
    overlay.append(frame);
    dialogs.set(kind, overlay);
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = file;
    document.body.append(overlay);
    await loaded;
    return {ok: true};
  }
  function close(kind) {
    dialogs.get(kind)?.remove(); dialogs.delete(kind);
    emit(`on${kind}Closed`, {});
    return Promise.resolve({ok: true});
  }
  const transitions = {
    setAssignDamageWindowState: 'onAssignDamageWindowState',
    setAssignDamageDestructionPreview: 'onAssignDamageDestructionPreview',
    setAssignDamageWeaponPrompt: 'onAssignDamageWeaponPrompt',
    setWeaponSelectWindowState: 'onWeaponSelectWindowState',
    setAssignDamageManualDacPrompt: 'onAssignDamageManualDacPrompt',
    setManualDacRollWindowState: 'onManualDacRollWindowState',
    previewAssignDamageWindowSelection: 'onAssignDamageWindowPreview',
    submitAssignDamageWindow: 'onAssignDamageWindowSubmit',
    submitAssignDamageWeaponSelection: 'onAssignDamageWeaponSelectionSubmit',
    cancelAssignDamageWeaponSelection: 'onAssignDamageWeaponSelectionCancel',
    submitAssignDamageManualDacPrompt: 'onAssignDamageManualDacPromptSubmit',
    cancelAssignDamageManualDacPrompt: 'onAssignDamageManualDacPromptCancel',
    submitManualDacRollWindow: 'onManualDacRollWindowSubmit',
    cancelManualDacRollWindow: 'onManualDacRollWindowCancel'
  };
  const api = {
    getAppVersion: async () => location.pathname.includes('/starhold/') ? {ok: true, version: 'Command Matrix 1.0'} : 'Command Matrix 1.0',
    checkForUpdates: async () => ({ok: true}),
    openUpdates: async () => ({ok: true}),
    getSettings: async () => ({ok: true, settings: {}}),
    getSetupPaths: async () => ({gamesDir: 'server'}),
    readHeavyList: async () => ({ok: true, options: ['Photon Torpedo', 'Disruptor', 'Plasma Torpedo F', 'Plasma Torpedo G', 'Plasma Torpedo S', 'Plasma Torpedo R', 'Hellbore', 'Fusion Beam', 'Drone', 'Option Mount']}),
    getRollsConfig: async () => ({ok: true, rollsConfig: await (await fetch('../../assets/rolls.json')).json()}),
    getShipyardDataConfig: async () => ({ok: true, dataConfig: await (await fetch('../../assets/shipyard.json')).json()}),
    openAssignDamageWindow: () => open('AssignDamageWindow', 'assign-damage.html'),
    openWeaponSelectWindow: () => open('WeaponSelectWindow', 'weapon-select.html'),
    openManualDacRollWindow: () => open('ManualDacRollWindow', 'manual-dac-roll.html'),
    closeAssignDamageWindow: () => close('AssignDamageWindow'),
    closeWeaponSelectWindow: () => close('WeaponSelectWindow'),
    closeManualDacRollWindow: () => close('ManualDacRollWindow'),
    saveTurnEnergy: async () => { await window.matrixFlush?.(); return {ok: true, filePath: 'Local game server'}; },
    saveGame: async () => { await window.matrixFlush?.(); return {ok: true, filePath: 'Local game server'}; }
  };
  for (const [method, event] of Object.entries(transitions)) {
    api[method] = async payload => {
      emit(event, payload);
      const kind = method.startsWith('setWeaponSelect') ? 'WeaponSelectWindow' :
        method.startsWith('setManualDacRoll') ? 'ManualDacRollWindow' : 'AssignDamageWindow';
      return {ok: true, shown: dialogs.has(kind)};
    };
  }
  function apiFor(owner) {
    const result = {...api};
    for (const event of [...Object.values(transitions), 'onAssignDamageWindowClosed', 'onWeaponSelectWindowClosed', 'onManualDacRollWindowClosed']) {
      result[event] = handler => {
        const item = {owner, handler};
        listeners.set(event, [...(listeners.get(event) || []).filter(x => x.owner === window || x.owner.frameElement?.isConnected), item]);
        return () => listeners.set(event, (listeners.get(event) || []).filter(x => x !== item));
      };
    }
    return result;
  }
  window.WCMDesktop = {apiFor, busy: () => dialogs.size > 0};
  window.api = apiFor(window);
})();
