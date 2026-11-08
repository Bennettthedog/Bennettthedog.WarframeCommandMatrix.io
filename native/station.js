/* Native DOM components with scoped styles and explicit lifecycle cleanup. */
import '../views/damage-mapping.js';
const nativeWindow = window;
const modules = {
  veil: () => import('./generated/veil.js'), starhold: () => import('./generated/starhold.js'),
  'assign-damage': () => import('./generated/assign-damage.js'),
  'weapon-select': () => import('./generated/weapon-select.js'),
  'manual-dac-roll': () => import('./generated/manual-dac-roll.js')
};
const layout = `
:host{display:block;min-width:0;color:var(--text);font:14px system-ui,-apple-system,Segoe UI,Arial,sans-serif}
.native-body{display:block;width:100%;height:auto;min-height:0;padding:0;margin:0;background:transparent;color:var(--text)}
#main,#app{width:100%;height:auto;min-height:680px;border:0;border-radius:0;box-shadow:none;background:transparent;overflow:visible}
#main{display:flex;flex-direction:column}
#leftPanel{width:100%;min-width:0;display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;overflow:visible;border-right:0;border-bottom:1px solid var(--border)}
#leftPanel>.panelHeader,#contentTopBar,#app>.topbar .brand,#appVersion,.shipSwitcherRow{display:none!important}
#btnSaveNow{display:none!important}
#leftPanel .panelSection{padding:10px 12px;border-bottom:0;border-right:1px solid var(--border)}
#leftPanel .sectionTitle,#leftPanel .hint{display:none}
#leftPanel .stack{display:flex;flex-direction:row;gap:8px;flex-wrap:wrap;align-items:center}
#leftPanel .stack button{width:auto;max-width:none;padding:8px 12px;font-size:12px}
#turnCounter{font-size:13px;padding:0 8px}
#contentPanel{min-height:620px}
#contentBody{min-height:620px;height:calc(100vh - 310px);max-height:1100px}
#imagePanel{min-width:0} #propsPanel{width:310px;min-width:260px}
#app>.topbar{padding:10px 12px;justify-content:flex-start;border-radius:0;background:var(--panel2)}
#app>.topbar .toolbar{justify-content:flex-start;flex-wrap:wrap;width:100%}
#app>.topbar button{padding:8px 12px;font-size:12px}
#app .layout{grid-template-columns:minmax(0,1.25fr) minmax(300px,1fr);min-height:620px;padding:0;gap:10px}
#app .layout.chartMinimized{grid-template-columns:minmax(0,1fr)}
#app .panel{min-width:0} #app .canvasWrap{min-height:460px}
#app .chartPanel{max-height:calc(100vh - 220px);min-height:620px}
#statusMessage{overflow-wrap:anywhere}
.native-body.matrix-readonly #btnAssignDamage,.native-body.matrix-readonly #btnManualMarkDamage,.native-body.matrix-readonly #btnManualRemoveDamage,.native-body.matrix-readonly #btnOptionMounts{display:none!important}
.native-dialog{border:1px solid var(--border-strong,var(--border));border-radius:14px;padding:0;width:min(920px,calc(100vw - 28px));max-height:calc(100vh - 30px);background:var(--panel);color:var(--text);box-shadow:0 24px 70px #0009}
.native-dialog::backdrop{background:#080b14c9;backdrop-filter:blur(3px)}
.native-dialog>div{min-width:0} .assignWindowShell{height:auto;min-height:0;padding:0}
.assignWindowCard{max-height:none;height:auto;min-height:0;border:0;box-shadow:none}
@media(max-width:1050px){#app .layout{grid-template-columns:minmax(0,1fr)}#app .chartPanel{min-height:350px;max-height:650px}}
@media(max-width:700px){#contentBody{display:flex;flex-direction:column;height:auto;max-height:none}#imagePanel{height:420px;min-height:420px}#propsPanel{width:100%;min-width:0;max-height:none;overflow:visible}#energyTable{max-height:none}#leftPanel .panelSection{border:0;padding:6px}#app>.topbar .toolbar{gap:7px}}
`;

function scope(element, module) {
  const root = element.attachShadow({mode: 'open'});
  const style = document.createElement('style'); style.textContent = module.stylesheet + layout;
  const body = document.createElement('div'); body.className = 'native-body'; body.innerHTML = module.markup;
  root.append(style, body);
  const disposers = [], listeners = [], timers = new Set(), intervals = new Set(), frames = new Set();
  const scopedDocument = {
    body, head: root,
    getElementById: id => root.getElementById(id),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: tag => document.createElement(tag),
    title: ''
  };
  const proxy = {document: scopedDocument, localStorage, devicePixelRatio: devicePixelRatio,
    alert: nativeWindow.alert.bind(nativeWindow), confirm: nativeWindow.confirm.bind(nativeWindow),
    prompt: nativeWindow.prompt.bind(nativeWindow), focus: () => element.focus(),
    addEventListener(type, handler, options) {
      const target = type === 'keydown' ? root : nativeWindow;
      const wrapped = event => {
        if (type === 'keydown' && event.composedPath()[0]?.getRootNode() !== root) return;
        handler(event);
      };
      target.addEventListener(type, wrapped, options); listeners.push({type, handler, wrapped, target, options});
    },
    removeEventListener(type, handler) {
      for (const item of listeners.filter(item => item.type === type && item.handler === handler)) item.target.removeEventListener(type, item.wrapped, item.options);
    },
    setTimeout(fn, delay, ...args) {const id = nativeWindow.setTimeout(() => {timers.delete(id); fn(...args);}, delay); timers.add(id); return id;},
    clearTimeout(id) {nativeWindow.clearTimeout(id); timers.delete(id);},
    setInterval(fn, delay, ...args) {const id = nativeWindow.setInterval(fn, delay, ...args); intervals.add(id); return id;},
    clearInterval(id) {nativeWindow.clearInterval(id); intervals.delete(id);},
    requestAnimationFrame(fn) {const id = nativeWindow.requestAnimationFrame(time => {frames.delete(id); fn(time);}); frames.add(id); return id;},
    dispose() {
      for (const fn of disposers) fn();
      for (const item of listeners) item.target.removeEventListener(item.type, item.wrapped, item.options);
      for (const id of timers) nativeWindow.clearTimeout(id);
      for (const id of intervals) nativeWindow.clearInterval(id);
      for (const id of frames) nativeWindow.cancelAnimationFrame(id);
    }
  };
  const environment = {window: proxy, document: scopedDocument, parent: {Matrix: nativeWindow.Matrix}, MatrixMapping: nativeWindow.MatrixMapping,
    setTimeout: proxy.setTimeout, clearTimeout: proxy.clearTimeout, setInterval: proxy.setInterval, clearInterval: proxy.clearInterval,
    requestAnimationFrame: proxy.requestAnimationFrame};
  return {proxy, root, body, environment, disposers, mount: () => module.mount(environment)};
}

function services(main, kind) {
  const subscribers = new Map(), dialogs = new Map();
  const emit = (name, data) => {for (const entry of subscribers.get(name) || []) if (!entry.dead) entry.handler(data);};
  async function open(name, moduleName) {
    if (dialogs.has(name)) return {ok: true};
    const module = await modules[moduleName]();
    const dialog = document.createElement('dialog'); dialog.className = 'native-dialog';
    dialog.setAttribute('aria-label', name.replace(/([A-Z])/g, ' $1').trim());
    const element = document.createElement('div'); dialog.append(element); main.body.append(dialog);
    const child = scope(element, module);
    dialogs.set(name, {dialog, child});
    child.proxy.api = apiFor(child);
    child.proxy.close = () => close(name);
    dialog.addEventListener('cancel', event => {event.preventDefault(); close(name);});
    dialog.showModal();
    child.mount();
    return {ok: true};
  }
  async function close(name) {
    const value = dialogs.get(name);
    if (value) {value.child.proxy.dispose(); value.dialog.close(); value.dialog.remove(); dialogs.delete(name);}
    emit(`on${name}Closed`, {});
    return {ok: true};
  }
  const events = {
    setAssignDamageWindowState: 'onAssignDamageWindowState', setAssignDamageDestructionPreview: 'onAssignDamageDestructionPreview',
    setAssignDamageWeaponPrompt: 'onAssignDamageWeaponPrompt', setWeaponSelectWindowState: 'onWeaponSelectWindowState',
    setAssignDamageManualDacPrompt: 'onAssignDamageManualDacPrompt', setManualDacRollWindowState: 'onManualDacRollWindowState',
    previewAssignDamageWindowSelection: 'onAssignDamageWindowPreview', submitAssignDamageWindow: 'onAssignDamageWindowSubmit',
    submitAssignDamageWeaponSelection: 'onAssignDamageWeaponSelectionSubmit', cancelAssignDamageWeaponSelection: 'onAssignDamageWeaponSelectionCancel',
    submitAssignDamageManualDacPrompt: 'onAssignDamageManualDacPromptSubmit', cancelAssignDamageManualDacPrompt: 'onAssignDamageManualDacPromptCancel',
    submitManualDacRollWindow: 'onManualDacRollWindowSubmit', cancelManualDacRollWindow: 'onManualDacRollWindowCancel'
  };
  const api = {
    getAppVersion: async () => kind === 'veil' ? 'Command Matrix' : {ok: true, version: 'Command Matrix'},
    checkForUpdates: async () => ({ok: true}), openUpdates: async () => ({ok: true}),
    getSettings: async () => ({ok: true, settings: {}}), getSetupPaths: async () => ({gamesDir: 'server'}),
    readHeavyList: async () => ({ok: true, options: ['Photon Torpedo','Disruptor','Plasma Torpedo F','Plasma Torpedo G','Plasma Torpedo S','Plasma Torpedo R','Hellbore','Fusion Beam','Drone','Option Mount']}),
    getRollsConfig: async () => ({ok: true, rollsConfig: await (await fetch('assets/rolls.json')).json()}),
    getShipyardDataConfig: async () => ({ok: true, dataConfig: await (await fetch('assets/shipyard.json')).json()}),
    openAssignDamageWindow: () => open('AssignDamageWindow', 'assign-damage'),
    openWeaponSelectWindow: () => open('WeaponSelectWindow', 'weapon-select'),
    openManualDacRollWindow: () => open('ManualDacRollWindow', 'manual-dac-roll'),
    closeAssignDamageWindow: () => close('AssignDamageWindow'), closeWeaponSelectWindow: () => close('WeaponSelectWindow'),
    closeManualDacRollWindow: () => close('ManualDacRollWindow'),
    saveTurnEnergy: async () => {await main.proxy.matrixFlush(); return {ok: true, filePath: 'Game server'};},
    saveGame: async () => {await main.proxy.matrixFlush(); return {ok: true, filePath: 'Game server'};}
  };
  for (const [method, event] of Object.entries(events)) api[method] = async data => {
    emit(event, data);
    const name = method.startsWith('setWeaponSelect') ? 'WeaponSelectWindow' : method.startsWith('setManualDacRoll') ? 'ManualDacRollWindow' : 'AssignDamageWindow';
    return {ok: true, shown: dialogs.has(name)};
  };
  function apiFor(owner) {
    const result = {...api};
    for (const event of [...Object.values(events), 'onAssignDamageWindowClosed', 'onWeaponSelectWindowClosed', 'onManualDacRollWindowClosed']) {
      result[event] = handler => {
        const entry = {handler, dead: false}; subscribers.set(event, [...(subscribers.get(event) || []), entry]);
        const dispose = () => {entry.dead = true;}; owner.disposers.push(dispose); return dispose;
      };
    }
    return result;
  }
  main.proxy.api = apiFor(main);
  main.proxy.WCMDesktop = {busy: () => dialogs.size > 0};
  main.disposers.push(() => {for (const name of [...dialogs.keys()]) close(name);});
}

export async function mountStation(container, kind, context) {
  const module = await modules[kind]();
  const element = document.createElement('ship-station'); element.setAttribute('aria-label', `${kind} ship controls`);
  container.replaceChildren(element);
  const instance = scope(element, module);
  services(instance, kind);
  instance.mount();
  try {await instance.proxy.matrixLoad(context);} catch (error) {instance.proxy.dispose(); element.remove(); throw error;}
  const observer = new ResizeObserver(() => nativeWindow.dispatchEvent(new Event('resize')));
  observer.observe(container); instance.disposers.push(() => observer.disconnect());
  return instance.proxy;
}
