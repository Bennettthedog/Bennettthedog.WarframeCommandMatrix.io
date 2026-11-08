const state = {
  tabs: [],
  activeTabId: null,
  damageMode: false,
  systemMode: false,
  refitMode: false,
  moveMode: false,
  moveChartHighlightedSpeeds: []
}

let APP_VERSION = null
let heavyLabelSetCache = null

let energyTemplate = null
const ENERGY_TEMPLATE_LINES = [
  "*WARP ENGINE POWER",
  "*IMPULSE ENGINE POWER",
  "*REACTOR POWER",
  "*TOTAL POWER AVAILABLE",
  "",
  "*BATTERY POWER AVAILABLE",
  "TOTAL BATTERIES",
  "BATTERY POWER RECHARGED",
  "*BATTERY POWER DISCHARGED",
  "",
  "Vuldar Ionization",
  "",
  "LIFE SUPPORT",
  "ACTIVE FIRE CONTROL",
  "",
  "PHASERS",
  "*HELD PHASER CAPACITORS",
  "*MAX PHASER CAPACITORS",
  "CHARGE PHASER CAPACITORS",
  "*CURRENT PHASER CHARGE",
  "",
  "HEAVY WEAPONS",
  "",
  "ACTIVATE SHIELDS",
  "GENERAL REINFORCEMENT",
  "SPECIFIC REINFORCEMENT",
  "",
  "Breaking Energy",
  "ENERGY FOR MOVEMENT",
  "MOVEMENT COST",
  "*SPEED",
  "HET",
  "EM / BRAKING",
  "",
  "DAMAGE CONTROL",
  "RESERVE WARP",
  "TRACTOR / NEGATIVE TRACTOR",
  "Anti-Transporter Field",
  "TRANSPORTERS",
  "",
  "ECM - Defense",
  "ECCM - Offense",
  "LABS",
  "CHARGE WILD WEASEL / SUICIDE SHUTTLE",
  "CLOAKING DEVICE",
  "",
  "*TOTAL POWER USED",
  "*PHASER CAPACITORS USED"
]

let toastTimer = null
const dragState = {
  active: false,
  moved: false,
  tabId: null,
  startX: 0,
  startY: 0,
  startDx: 0,
  startDy: 0
}

function showTempMessage(text, durationMs = 1600) {
  if (!text) return
  let el = document.getElementById("tempToast")
  if (!el) {
    el = document.createElement("div")
    el.id = "tempToast"
    el.className = "tempToast"
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add("show")

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.classList.remove("show")
  }, Math.max(500, Number(durationMs) || 0))
}

function renderAppVersion() {
  const topBar = document.getElementById("contentTopBar")
  if (!topBar) return

  let el = document.getElementById("appVersion")
  if (!el) {
    el = document.createElement("div")
    el.id = "appVersion"
    el.style.fontSize = "12px"
    el.style.color = "rgba(255, 255, 255, 0.65)"
    el.style.border = "1px solid rgba(255, 255, 255, 0.12)"
    el.style.padding = "4px 8px"
    el.style.borderRadius = "10px"
    el.style.background = "rgba(255, 255, 255, 0.06)"
    el.style.whiteSpace = "nowrap"
    el.style.userSelect = "none"
    el.style.cursor = "pointer"
    el.title = "Check for updates"
    el.onclick = async () => {
      const ok = confirm("Check for updates now?")
      if (!ok) return
      if (window.api && typeof window.api.checkForUpdates === "function") {
        try {
          const res = await window.api.checkForUpdates()
          if (!res || !res.ok) {
            alert(res?.error || "Failed to check for updates.")
          } else {
            showTempMessage("Checking for updates...")
          }
        } catch {
          alert("Failed to check for updates.")
        }
      } else if (window.api && typeof window.api.openUpdates === "function") {
        await window.api.openUpdates()
      } else {
        alert("Update checking isn't configured.")
      }
    }
    topBar.appendChild(el)
  }
  if (APP_VERSION) {
    el.textContent = `v${APP_VERSION}`
    el.style.display = ""
  } else {
    el.textContent = ""
    el.style.display = "none"
  }
}

async function loadAppVersion() {
  if (!window.api || typeof window.api.getAppVersion !== "function") return
  try {
    const v = await window.api.getAppVersion()
    if (v) {
      APP_VERSION = String(v)
      const el = document.getElementById("appVersion")
      if (el) {
        el.textContent = `v${APP_VERSION}`
        el.style.display = ""
      }
    }
  } catch {}
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function normalizeHeavyLabel(text) {
  return String(text || "").trim().toLowerCase()
}

function isKnownHeavyWeaponLabel(text, heavySet = null) {
  const clean = normalizeHeavyLabel(text)
  if (!clean) return false
  if (heavySet instanceof Set && heavySet.has(clean)) return true
  return clean === "heavy hyper cannon" || clean === "light hyper cannon" || clean === "hch" || clean === "hcl"
}

async function loadHeavyLabelSet() {
  if (heavyLabelSetCache instanceof Set) return heavyLabelSetCache

  const set = new Set()
  if (window.api && typeof window.api.readHeavyList === "function") {
    try {
      const res = await window.api.readHeavyList()
      if (res && res.ok && Array.isArray(res.options)) {
        for (const opt of res.options) {
          const clean = normalizeHeavyLabel(opt)
          if (clean) set.add(clean)
        }
      }
    } catch {}
  }

  heavyLabelSetCache = set
  return heavyLabelSetCache
}

async function applyHeavyLabelSetToTab(tab) {
  if (!tab) return
  const loadedSet = await loadHeavyLabelSet()
  tab.heavyLabelSet = new Set(loadedSet)

  for (const square of Array.isArray(tab.doc?.squares) ? tab.doc.squares : []) {
    const designation = normText(square?.designation)
    const heavyLetter = normText(square?.heavyLetter)
    if (designation && !heavyLetter) {
      square.heavyLetter = designation
    } else if (heavyLetter && !designation) {
      square.designation = heavyLetter
    }
    const name = getSquareDisplayName(square)
    if (isKnownHeavyWeaponLabel(name, tab.heavyLabelSet)) {
      square.additionalLabel = "heavy Weapons"
    }
  }
}

function promptOptionMountPowerRecords(optionMounts) {
  return new Promise(resolve => {
    const overlay = document.createElement("div")
    overlay.className = "modalOverlay"

    const card = document.createElement("div")
    card.className = "modalCard"
    card.style.width = "460px"

    const title = document.createElement("div")
    title.className = "modalTitle"
    title.textContent = "Option Mount Power Records"

    const desc = document.createElement("div")
    desc.className = "modalDesc"
    desc.textContent = "Select the option mounts that need power records in energy allocation."

    const list = document.createElement("div")
    list.style.display = "flex"
    list.style.flexDirection = "column"
    list.style.gap = "8px"
    list.style.maxHeight = "360px"
    list.style.overflowY = "auto"
    list.style.marginBottom = "14px"

    const rows = optionMounts.map((square, index) => {
      const row = document.createElement("label")
      row.style.display = "flex"
      row.style.alignItems = "center"
      row.style.gap = "10px"
      row.style.padding = "8px 10px"
      row.style.border = "1px solid var(--border)"
      row.style.borderRadius = "8px"
      row.style.background = "rgba(255, 255, 255, 0.04)"

      const checkbox = document.createElement("input")
      checkbox.type = "checkbox"
      checkbox.checked = optionMountNeedsPowerRecord(square)

      const fields = document.createElement("div")
      fields.style.display = "flex"
      fields.style.flexDirection = "column"
      fields.style.gap = "6px"
      fields.style.flex = "1"

      const label = document.createElement("span")
      const boxLabel = square.id === undefined || square.id === null ? `Option Mount ${index + 1}` : `Box ${square.id}`
      label.textContent = `${boxLabel}: ${formatOptionMountEnergyLabel(square)}`

      const nameInput = document.createElement("input")
      nameInput.type = "text"
      nameInput.placeholder = "Power record name"
      nameInput.value = normText(square.optionMountPowerName)
      nameInput.style.width = "100%"
      nameInput.disabled = !checkbox.checked

      checkbox.onchange = () => {
        nameInput.disabled = !checkbox.checked
        if (checkbox.checked) nameInput.focus()
      }

      fields.appendChild(label)
      fields.appendChild(nameInput)
      row.appendChild(checkbox)
      row.appendChild(fields)
      list.appendChild(row)
      return { square, checkbox, nameInput }
    })

    const actions = document.createElement("div")
    actions.className = "modalActions"

    const cancel = document.createElement("button")
    cancel.textContent = "Cancel"
    const apply = document.createElement("button")
    apply.textContent = "Apply"
    actions.appendChild(cancel)
    actions.appendChild(apply)

    card.appendChild(title)
    card.appendChild(desc)
    card.appendChild(list)
    card.appendChild(actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const cleanup = (value) => {
      window.removeEventListener("keydown", onKey)
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay)
      resolve(value)
    }

    const onKey = (e) => {
      if (e.key === "Escape") cleanup(null)
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        apply.click()
      }
    }

    cancel.onclick = () => cleanup(null)
    apply.onclick = () => cleanup(rows.map(row => ({
      square: row.square,
      needsPower: row.checkbox.checked,
      name: normText(row.nameInput.value)
    })))
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(null)
    }
    window.addEventListener("keydown", onKey)
  })
}

async function askOptionMountPowerRecords(tab) {
  if (!tab || !Array.isArray(tab.doc?.squares)) return true
  const optionMounts = tab.doc.squares
    .filter(square => !isSquareRemovedOrDamaged(square) && isOptionMountSquare(square))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))

  if (optionMounts.length === 0) return true

  const result = await promptOptionMountPowerRecords(optionMounts)
  if (result === null) return false

  for (const entry of result) {
    entry.square.optionMountNeedsPower = !!entry.needsPower
    entry.square.optionMountPowerName = entry.needsPower ? normText(entry.name) : ""
  }
  return true
}

function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null
}

function cleanupSquareTimers(squares) {
  if (!Array.isArray(squares)) return
  for (const s of squares) {
    if (s.phaserGTimer) {
      clearTimeout(s.phaserGTimer)
      delete s.phaserGTimer
    }
  }
}

function setActiveTab(tabId) {
  const oldTab = getActiveTab()
  if (oldTab && oldTab.id !== tabId && oldTab.doc?.squares) {
    cleanupSquareTimers(oldTab.doc.squares)
  }
  dragState.active = false
  dragState.tabId = null
  state.activeTabId = tabId
  renderTabs()
  renderCanvas()
  renderCurrentProps()
  updateShipControlsVisibility()
  updateMoveChartUI()
}

/* -----------------------------
   Left panel: Ship Controls visibility
----------------------------- */
function updateShipControlsVisibility() {
  const el = document.getElementById("shipControlsSection")
  const turnEl = document.getElementById("turnControlsSection")
  if (!el && !turnEl) return

  const tab = getActiveTab()
  const show = !!tab && tab.uiState === "loadShip" && !!tab.doc

  if (el) {
    if (show) el.classList.remove("hidden")
    else el.classList.add("hidden")
  }
  if (turnEl) {
    if (show) turnEl.classList.remove("hidden")
    else turnEl.classList.add("hidden")
  }
}

function updateTurnControlsUI() {
  const btn = document.getElementById("btnStartTurn")
  const counter = document.getElementById("turnCounter")
  const tab = getActiveTab()
  if (!btn) return
  const locked = !!tab?.turnLocked
  btn.textContent = locked ? "End Turn" : "Start Turn"
  if (locked) btn.classList.add("turnLockedActive")
  else btn.classList.remove("turnLockedActive")
  if (counter) {
    const tn = tab?.turnNumber || 1
    counter.textContent = `Turn ${tn}`
  }
}

function syncLeftPanelScrollbar() {
  const el = document.getElementById("leftPanel")
  if (!el) return
  const needsScroll = el.scrollHeight > el.clientHeight + 1
  el.classList.toggle("noScroll", !needsScroll)
}

function normalizeSquareLabelForMatch(text) {
  return (text || "").trim().toLowerCase()
}

function applySavedTurnToTab(tab, saveObj) {
  if (!tab || !tab.doc || !saveObj || typeof saveObj !== "object") {
    return { ok: false, error: "No save data to apply." }
  }

  const turns = Array.isArray(saveObj.turns) ? saveObj.turns : []
  if (turns.length === 0) return { ok: false, error: "Save file has no turns." }
  const latestTurn = turns[turns.length - 1]

  const tn = Number(latestTurn?.turnNumber)
  const advance = latestTurn?.turnState?.advanceTurn
  if (Number.isFinite(tn)) {
    tab.turnNumber = advance === false ? tn : tn + 1
  } else {
    tab.turnNumber = Math.max(1, tab.turnNumber || 1)
  }
  tab.turnLocked = !!latestTurn?.turnState?.turnLocked
  tab.energyValues = { ...(latestTurn?.energyValues || {}) }
  tab.energyDisplay = { ...(latestTurn?.energyDisplay || {}) }
  tab.batteryAvailBase = null
  tab.phaserCapsCleared = false
  tab.energyReset = false

  const savedSquares = Array.isArray(latestTurn?.squares) ? latestTurn.squares : []
  const byId = new Map()
  for (const s of savedSquares) {
    if (!s) continue
    if (s.id !== undefined && s.id !== null) byId.set(String(s.id), s)
  }

  for (const sq of tab.doc.squares || []) {
    const match = byId.get(String(sq.id))

    const applyFlag = (prop, flag) => {
      if (flag) sq[prop] = true
      else delete sq[prop]
    }

    applyFlag("damaged", !!match?.damaged)
    applyFlag("refitRemoved", !!match?.refitRemoved)
    applyFlag("systemDeployed", !!match?.systemDeployed)

    if (match && typeof match.phaserCapUsage === "number") sq.phaserCapUsage = match.phaserCapUsage
    else delete sq.phaserCapUsage

    if (isOptionMountSquare(sq) && match && typeof match.optionMountNeedsPower === "boolean") {
      sq.optionMountNeedsPower = match.optionMountNeedsPower
      sq.optionMountPowerName = normText(match.optionMountPowerName)
    }
  }

  recomputePhaserCapsUsed(tab)
  return { ok: true, turn: latestTurn }
}

function clearSystemDeploymentsForNewTurn(tab) {
  if (!tab || !tab.doc) return
  const targets = [
    "phaser 1",
    "phaser 2",
    "phaser 3",
    "phaser 4",
    "phaser g",
    "transporter",
    "battery",
    "tractor",
    "labs"
  ]
  for (const sq of tab.doc.squares || []) {
    const name = normalizeSquareLabelForMatch(getSquareDisplayName(sq))
    if (!name) continue
    if (targets.some(t => name.startsWith(t))) {
      delete sq.systemDeployed
      delete sq.phaserCapUsage
      delete sq.phaserGCount
      if (sq.phaserGTimer) {
        clearTimeout(sq.phaserGTimer)
        delete sq.phaserGTimer
      }
    }
  }
  recomputePhaserCapsUsed(tab)
}

function normalizeAutoLabelSet() {
  return new Set([
    "warp engine power",
    "total warp",
    "impulse engine power",
    "reactor power",
    "total available power",
    "total power available",
    "total power",
    "total power used",
    "movement cost",
    "speed",
    "phaser capacitors used",
    "phasers",
    "held phaser capacitors",
    "current phaser charge",
    "max phaser capacitors",
    "battery power available",
    "battery power discharged"
  ])
}

function refreshEnergyValuesForSave(tab) {
  if (!tab) return

  tab.energyValues = tab.energyValues || {}
  tab.energyDisplay = tab.energyDisplay || {}

  const autoLabelsSet = normalizeAutoLabelSet()
  const powerStats = computePowerStats(tab)

  // Set core power values
  setEnergyValue(tab, "warp engine power", powerStats.warp, "Warp engine power")
  setEnergyValue(tab, "impulse engine power", powerStats.impulse, "IMPULSE ENGINE POWER")
  setEnergyValue(tab, "reactor power", powerStats.reactor, "REACTOR POWER")
  setEnergyValue(tab, "total power available", powerStats.total, "TOTAL POWER AVAILABLE")

  // Battery handling with carry-over + discharge/recharge
  const dischargeVal = computeBatteryDischarged(tab)
  setEnergyValue(tab, "battery power discharged", dischargeVal, "BATTERY POWER DISCHARGED")
  const batteryAvailVal = computeBatteryAvailable(tab, powerStats)
  setEnergyValue(tab, "battery power available", batteryAvailVal, "BATTERY POWER AVAILABLE")
  setEnergyValue(tab, "total batteries", powerStats.battery, "TOTAL BATTERIES")

  // Phaser capacitors
  const maxCaps = computeMaxPhaserCaps(tab)
  setEnergyValue(tab, "max phaser capacitors", maxCaps, "MAX PHASER CAPACITORS")
  syncPhaserRemainingWithMax(tab, maxCaps)
  recomputePhaserCapsUsed(tab)
  computeCurrentPhaserCharge(tab, { updateValues: true })

  // Speed calculation
  const energyMoveKey = findEnergyKey(tab.energyValues, "energy for movement")
  const moveCostKey = findEnergyKey(tab.energyValues, "movement cost")
  const energyMove = Number(tab.energyValues[energyMoveKey]) || 0
  const moveCost = Number(tab.energyValues[moveCostKey]) || 0
  const speedVal = moveCost > 0 ? Math.round(energyMove / moveCost) : 0
  setEnergyValue(tab, "speed", speedVal, "Speed")

  // Total power used (excluding auto-calculated fields)
  const totalUsed = Object.entries(tab.energyValues || {}).reduce((acc, [k, v]) => {
    const kl = k.toLowerCase()
    if (autoLabelsSet.has(kl)) return acc
    const n = Number(v)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
  setEnergyValue(tab, "total power used", totalUsed, "TOTAL POWER USED")

  if (tab.id === state.activeTabId) {
    renderEnergyTable()
  }
}

function buildTurnSavePayload(tab) {
  if (!tab || !tab.doc) return null

  // Make sure auto-calculated fields are up to date before saving.
  refreshEnergyValuesForSave(tab)

  const squares = (tab.doc?.squares || [])
    .map((s) => {
      const pts = Array.isArray(s.points) ? s.points.map(p => [p[0], p[1]]) : undefined
      const bbox = s.bbox
        ? { x1: s.bbox.x1, y1: s.bbox.y1, x2: s.bbox.x2, y2: s.bbox.y2 }
        : undefined
      return {
        id: s.id,
        label: getSquareDisplayName(s),
        name: s.name || s.label || "",
        damaged: !!s.damaged,
        refitRemoved: !!s.refitRemoved,
        systemDeployed: !!s.systemDeployed,
        optionMountNeedsPower: isOptionMountSquare(s) && typeof s.optionMountNeedsPower === "boolean"
          ? s.optionMountNeedsPower
          : undefined,
        optionMountPowerName: isOptionMountSquare(s) ? normText(s.optionMountPowerName) || undefined : undefined,
        phaserCapUsage: typeof s.phaserCapUsage === "number" ? s.phaserCapUsage : undefined,
        fired: !!s.fired,
        points: pts,
        bbox
      }
    })
    .filter((s) =>
      s.damaged ||
      s.refitRemoved ||
      s.systemDeployed ||
      s.fired ||
      typeof s.phaserCapUsage === "number" ||
      typeof s.optionMountNeedsPower === "boolean" ||
      !!s.optionMountPowerName
    )

  return {
    energyValues: { ...(tab.energyValues || {}) },
    energyDisplay: { ...(tab.energyDisplay || {}) },
    turnNumber: tab.turnNumber || 1,
    squares
  }
}

async function saveTurnSnapshot(tab, options = {}) {
  if (!tab || !tab.doc) return { ok: false, error: "No ship loaded." }

  const powerStats = computePowerStats(tab)
  const totalAvailable = powerStats.total
  const totalUsedKey = findEnergyKey(tab.energyValues, "total power used")
  const totalUsed = Number(tab.energyValues[totalUsedKey]) || 0

  if (totalUsed > totalAvailable) {
    const overBy = totalUsed - totalAvailable
    const proceed = confirm(
      `Warning: Power usage exceeds available power by ${overBy} points.\n\n` +
      `Total Available: ${totalAvailable}\n` +
      `Total Used: ${totalUsed}\n\n` +
      `Save anyway?`
    )
    if (!proceed) return { ok: false, error: "Save cancelled due to power overload." }
  }

  const payload = buildTurnSavePayload(tab)
  if (!payload) return { ok: false, error: "Nothing to save for this turn." }
  const advanceTurn = !!options.advanceTurn
  payload.turnState = {
    turnLocked: !!tab.turnLocked,
    turnNumber: payload.turnNumber,
    advanceTurn
  }

  try {
    const suggestedName = tab.title || tab.shipName || "Ship"
    const setup = await window.api.getSetupPaths().catch(() => null)
    const gamesConfigured = !!setup?.gamesDir

    let savePath = tab.gameSavePath || null
    if (!savePath && !gamesConfigured) {
      const picked = await window.api.pickGameSavePath(suggestedName)
      if (!picked || !picked.ok || !picked.path) {
        return { ok: false, error: picked?.error || "Save canceled." }
      }
      savePath = picked.path
    }

    const res = await window.api.saveTurnEnergy(tab.title || tab.shipName || "Ship", payload, savePath)
    if (!res || !res.ok) {
      return { ok: false, error: res?.error || "Failed to save." }
    }
    tab.gameSavePath = savePath || res?.path || tab.gameSavePath
    showTempMessage(advanceTurn ? "Turn saved." : "Game saved.")
    return { ok: true, path: tab.gameSavePath }
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to save." }
  }
}

function findEnergyKey(obj, targetLower) {
  if (!obj) return null
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === targetLower) return k
  }
  return null
}

function setEnergyValue(tab, targetLower, value, canonicalLabel) {
  if (!tab) return
  if (!tab.energyValues) tab.energyValues = {}
  const existing = findEnergyKey(tab.energyValues, targetLower)
  const key = existing || canonicalLabel || targetLower
  tab.energyValues[key] = value
  return key
}

function syncPhaserRemainingWithMax(tab, maxCaps) {
  if (!tab) return
  if (!tab.energyValues) tab.energyValues = {}
  const key =
    findEnergyKey(tab.energyValues, "held phaser capacitors") ||
    findEnergyKey(tab.energyValues, "phaser capacitors remaining") ||
    "Held phaser capacitors"
  const current = Number(tab.energyValues[key])
  const safeVal = Number.isFinite(current) ? Math.min(current, maxCaps) : maxCaps
  tab.energyValues[key] = safeVal

  tab.energyDisplay = tab.energyDisplay || {}
  const dispKey =
    findEnergyKey(tab.energyDisplay, "held phaser capacitors") ||
    findEnergyKey(tab.energyDisplay, "phaser capacitors remaining") ||
    key
  tab.energyDisplay[dispKey] = tab.energyValues[key]
}

function resetEnergyForNewTurn(tab, prevEnergyValues, prevEnergyDisplay) {
  if (!tab) return
  const srcVals = prevEnergyValues || tab.energyValues || {}
  const srcDisp = prevEnergyDisplay || tab.energyDisplay || {}

  const batteryAvailKey = findEnergyKey(srcVals, "battery power available") || "BATTERY POWER AVAILABLE"
  const batteryRechargeKey =
    findEnergyKey(srcVals, "battery power recharged") || "BATTERY POWER RECHARGED"
  const batteryDischargeKey =
    findEnergyKey(srcVals, "battery power discharged") || "BATTERY POWER DISCHARGED"
  const prevBatteryAvail = Number(srcVals ? srcVals[batteryAvailKey] : undefined)
  const prevBatteryRecharge = Number(srcVals ? srcVals[batteryRechargeKey] : undefined)
  const prevBatteryDischarge = Number(srcVals ? srcVals[batteryDischargeKey] : undefined)
  const maxBatteries = computePowerStats(tab).battery
  const safeRecharge = Number.isFinite(prevBatteryRecharge) ? prevBatteryRecharge : 0
  const safeDischarge = Number.isFinite(prevBatteryDischarge) ? prevBatteryDischarge : 0

  let prevBase = Number(tab.batteryAvailBase)
  if (!Number.isFinite(prevBase)) {
    if (Number.isFinite(prevBatteryAvail)) {
      prevBase = Math.min(maxBatteries, prevBatteryAvail + safeDischarge) - safeRecharge
    } else {
      prevBase = maxBatteries
    }
  }

  const beforeDischarge = Math.min(maxBatteries, prevBase + safeRecharge)
  const batteryNextClamped = Math.max(0, beforeDischarge - safeDischarge)

  const moveKeyVal = findEnergyKey(srcVals, "movement cost") || "MOVEMENT COST"
  const moveKeyDisplay = findEnergyKey(srcDisp, "movement cost") || moveKeyVal
  const prevMoveVal = srcVals ? srcVals[moveKeyVal] : undefined
  const prevMoveDisplay = srcDisp ? srcDisp[moveKeyDisplay] : undefined

  const remainingKey =
    findEnergyKey(srcVals, "held phaser capacitors") ||
    findEnergyKey(srcVals, "phaser capacitors remaining") ||
    "Held phaser capacitors"
  const usedKey = findEnergyKey(srcVals, "phaser capacitors used") || "Phaser capacitors used"
  const changeKey = findEnergyKey(srcVals, "charge phaser capacitors") || "Charge phaser capacitors"
  const prevRemaining = Number(srcVals ? srcVals[remainingKey] : undefined)
  const prevUsed = Number(srcVals ? srcVals[usedKey] : undefined)
  const prevChange = Number(srcVals ? srcVals[changeKey] : undefined)
  const hasPrevRemaining = Number.isFinite(prevRemaining)
  const hasPrevUsed = Number.isFinite(prevUsed)
  const hasPrevChange = Number.isFinite(prevChange)
  const nextRemaining = hasPrevRemaining
    ? Math.max(
        0,
        prevRemaining + (hasPrevChange ? prevChange : 0) - (hasPrevUsed ? prevUsed : 0)
      )
    : undefined

  tab.energyValues = {}
  tab.energyDisplay = {}
  tab.batteryAvailBase = null

  if (prevMoveVal !== undefined) tab.energyValues[moveKeyVal] = prevMoveVal
  if (prevMoveDisplay !== undefined) tab.energyDisplay[moveKeyDisplay] = prevMoveDisplay
  if (batteryNextClamped !== undefined) {
    tab.energyValues[batteryAvailKey] = batteryNextClamped
    tab.energyDisplay[batteryAvailKey] = batteryNextClamped
    tab.batteryAvailBase = batteryNextClamped
  }
  if (nextRemaining !== undefined) tab.energyValues[remainingKey] = nextRemaining

  tab.phaserCapsCleared = true
  tab.energyReset = true
}

function addEmptyTab() {
  const id = uid()
  state.tabs.push({
    id,
    title: "Untitled",
    affiliation: null,
    shipName: null,

    // UI mode for conditional panels in the left explorer
    uiState: "empty",

    imageDataUrl: null,
    imageObj: null,

    jsonPath: null,
    doc: null,
    selected: null,
    energyValues: {},
    energyDisplay: {},
    batteryAvailBase: null,
    turnLocked: false,
    turnNumber: 1,
    view: {
      scale: 1,
      ox: 0,
      oy: 0,
      manualDx: 0,
      manualDy: 0,
      canvasW: 0,
      canvasH: 0,
      initialized: false
    },
    customShieldLabels: new Set(),
    heavyLabelSet: new Set(),
    gameSavePath: null
  })
  setActiveTab(id)
}

function closeTabById(tabId) {
  const idx = state.tabs.findIndex(t => t.id === tabId)
  if (idx === -1) return

  const closingTab = state.tabs[idx]
  if (closingTab.doc?.squares) {
    cleanupSquareTimers(closingTab.doc.squares)
  }

  const closingActive = state.activeTabId === tabId
  state.tabs.splice(idx, 1)

  if (state.tabs.length === 0) {
    addEmptyTab()
    return
  }

  if (closingActive) {
    const nextIdx = Math.max(0, idx - 1)
    setActiveTab(state.tabs[nextIdx].id)
  } else {
    renderTabs()
  }
}

function ensureEmptyActiveTab() {
  const current = getActiveTab()
  if (!current || current.doc) {
    addEmptyTab()
    return getActiveTab()
  }
  return current
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs")
  tabsEl.innerHTML = ""

  for (const tab of state.tabs) {
    const el = document.createElement("div")
    el.className = "tab" + (tab.id === state.activeTabId ? " active" : "")
    el.onclick = () => setActiveTab(tab.id)

    const title = document.createElement("span")
    title.className = "tabTitle"
    title.textContent = tab.title
    if (tab.affiliation === "friendly") title.style.color = "#2edb73"
    else if (tab.affiliation === "enemy") title.style.color = "#ff5c5c"
    el.appendChild(title)

    const closeBtn = document.createElement("button")
    closeBtn.className = "tabClose"
    closeBtn.textContent = "×"
    closeBtn.onclick = (e) => {
      e.stopPropagation()
      closeTabById(tab.id)
    }
    el.appendChild(closeBtn)

    tabsEl.appendChild(el)
  }
}

function normText(s) {
  if (s === null || s === undefined) return ""
  return String(s).trim()
}

function getSquareDisplayName(s) {
  return normText(s.label) || normText(s.name) || ""
}

function getSquareHeavyLetter(square) {
  return normText(square?.heavyLetter)
}

function getSquareWeaponDesignation(square) {
  return normText(square?.designation)
}

function getSquareWeaponDesignationDisplay(square) {
  const designation = getSquareWeaponDesignation(square)
  const heavyLetter = getSquareHeavyLetter(square)
  if (designation && heavyLetter && designation.toLowerCase() !== heavyLetter.toLowerCase()) {
    return `${designation} / ${heavyLetter}`
  }
  return designation || heavyLetter || ""
}

function isOptionMountSquare(square) {
  const name = getSquareDisplayName(square).toLowerCase()
  return name === "option mount" || name.includes("option mount")
}

function getOptionMountLetter(square) {
  return normText(
    square?.optionMountLetter ||
    square?.designation ||
    square?.heavyLetter ||
    square?.letterLabel
  )
}

function optionMountNeedsPowerRecord(square) {
  if (!isOptionMountSquare(square)) return false
  if (square.optionMountNeedsPower === true) return true
  if (square.optionMountNeedsPower === false) return false
  return square.additionalLabel === "heavy Weapons" && !!getOptionMountLetter(square)
}

function formatOptionMountEnergyLabel(square) {
  const customName = normText(square?.optionMountPowerName)
  const name = customName || getSquareDisplayName(square) || "Option Mount"
  const letter = getOptionMountLetter(square)
  if (letter) return `${name}, ${letter}`
  return square?.id === undefined || square?.id === null ? name : `${name} #${square.id}`
}

function appendOptionMountEnergyLabelContent(labelEl, square) {
  const customName = normText(square?.optionMountPowerName)
  const letter = getOptionMountLetter(square)
  const fallbackName = letter ? `Option Mount, ${letter}` : formatOptionMountEnergyLabel(square)
  const primaryText = customName
    ? (letter ? `${customName}, ${letter}` : customName)
    : fallbackName

  const primary = document.createElement("div")
  primary.textContent = primaryText

  const secondary = document.createElement("div")
  secondary.textContent = "Option Mount"
  secondary.style.fontSize = "11px"
  secondary.style.fontWeight = "600"
  secondary.style.color = "var(--muted)"
  secondary.style.marginTop = "2px"

  labelEl.style.flexDirection = "column"
  labelEl.style.gap = "2px"
  labelEl.appendChild(primary)
  labelEl.appendChild(secondary)
}

function isSquareRemovedOrDamaged(s) {
  return !!s?.refitRemoved || !!s?.damaged
}

function isBatterySquare(s) {
  const name = getSquareDisplayName(s).toLowerCase()
  return name === "battery" || name.startsWith("battery ")
}

function fileStemFromPath(p) {
  const name = baseNameFromPath(p)
  const i = name.lastIndexOf(".")
  if (i <= 0) return name
  return name.slice(0, i)
}

function baseNameFromPath(p) {
  if (!p) return ""
  const parts = String(p).split(/[/\\]+/g).filter(Boolean)
  if (parts.length === 0) return ""
  return parts[parts.length - 1]
}

function parseSuperluminalPosToBbox(posText) {
  const parts = String(posText || "")
    .split(",")
    .map(part => Number(part.trim()))
    .filter(Number.isFinite)

  if (parts.length < 4) return null

  const [x1Raw, y1Raw, x2Raw, y2Raw] = parts
  return {
    x1: Math.min(x1Raw, x2Raw),
    y1: Math.min(y1Raw, y2Raw),
    x2: Math.max(x1Raw, x2Raw),
    y2: Math.max(y1Raw, y2Raw)
  }
}

function pointsFromBbox(bbox) {
  if (!bbox) return []
  return [
    [bbox.x1, bbox.y1],
    [bbox.x2, bbox.y1],
    [bbox.x2, bbox.y2],
    [bbox.x1, bbox.y2]
  ]
}

function mergeBbox(target, bbox) {
  if (!bbox) return target
  if (!target) return { ...bbox }
  target.x1 = Math.min(target.x1, bbox.x1)
  target.y1 = Math.min(target.y1, bbox.y1)
  target.x2 = Math.max(target.x2, bbox.x2)
  target.y2 = Math.max(target.y2, bbox.y2)
  return target
}

function formatSuperluminalGroupLabel(rawKey) {
  const text = normText(rawKey)
  if (!text) return "Unknown"
  const lower = text.toLowerCase()
  if (lower === "heavy") return "Heavy Weapons"
  if (lower === "phaser") return "Phasers"
  if (lower === "hitandrun") return "Hit and Run"
  if (lower === "shields") return "Shields"
  return text
}

function getSuperluminalSquareLabel(sectionKey, entry, groupLabel) {
  const entryLabel = normText(entry?.type || entry?.name || entry?.label)
  if (entryLabel) return entryLabel
  return groupLabel || formatSuperluminalGroupLabel(sectionKey)
}

function getSuperluminalShipName(rawDoc, fallbackName) {
  const shipName = normText(rawDoc?.shipName)
  if (shipName) return shipName
  const empire = normText(rawDoc?.shipData?.empire)
  const type = normText(rawDoc?.shipData?.type)
  const combined = [empire, type].filter(Boolean).join(" ")
  return combined || normText(fallbackName) || null
}

function buildVeilDocFromSuperluminal(rawDoc, fallbackName) {
  const ssd = rawDoc?.ssd
  if (!ssd || typeof ssd !== "object" || Array.isArray(ssd)) return rawDoc

  const groups = []
  const squares = []
  let nextGroupId = 1
  let nextSquareId = 0

  for (const [sectionKey, value] of Object.entries(ssd)) {
    if (!Array.isArray(value) || value.length === 0) continue

    const groupLabel = formatSuperluminalGroupLabel(sectionKey)
    const sectionLower = normText(sectionKey).toLowerCase()
    const group = {
      id: nextGroupId++,
      name: groupLabel,
      label: groupLabel,
      count: 0,
      bbox: null,
      center: null
    }

    for (let i = 0; i < value.length; i++) {
      const entry = value[i]
      const bbox = parseSuperluminalPosToBbox(entry?.pos)
      if (!bbox) continue

      const label = getSuperluminalSquareLabel(sectionKey, entry, groupLabel)
      const square = {
        id: nextSquareId++,
        groupId: group.id,
        label,
        name: label,
        points: pointsFromBbox(bbox),
        bbox,
        center: {
          x: (bbox.x1 + bbox.x2) / 2,
          y: (bbox.y1 + bbox.y2) / 2
        },
        sideLengthPx: Math.max(1, Math.min(Math.abs(bbox.x2 - bbox.x1), Math.abs(bbox.y2 - bbox.y1)))
      }

      const designation = normText(entry?.designation)
      if (designation) {
        square.designation = designation
        square.heavyLetter = designation
      }

      const arc = normText(entry?.arc)
      if (arc) square.arc = arc
      if (sectionLower === "heavy" || isKnownHeavyWeaponLabel(label)) {
        square.additionalLabel = "heavy Weapons"
      }

      squares.push(square)
      group.count += 1
      group.bbox = mergeBbox(group.bbox, bbox)
    }

    if (group.count > 0 && group.bbox) {
      group.center = {
        x: (group.bbox.x1 + group.bbox.x2) / 2,
        y: (group.bbox.y1 + group.bbox.y2) / 2
      }
      groups.push(group)
    }
  }

  const shipName = getSuperluminalShipName(rawDoc, fallbackName)
  return {
    shipName,
    shipData: rawDoc?.shipData && typeof rawDoc.shipData === "object" ? rawDoc.shipData : undefined,
    groups,
    squares
  }
}

function normalizeLoadedShipDoc(rawDoc, fallbackName) {
  if (Array.isArray(rawDoc?.squares) && rawDoc.squares.length > 0) return rawDoc
  const hasSuperluminalSsd = rawDoc?.ssd && typeof rawDoc.ssd === "object" && !Array.isArray(rawDoc.ssd)
  if (!hasSuperluminalSsd) return rawDoc
  return buildVeilDocFromSuperluminal(rawDoc, fallbackName)
}

function applyLoadedDatasetToTab(tab, loaded, doc) {
  if (!tab) return
  if (tab.doc?.squares) {
    cleanupSquareTimers(tab.doc.squares)
  }
  tab.doc = doc
  tab.jsonPath = loaded?.jsonPath || null
  tab.imageDataUrl = loaded?.imageDataUrl || null
  tab.imageObj = null
  tab.selected = null
  tab.batteryAvailBase = null
  tab.heavyLabelSet = heavyLabelSetCache instanceof Set ? new Set(heavyLabelSetCache) : new Set()
  resetTabView(tab)
}

/* -----------------------------
   Image caching
----------------------------- */
function ensureTabImageLoaded(tab) {
  if (!tab || !tab.imageDataUrl) return Promise.resolve(false)

  if (tab.imageObj && tab.imageObj._src === tab.imageDataUrl) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      img._src = tab.imageDataUrl
      tab.imageObj = img
      resolve(true)
    }
    img.onerror = () => resolve(false)
    img.src = tab.imageDataUrl
  })
}


/* -----------------------------
   Canvas
----------------------------- */
function fitImageToCanvas(imgW, imgH, canvasW, canvasH) {
  const scale = Math.min(canvasW / imgW, canvasH / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const ox = (canvasW - drawW) / 2
  const oy = (canvasH - drawH) / 2
  return { scale, ox, oy }
}

function resetTabView(tab) {
  if (!tab) return
  tab.view = {
    scale: 1,
    ox: 0,
    oy: 0,
    manualDx: 0,
    manualDy: 0,
    canvasW: 0,
    canvasH: 0,
    initialized: false
  }
}

function syncTabViewToCanvas(tab, canvasW, canvasH) {
  if (!tab || !tab.imageObj) return null

  const width = Math.max(1, Number(canvasW) || 0)
  const height = Math.max(1, Number(canvasH) || 0)
  const needsRefit =
    !tab.view ||
    !tab.view.initialized ||
    tab.view.canvasW !== width ||
    tab.view.canvasH !== height

  if (needsRefit) {
    const fit = fitImageToCanvas(tab.imageObj.width, tab.imageObj.height, width, height)
    const manualDx = Number(tab.view?.manualDx) || 0
    const manualDy = Number(tab.view?.manualDy) || 0
    tab.view = {
      scale: fit.scale,
      ox: fit.ox + manualDx,
      oy: fit.oy + manualDy,
      manualDx,
      manualDy,
      canvasW: width,
      canvasH: height,
      initialized: true
    }
  }

  return tab.view
}

function renderCanvas() {
  const tab = getActiveTab()
  const canvas = document.getElementById("canvas")
  const ctx = canvas.getContext("2d")

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(rect.width * dpr)
  canvas.height = Math.floor(rect.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.clearRect(0, 0, rect.width, rect.height)

  if (!tab || !tab.doc || !tab.imageDataUrl) {
    return
  }

  if (!tab.imageObj || tab.imageObj._src !== tab.imageDataUrl) {
    ensureTabImageLoaded(tab).then((ok) => {
      if (!ok) return
      renderCanvas()
    })
    return
  }

  const img = tab.imageObj
  const view = syncTabViewToCanvas(tab, Math.round(rect.width), Math.round(rect.height))
  if (!view) return

  ctx.drawImage(img, view.ox, view.oy, img.width * view.scale, img.height * view.scale)

  drawDamagedFill(ctx, tab, view)
  drawSystemLines(ctx, tab, view)
  drawRefitSquares(ctx, tab, view)
  drawDamagedOutlines(ctx, tab, view)
  drawFiredSquares(ctx, tab, view)

  const hideOverlays = tab.uiState === "loadShip"
  if (!hideOverlays) {
    drawGroups(ctx, tab, view)
    drawSquares(ctx, tab, view)
    drawSelection(ctx, tab, view)
  }
}

function drawGroups(ctx, tab, fit) {
  const groups = tab.doc.groups || []
  ctx.save()
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#ffd166"

  for (const g of groups) {
    if (!g.bbox) continue
    const x = fit.ox + g.bbox.x1 * fit.scale
    const y = fit.oy + g.bbox.y1 * fit.scale
    const w = (g.bbox.x2 - g.bbox.x1) * fit.scale
    const h = (g.bbox.y2 - g.bbox.y1) * fit.scale
    ctx.strokeRect(x, y, w, h)
  }

  ctx.restore()
}

function drawSquares(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.9

  for (const s of squares) {
    const isUngrouped = s.groupId === null
    ctx.strokeStyle = isUngrouped ? "#8ecae6" : "#90ee90"

    const pts = s.points || []
    if (pts.length < 4) continue

    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}

function drawDamagedFill(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = "#d70000ff"

  for (const s of squares) {
    if (!s.damaged) continue
    const pts = s.points || []
    if (pts.length < 4) continue

    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

function drawRefitSquares(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = "#000"
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 1.5

  for (const s of squares) {
    if (!s.refitRemoved) continue
    const pts = s.points || []
    if (pts.length < 4) continue

    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

function drawSystemLines(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.strokeStyle = "#2de37f"
  ctx.lineWidth = 2.5

  for (const s of squares) {
    const name = getSquareDisplayName(s).toLowerCase()
    const isPhaserG = name.includes("phaser g")
    const phaserCount = Math.max(0, Math.min(4, Number(s.phaserGCount) || 0))

    if (isPhaserG && phaserCount > 0) {
      let outline = s.points || []
      if (outline.length < 4 && s.bbox) {
        const b = s.bbox
        outline = [
          [b.x1, b.y1],
          [b.x2, b.y1],
          [b.x2, b.y2],
          [b.x1, b.y2]
        ]
      }
      if (outline.length >= 4) {
        ctx.beginPath()
        for (let i = 0; i < phaserCount; i++) {
          const a = outline[i]
          const b = outline[(i + 1) % outline.length]
          const ax = fit.ox + a[0] * fit.scale
          const ay = fit.oy + a[1] * fit.scale
          const bx = fit.ox + b[0] * fit.scale
          const by = fit.oy + b[1] * fit.scale
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
        }
        ctx.stroke()
        continue
      }
    }

    if (!s.systemDeployed) continue
    const pts = s.points || []
    if (pts.length >= 4) {
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const px = fit.ox + pts[i][0] * fit.scale
        const py = fit.oy + pts[i][1] * fit.scale
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
      continue
    }

    const b = s.bbox
    if (!b) continue

    const x = fit.ox + b.x1 * fit.scale
    const y = fit.oy + b.y1 * fit.scale
    const w = (b.x2 - b.x1) * fit.scale
    const h = (b.y2 - b.y1) * fit.scale

    ctx.strokeRect(x, y, w, h)
  }

  ctx.restore()
}

function drawDamagedOutlines(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#b83232"
  ctx.lineWidth = 1.5

  for (const s of squares) {
    if (!s.damaged) continue
    if (s.refitRemoved) continue
    if (s.fired) continue
    const pts = s.points || []
    if (pts.length < 4) continue

    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}

function drawFiredSquares(ctx, tab, fit) {
  const squares = tab.doc.squares || []
  ctx.save()
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#66b3ff"

  for (const s of squares) {
    if (!s.fired) continue
    const pts = s.points || []
    if (pts.length < 4) continue

    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}

function drawSelection(ctx, tab, fit) {
  if (!tab.selected) return

  ctx.save()
  ctx.lineWidth = 3
  ctx.globalAlpha = 1
  ctx.strokeStyle = "#ff4d6d"

  if (tab.selected.kind === "square") {
    const s = (tab.doc.squares || []).find(x => x.id === tab.selected.id)
    if (!s) return
    const pts = s.points || []
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const px = fit.ox + pts[i][0] * fit.scale
      const py = fit.oy + pts[i][1] * fit.scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  } else {
    const g = (tab.doc.groups || []).find(x => x.id === tab.selected.id)
    if (!g || !g.bbox) return
    const x = fit.ox + g.bbox.x1 * fit.scale
    const y = fit.oy + g.bbox.y1 * fit.scale
    const w = (g.bbox.x2 - g.bbox.x1) * fit.scale
    const h = (g.bbox.y2 - g.bbox.y1) * fit.scale
    ctx.strokeRect(x, y, w, h)
  }

  ctx.restore()
}

function canvasToImagePoint(tab, clientX, clientY) {
  const canvas = document.getElementById("canvas")
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  const ix = (x - tab.view.ox) / tab.view.scale
  const iy = (y - tab.view.oy) / tab.view.scale
  return { ix, iy }
}

function hitTestSquare(tab, ix, iy) {
  for (const s of tab.doc.squares || []) {
    const b = s.bbox
    if (!b) continue
    if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return s
  }
  return null
}

function hitTestGroup(tab, ix, iy) {
  for (const g of tab.doc.groups || []) {
    const b = g.bbox
    if (!b) continue
    if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return g
  }
  return null
}

/* -----------------------------
   Energy allocation table
----------------------------- */
function parseEnergyTemplate(text) {
  const rows = []
  const lines = String(text || "").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      rows.push({ type: "gap" })
      continue
    }
    const locked = trimmed.includes("*")
    const label = trimmed.replace(/\*/g, "").trim()
    if (!label) {
      rows.push({ type: "gap" })
      continue
    }
    rows.push({ type: "row", label, locked })
  }
  return rows
}

function ensureEnergyTemplate() {
  if (energyTemplate) return energyTemplate
  energyTemplate = parseEnergyTemplate(ENERGY_TEMPLATE_LINES.join("\n"))
  return energyTemplate
}

function computeWarpCounts(tab) {
  const squares = tab?.doc?.squares || []
  const counts = { left: 0, right: 0, center: 0, total: 0 }
  for (const s of squares) {
    if (isSquareRemovedOrDamaged(s)) continue
    const name = getSquareDisplayName(s).toLowerCase()
    if (!name) continue
    if (name === "left warp") counts.left += 1
    else if (name === "right warp") counts.right += 1
    else if (name === "center warp") counts.center += 1
  }
  counts.total = counts.left + counts.right + counts.center
  return counts
}

function computePowerStats(tab) {
  const squares = tab?.doc?.squares || []
  const warp = computeWarpCounts(tab)
  let impulse = 0
  let reactor = 0
  let battery = 0

  for (const s of squares) {
    if (isSquareRemovedOrDamaged(s)) continue
    const name = getSquareDisplayName(s).toLowerCase()
    if (!name) continue
    if (name === "impulse" || name.startsWith("impulse ")) impulse += 1
    if (name === "apr" || name === "a.p.r" || name.startsWith("apr ")) reactor += 1
    if (name === "battery" || name.startsWith("battery ")) battery += 1
  }

  return {
    warp: warp.total,
    impulse,
    reactor,
    battery,
    total: warp.total + impulse + reactor,
    warpDetail: warp
  }
}

function computeMaxPhaserCaps(tab) {
  const squares = tab?.doc?.squares || []
  let total = 0
  for (const s of squares) {
    if (isSquareRemovedOrDamaged(s)) continue
    const name = getSquareDisplayName(s).toLowerCase()
    if (!name.startsWith("phaser")) continue
    if (name.includes("phaser 1") || name.includes("phaser 2") || name.includes("phaser g") || name.includes("phaser 4")) {
      total += 1
    } else if (name.includes("phaser 3")) {
      total += 0.5
    }
  }
  return total
}

// Compute "Phaser capacitors used" based on deployed phasers.
function recomputePhaserCapsUsed(tab) {
  if (!tab || !tab.doc) return 0
  let total = 0
  const squares = tab.doc.squares || []
  for (const s of squares) {
    if (isSquareRemovedOrDamaged(s)) continue
    const name = getSquareDisplayName(s).toLowerCase()
    if (!name.startsWith("phaser")) continue
    if (name.includes("phaser g")) {
      const count = Number(s.phaserGCount) || 0
      if (count > 0) {
        const use = 0.25 * count
        total += use
        s.phaserCapUsage = use
      }
      continue
    }
    if (!s.systemDeployed) continue
    if (name.includes("phaser 3")) {
      total += 0.5
      if (s.phaserCapUsage !== 0.5) s.phaserCapUsage = 0.5
      continue
    }
    if (name.includes("phaser 4")) {
      const use = typeof s.phaserCapUsage === "number" ? s.phaserCapUsage : 2
      total += use
      continue
    }
    if (name.includes("phaser 1") || name.includes("phaser 2")) {
      const use = typeof s.phaserCapUsage === "number" ? s.phaserCapUsage : 1
      total += use
      continue
    }
  }
  const rounded = Math.round(total * 100) / 100
  tab.energyValues["Phaser capacitors used"] = rounded
  return rounded
}

function getShieldNumbers(tab) {
  const nums = new Set()
  const regex = /sh(?:ie|ei)ld\s*#?\s*(\d+)/i // matches shield/sheild

  for (const s of tab?.doc?.squares || []) {
    const name = getSquareDisplayName(s).toLowerCase()
    const m = regex.exec(name)
    if (m && m[1]) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n)) nums.add(n)
    }
  }

  for (const key of Object.keys(tab?.energyValues || {})) {
    const m = regex.exec(key)
    if (m && m[1]) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n)) nums.add(n)
    }
  }

  if (tab?.customShieldLabels instanceof Set) {
    for (const n of tab.customShieldLabels) {
      if (Number.isFinite(n)) nums.add(n)
    }
  }
  return Array.from(nums).sort((a, b) => a - b)
}

function computeBatteryDischarged(tab) {
  if (!tab || !tab.doc) return 0
  let total = 0
  for (const s of tab.doc.squares || []) {
    if (isSquareRemovedOrDamaged(s)) continue
    if (!s.systemDeployed) continue
    if (isBatterySquare(s)) total += 1
  }
  return total
}

function ensureBatteryBaseAvailable(tab, powerStats) {
  if (!tab) return 0
  if (Number.isFinite(tab.batteryAvailBase)) return tab.batteryAvailBase

  const availKey =
    findEnergyKey(tab.energyValues, "battery power available") || "BATTERY POWER AVAILABLE"
  const rechargeKey =
    findEnergyKey(tab.energyValues, "battery power recharged") || "BATTERY POWER RECHARGED"

  const savedAvail = Number(tab.energyValues?.[availKey])
  const recharge = Number(tab.energyValues?.[rechargeKey]) || 0
  const discharge = computeBatteryDischarged(tab)

  let base
  if (Number.isFinite(savedAvail)) {
    // Back-calc the base so discharge is applied after caps.
    base = Math.min(powerStats.battery, savedAvail + discharge) - recharge
  } else {
    base = powerStats.battery
  }

  base = Math.max(0, Math.min(powerStats.battery, base))
  tab.batteryAvailBase = base
  return base
}

function computeBatteryAvailable(tab, powerStats) {
  if (!tab) return 0
  const rechargeKey =
    findEnergyKey(tab.energyValues, "battery power recharged") || "BATTERY POWER RECHARGED"
  const recharge = Number(tab.energyValues?.[rechargeKey]) || 0
  const discharge = computeBatteryDischarged(tab)
  const base = ensureBatteryBaseAvailable(tab, powerStats)
  const beforeDischarge = Math.min(powerStats.battery, base + recharge)
  const current = Math.max(0, beforeDischarge - discharge)
  return current
}

// Refresh energy allocation UI/calcs after marker changes, if allocation is unlocked.
function refreshEnergyAfterMarkerChange(tab) {
  if (!tab || tab.turnLocked) return
  recomputePhaserCapsUsed(tab)
  renderEnergyTable()
}

function computeCurrentPhaserCharge(tab, { updateValues = true } = {}) {
  if (!tab) return 0
  if (!tab.energyValues) tab.energyValues = {}

  const remainingKey =
    findEnergyKey(tab.energyValues, "held phaser capacitors") ||
    findEnergyKey(tab.energyValues, "phaser capacitors remaining")
  const chargeKey = findEnergyKey(tab.energyValues, "charge phaser capacitors")
  const usedKey = findEnergyKey(tab.energyValues, "phaser capacitors used")

  const remaining = Number(tab.energyValues[remainingKey])
  const charge = Number(tab.energyValues[chargeKey])
  const used = Number(tab.energyValues[usedKey])
  const maxCaps = computeMaxPhaserCaps(tab)

  const safeRemaining = Number.isFinite(remaining) ? remaining : 0
  const safeCharge = Number.isFinite(charge) ? charge : 0
  const safeUsed = Number.isFinite(used) ? used : 0

  let val = safeRemaining + safeCharge - safeUsed
  if (!Number.isFinite(val)) val = 0
  val = Math.max(0, Math.min(val, maxCaps))

  if (updateValues) {
    const label =
      findEnergyKey(tab.energyValues, "current phaser charge") || "Current phaser charge"
    tab.energyValues[label] = val
  }
  return val
}

function updateCurrentPhaserChargeDisplay(tab) {
  const table = document.getElementById("energyTable")
  if (!table) return
  const val = computeCurrentPhaserCharge(tab)
  const labels = table.querySelectorAll(".energyLabel")
  for (const lbl of labels) {
    if (lbl.textContent.trim().toLowerCase() === "current phaser charge") {
      const wrap = lbl.nextElementSibling
      if (!wrap) break
      const input = wrap.querySelector("input.energyInput")
      if (input) input.value = String(val)
      break
    }
  }
}

function formatHeavyEnergyLabel(square) {
  const name = getSquareDisplayName(square) || "Heavy Weapon"
  const words = name.trim().split(/\s+/).filter(Boolean)
  const firstTwo = words.slice(0, 2).join(" ") || name
  const letter = getSquareWeaponDesignationDisplay(square)
  return letter ? `${firstTwo}, ${letter}` : firstTwo
}

function setLooseDecimalInputMode(input) {
  if (!input) return
  input.type = "text"
  input.inputMode = "decimal"
  input.autocomplete = "off"
  input.spellcheck = false
}

function normalizeLooseDecimalText(raw) {
  const text = String(raw ?? "")
  let cleaned = text.replace(/[^0-9.]/g, "")
  const dotIndex = cleaned.indexOf(".")
  if (dotIndex >= 0) {
    cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, "")
  }
  return cleaned
}

function readLooseNonNegativeDecimal(input) {
  const normalized = normalizeLooseDecimalText(input?.value)
  if (input && input.value !== normalized) {
    input.value = normalized
  }
  if (!normalized || normalized === ".") return 0
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

// Parse a raw fraction string into numeric parts (used by Movement Cost).
// Returns { raw, num, numPart, denPart } where raw is normalized ("a/b").
function parseFractionParts(raw) {
  const t = String(raw ?? "").trim()
  if (!t) return { raw: "0/1", num: 0, numPart: "0", denPart: "1" }

  if (t.includes("/")) {
    const [a, b] = t.split("/")
    const na = Number(a)
    const nb = Number(b)
    const safeA = Number.isFinite(na) ? Math.max(0, na) : 0
    const safeB = Number.isFinite(nb) && nb > 0 ? nb : 1
    return {
      raw: `${safeA}/${safeB}`,
      num: safeA / safeB,
      numPart: String(safeA),
      denPart: String(safeB)
    }
  }

  const n = Number(t)
  if (Number.isFinite(n)) {
    const safe = Math.max(0, n)
    return { raw: `${safe}/1`, num: safe, numPart: String(safe), denPart: "1" }
  }

  return { raw: "0/1", num: 0, numPart: "0", denPart: "1" }
}

function renderEnergyTable() {
  const table = document.getElementById("energyTable")
  const tab = getActiveTab()
  if (!table) return

  if (!tab || tab.uiState !== "loadShip" || !tab.doc) {
    table.innerHTML = ""
    return
  }

  if (!tab || !tab.doc) {
    table.innerHTML = ""
    return
  }

  const tmpl = ensureEnergyTemplate()
  if (!tmpl) return
  table.innerHTML = ""
  if (tmpl.length === 0) {
    const msg = document.createElement("div")
    msg.className = "hint"
    msg.style.textAlign = "center"
    msg.textContent = "EnergyAllocation has no entries."
    table.appendChild(msg)
    return
  }

  if (!tab.energyValues) tab.energyValues = {}
  if (!tab.energyDisplay) tab.energyDisplay = {}

  const locked = !!tab.turnLocked
  const resetMode = !!tab.energyReset

  const autoLabelsSet = new Set([
    "warp engine power",
    "total warp",
    "impulse engine power",
    "reactor power",
    "total available power",
    "total power available",
    "total power",
    "total power used",
    "movement cost",
    "speed",
    "phaser capacitors used",
    "phasers",
    "held phaser capacitors",
    "current phaser charge",
    "max phaser capacitors",
    "battery power available",
    "battery power discharged",
    "total batteries"
  ])

  let totalUsedInput = null
  let totalAvailableVal = 0
  let speedInput = null
  const markComputerFilled = (el) => {
    if (el) el.classList.add("energyAutoField")
  }

  const getEnergyVal = (labelLower) => {
    for (const [k, v] of Object.entries(tab.energyValues || {})) {
      if (k.toLowerCase() === labelLower) return v
    }
    return undefined
  }

  const updateSpeedInput = () => {
    if (locked) return
    if (!speedInput) return
    const energyRaw = getEnergyVal("energy for movement")
    const costRaw = getEnergyVal("movement cost")
    const energy = Number.isFinite(Number(energyRaw)) ? Number(energyRaw) : 0
    const cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0
    const speedVal = cost > 0 ? energy / cost : 0
    const rounded = Math.round(speedVal) // nearest integer
    tab.energyValues["Speed"] = rounded
    speedInput.value = String(Number.isFinite(rounded) ? rounded : 0)
  }

  const updateTotalUsedInput = () => {
    if (locked) {
      if (totalUsedInput) {
        const stored = Number(tab.energyValues["Total power used"] ?? 0)
        totalUsedInput.value = String(Number.isFinite(stored) ? stored : 0)
        totalUsedInput.classList.remove("powerOk", "powerWarn", "powerOver")
        if (stored > totalAvailableVal) totalUsedInput.classList.add("powerOver")
        else if (stored < totalAvailableVal) totalUsedInput.classList.add("powerWarn")
        else totalUsedInput.classList.add("powerOk")
      }
      return
    }
    if (!totalUsedInput) return
    const totalUsed = Object.entries(tab.energyValues || {}).reduce((acc, [k, v]) => {
      const kl = k.toLowerCase()
      if (autoLabelsSet.has(kl)) return acc
      const n = Number(v)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
    if (!locked) tab.energyValues["Total power used"] = totalUsed
    totalUsedInput.value = String(totalUsed)

    // Apply status colors
    totalUsedInput.classList.remove("powerOk", "powerWarn", "powerOver")
    if (totalUsed > totalAvailableVal) totalUsedInput.classList.add("powerOver")
    else if (totalUsed < totalAvailableVal) totalUsedInput.classList.add("powerWarn")
    else totalUsedInput.classList.add("powerOk")
  }

  for (const row of tmpl) {
    if (row.type === "gap") {
      const gap = document.createElement("div")
      gap.className = "energyGap"
      table.appendChild(gap)
      continue
    }

    const labelLower = row.label.toLowerCase()
    const powerStats = computePowerStats(tab)
    const isEnergyForMovement = labelLower === "energy for movement"

    const label = document.createElement("div")
    label.className = "energyLabel"
    label.textContent = row.label

    const inputWrap = document.createElement("div")
    inputWrap.className = "energyInputWrap"

    const isWarpEnginePower =
      labelLower === "warp engine power" || labelLower === "total warp" || labelLower.includes("warp engine")
    const isImpulsePower = labelLower === "impulse engine power" || labelLower.includes("impulse")
    const isReactorPower = labelLower === "reactor power" || labelLower.includes("apr")
    const isBatteryAvailable = labelLower === "battery power available"
    const isBatteryDischarged = labelLower === "battery power discharged"
    const isTotalAvailable =
      labelLower === "total available power" ||
      labelLower === "total power available" ||
      labelLower === "total power" ||
      labelLower.includes("total available") ||
      labelLower.includes("total power available")
    const isTotalUsed = labelLower === "total power used"
    const isTotalBatteries = labelLower === "total batteries"
    const isPhaserHeader = labelLower === "phasers"
    const isMaxPhaserCaps = labelLower === "max phaser capacitors" || labelLower.includes("max phaser")
    const isPhaserCapsUsed = labelLower === "phaser capacitors used" || labelLower.includes("phaser capacitors used")
    const isPhaserCapsRemaining = labelLower === "held phaser capacitors"
    const isPhaserCharge = labelLower === "current phaser charge"
    const isMovementCost = labelLower === "movement cost"
    const isHeavyWeaponsRow = labelLower === "heavy weapons"
    const isSpecificReinforcement = labelLower === "specific reinforcement"
    const isComputerFilledRow = row.locked || isTotalBatteries

    if (isTotalAvailable) {
      label.classList.add("energyStickyTotal")
      inputWrap.classList.add("energyStickyTotal")
    }

    if (isPhaserHeader) {
      const header = document.createElement("div")
      header.className = "energyLabel"
      header.textContent = "Phasers"
      header.style.gridColumn = "1 / span 2"
      table.appendChild(header)
      continue
    }

    if (isHeavyWeaponsRow) {
      const heavySquares = (tab.doc?.squares || []).filter(s => {
        const n = getSquareDisplayName(s).toLowerCase()
        if (isSquareRemovedOrDamaged(s)) return false
        if (isOptionMountSquare(s)) return optionMountNeedsPowerRecord(s)
        const isWebDevice = n === "web device" || n.startsWith("web device ")
        return s.additionalLabel === "heavy Weapons" || isKnownHeavyWeaponLabel(n, tab.heavyLabelSet) || isWebDevice
      })

      // Sort heavy weapons by their letter designation (A, B, AA, etc.)
      const sortedHeavySquares = heavySquares.slice().sort((a, b) => {
        const aLetter = (isOptionMountSquare(a) ? getOptionMountLetter(a) : getSquareHeavyLetter(a) || getSquareWeaponDesignation(a)).toUpperCase()
        const bLetter = (isOptionMountSquare(b) ? getOptionMountLetter(b) : getSquareHeavyLetter(b) || getSquareWeaponDesignation(b)).toUpperCase()
        if (aLetter && bLetter) {
          const cmp = aLetter.localeCompare(bLetter)
          if (cmp !== 0) return cmp
        } else if (aLetter || bLetter) {
          return aLetter ? -1 : 1
        }
        // Fallback to label ordering if letters are missing
        return formatHeavyEnergyLabel(a).toLowerCase().localeCompare(
          formatHeavyEnergyLabel(b).toLowerCase()
        )
      })

      // Section header spanning both columns
      const header = document.createElement("div")
      header.className = "energyLabel"
      header.textContent = "Heavy Weapons"
      header.style.gridColumn = "1 / span 2"
      table.appendChild(header)

      if (sortedHeavySquares.length === 0) {
        const placeholderLabel = document.createElement("div")
        placeholderLabel.className = "energyLabel"
        placeholderLabel.textContent = "None"
        const placeholderInputWrap = document.createElement("div")
        placeholderInputWrap.className = "energyInputWrap"
        const placeholderInput = document.createElement("input")
        placeholderInput.type = "number"
        placeholderInput.className = "energyInput"
        placeholderInput.value = "0"
        placeholderInput.disabled = true
        placeholderInput.placeholder = "No heavy weapons"
        placeholderInputWrap.appendChild(placeholderInput)
        table.appendChild(placeholderLabel)
        table.appendChild(placeholderInputWrap)
        continue
      }

      for (const hs of sortedHeavySquares) {
        const customLabel = isOptionMountSquare(hs)
          ? formatOptionMountEnergyLabel(hs)
          : formatHeavyEnergyLabel(hs)

        const hl = document.createElement("div")
        hl.className = "energyLabel"
        if (isOptionMountSquare(hs)) {
          appendOptionMountEnergyLabelContent(hl, hs)
        } else {
          hl.textContent = customLabel
        }
        table.appendChild(hl)

        const hwWrap = document.createElement("div")
        hwWrap.className = "energyInputWrap"
        const hwInput = document.createElement("input")
        hwInput.className = "energyInput"
        setLooseDecimalInputMode(hwInput)

        const storedVal = tab.energyValues[customLabel]
        const val = Number(storedVal)
        const hasVal = storedVal !== undefined && Number.isFinite(val)
        if (!locked && hasVal) tab.energyValues[customLabel] = val
        hwInput.value = !locked && resetMode && !hasVal ? "" : String(hasVal ? val : 0)
        hwInput.disabled = locked

        if (!locked) {
          hwInput.oninput = () => {
            tab.energyReset = false
            tab.energyValues[customLabel] = readLooseNonNegativeDecimal(hwInput)
            updateTotalUsedInput()
          }
        }

        hwWrap.appendChild(hwInput)
        table.appendChild(hwWrap)
      }

      continue
    }

    if (isSpecificReinforcement) {
      const header = document.createElement("div")
      header.className = "energyLabel"
      header.textContent = "Specific Reinforcement"
      header.style.gridColumn = "1 / span 2"
      table.appendChild(header)

      const shields = getShieldNumbers(tab)
      if (shields.length === 0) {
        const placeholderLabel = document.createElement("div")
        placeholderLabel.className = "energyLabel"
        placeholderLabel.textContent = "Shields"
        const placeholderInputWrap = document.createElement("div")
        placeholderInputWrap.className = "energyInputWrap"
        const placeholderInput = document.createElement("input")
        placeholderInput.type = "number"
        placeholderInput.className = "energyInput"
        placeholderInput.disabled = true
        placeholderInput.placeholder = "No shields found"
        placeholderInputWrap.appendChild(placeholderInput)
        table.appendChild(placeholderLabel)
        table.appendChild(placeholderInputWrap)
        continue
      }

      for (const n of shields) {
        const shieldLabel = `Shield #${n}`
        const lbl = document.createElement("div")
        lbl.className = "energyLabel"
        lbl.textContent = shieldLabel
        table.appendChild(lbl)

        const wrap = document.createElement("div")
        wrap.className = "energyInputWrap"
        const inp = document.createElement("input")
        inp.className = "energyInput"
        setLooseDecimalInputMode(inp)
        const storedVal = tab.energyValues[shieldLabel]
        let val = Number(storedVal)
        const hasVal = storedVal !== undefined && Number.isFinite(val)
        inp.value = !locked && resetMode && !hasVal ? "" : String(hasVal ? val : 0)
        inp.disabled = locked
        if (!locked) {
          inp.oninput = () => {
            tab.energyReset = false
            tab.energyValues[shieldLabel] = readLooseNonNegativeDecimal(inp)
            updateTotalUsedInput()
          }
        }
        wrap.appendChild(inp)
        table.appendChild(wrap)
      }

      continue
    }

    table.appendChild(label)

    if (labelLower === "speed") {
      const input = document.createElement("input")
      input.type = "number"
      input.step = "0.01"
      input.className = "energyInput"
      input.disabled = true
      input.placeholder = "Auto"
      input.setAttribute("aria-disabled", "true")
      if (isComputerFilledRow) markComputerFilled(input)
      speedInput = input
      const storedSpeed = tab.energyValues["Speed"]
      if (storedSpeed !== undefined) input.value = String(storedSpeed)
      updateSpeedInput()
      inputWrap.appendChild(input)
      table.appendChild(inputWrap)
      continue
    }

    if (isPhaserCapsUsed) {
      const input = document.createElement("input")
      input.type = "number"
      input.step = "0.5"
      input.className = "energyInput"
      input.disabled = true
      input.placeholder = "Auto"
      input.setAttribute("aria-disabled", "true")
      if (isComputerFilledRow) markComputerFilled(input)
      const total = recomputePhaserCapsUsed(tab)
      const showBlank = tab.phaserCapsCleared && total === 0 && !locked
      if (total > 0) tab.phaserCapsCleared = false
      input.value = showBlank ? "" : String(Number.isFinite(total) ? total : 0)
      input.title = "Sum of deployed Phaser 1/2/3 usage"
      inputWrap.appendChild(input)
      table.appendChild(inputWrap)
      continue
    }

    if (isPhaserCharge) {
      const val = computeCurrentPhaserCharge(tab, { updateValues: !locked })

      const input = document.createElement("input")
      input.type = "number"
      input.className = "energyInput"
      input.disabled = true
      input.placeholder = "Auto"
      input.setAttribute("aria-disabled", "true")
      if (isComputerFilledRow) markComputerFilled(input)
      input.value = String(val)
      input.title = "(Remaining + Charge) - Used, capped at Max"
      inputWrap.appendChild(input)
      table.appendChild(inputWrap)
      continue
    }

    if (isMovementCost) {
      const storedRaw = tab.energyDisplay[row.label]
      const storedVal = tab.energyValues[row.label]
      const parsed = parseFractionParts(storedRaw ?? storedVal ?? "1/1")
      if (!locked) {
        tab.energyValues[row.label] = parsed.num
        tab.energyDisplay[row.label] = parsed.raw
      }

      const fracWrap = document.createElement("div")
      fracWrap.className = "fractionWrap"

      const numInput = document.createElement("input")
      numInput.className = "energyInput fractionInput"
      setLooseDecimalInputMode(numInput)
      numInput.value = parsed.numPart
      numInput.disabled = locked

      const slash = document.createElement("span")
      slash.className = "fractionSlash"
      slash.textContent = "/"

      const denInput = document.createElement("input")
      denInput.className = "energyInput fractionInput"
      setLooseDecimalInputMode(denInput)
      denInput.value = parsed.denPart
      denInput.disabled = locked

      const applyFraction = () => {
        const nVal = readLooseNonNegativeDecimal(numInput)
        const dRaw = readLooseNonNegativeDecimal(denInput)
        const dVal = dRaw > 0 ? dRaw : 1
        const raw = `${nVal}/${dVal}`
        const next = parseFractionParts(raw)
        if (!locked) {
          tab.energyValues[row.label] = next.num
          tab.energyDisplay[row.label] = next.raw
          updateTotalUsedInput()
          updateSpeedInput()
        }
      }

      if (!locked) {
        numInput.oninput = applyFraction
        denInput.oninput = applyFraction
      }

      if (row.locked) {
        numInput.disabled = true
        denInput.disabled = true
        numInput.placeholder = "Locked"
        denInput.placeholder = "Locked"
      }

      fracWrap.appendChild(numInput)
      fracWrap.appendChild(slash)
      fracWrap.appendChild(denInput)
      inputWrap.appendChild(fracWrap)
      table.appendChild(inputWrap)
      continue
    }

    const input = document.createElement("input")
    input.className = "energyInput"
    setLooseDecimalInputMode(input)

    if (isWarpEnginePower) {
      const totalWarp = powerStats.warp
      const { left, right, center } = powerStats.warpDetail
      const val = locked ? (tab.energyValues[row.label] ?? totalWarp) : totalWarp
      if (!locked) tab.energyValues[row.label] = totalWarp
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = `Left Warp: ${left} | Right Warp: ${right} | Center Warp: ${center}`
    } else if (isImpulsePower) {
      const val = locked ? (tab.energyValues[row.label] ?? powerStats.impulse) : powerStats.impulse
      if (!locked) tab.energyValues[row.label] = powerStats.impulse
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Count of boxes labeled 'Impulse'"
    } else if (isReactorPower) {
      const val = locked ? (tab.energyValues[row.label] ?? powerStats.reactor) : powerStats.reactor
      if (!locked) tab.energyValues[row.label] = powerStats.reactor
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Count of boxes labeled 'APR'"
    } else if (isBatteryAvailable) {
      const val = computeBatteryAvailable(tab, powerStats)
      if (!locked) {
        const key = findEnergyKey(tab.energyValues, "battery power available") || row.label
        tab.energyValues[key] = val
      }
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Count of boxes labeled 'Battery' (or carried over from previous turn)"
    } else if (isTotalBatteries) {
      const val = powerStats.battery
      if (!locked) tab.energyValues[row.label] = val
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Total number of boxes labeled 'Battery'"
    } else if (isBatteryDischarged) {
      const val = computeBatteryDischarged(tab)
      if (!locked) tab.energyValues[row.label] = val
      input.value = String(val ?? 0)
      input.disabled = true
      input.setAttribute("aria-disabled", "true")
      input.placeholder = "Auto"
      input.title = "Program-controlled battery discharge"
    } else if (isTotalAvailable) {
      // Total available = warp + impulse + reactor (from computed counts)
      const totalVal = powerStats.total
      const val = locked ? (tab.energyValues[row.label] ?? totalVal) : totalVal
      if (!locked) tab.energyValues[row.label] = totalVal
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Warp + Impulse + Reactor power"
      totalAvailableVal = totalVal
    } else if (isTotalUsed) {
      if (!locked) tab.energyValues[row.label] = 0
      const stored = tab.energyValues[row.label]
      input.value = String(stored === undefined ? 0 : stored)
      input.disabled = true
      input.setAttribute("aria-disabled", "true")
      input.title = "Sum of user inputs (excludes Movement Cost and auto fields)"
      totalUsedInput = input
    } else if (isMaxPhaserCaps) {
      const caps = computeMaxPhaserCaps(tab)
      const val = locked ? (tab.energyValues[row.label] ?? caps) : caps
      if (!locked) {
        tab.energyValues[row.label] = caps
        syncPhaserRemainingWithMax(tab, caps)
      }
      input.value = String(val ?? 0)
      input.disabled = true
      input.title = "Auto-calculated from Phaser boxes (1/2 for Phaser 3)"
    } else {
      const storedVal = tab.energyValues[row.label]
      let val = Number(storedVal)
      const hasVal = storedVal !== undefined && Number.isFinite(val)
    if (isPhaserCapsRemaining) {
      const caps = computeMaxPhaserCaps(tab)
      const storedKey =
        findEnergyKey(tab.energyValues, "held phaser capacitors") ||
        findEnergyKey(tab.energyValues, "phaser capacitors remaining") ||
        row.label
      const storedValNorm = Number(tab.energyValues[storedKey])
      const hasStored = Number.isFinite(storedValNorm)
      val = hasStored ? storedValNorm : caps
      val = Math.min(val, caps)
      if (!locked) tab.energyValues[storedKey] = val
    }
    if (!locked && hasVal) tab.energyValues[row.label] = val
      input.value = !locked && resetMode && !hasVal ? "" : String(hasVal ? val : 0)
      input.disabled = locked || !!row.locked
    }

    const lockPlaceholder =
      !isBatteryDischarged &&
      (row.locked || isWarpEnginePower || isImpulsePower || isReactorPower || isTotalAvailable || isTotalUsed)
    if (isComputerFilledRow) markComputerFilled(input)
    input.placeholder = lockPlaceholder ? "Locked" : ""

    if (!locked) {
      input.oninput = () => {
        tab.energyReset = false
        tab.energyValues[row.label] = readLooseNonNegativeDecimal(input)
        if (isEnergyForMovement) updateSpeedInput()
        updateTotalUsedInput()
        if (labelLower === "charge phaser capacitors") {
          updateCurrentPhaserChargeDisplay(tab)
        }
      }
    }

    inputWrap.appendChild(input)
    table.appendChild(inputWrap)
  }

  updateTotalUsedInput()
  updateSpeedInput()
}

function renderCurrentProps() {
  const tab = getActiveTab()

  const energyPanel = document.getElementById("energyPanel")

  if (!tab || !tab.doc) {
    if (energyPanel) energyPanel.classList.add("hidden")
    return
  }

  const isLoadShip = tab.uiState === "loadShip"

  const turnControls = document.getElementById("turnControlsSection")
  if (energyPanel) {
    if (isLoadShip) {
      energyPanel.classList.remove("hidden")
      renderEnergyTable()
    } else {
      energyPanel.classList.add("hidden")
    }
  }
  if (turnControls) {
    if (isLoadShip) turnControls.classList.remove("hidden")
    else turnControls.classList.add("hidden")
  }

  updateTurnControlsUI()
}

async function handleLoadGame() {
  const tab = getActiveTab()
  if (!tab || !tab.doc || tab.uiState !== "loadShip") {
    alert("Load a ship before loading a saved game.")
    return
  }

  try {
    const picked = await window.api.pickGameFile()
    if (!picked) return
    if (!picked.ok) {
      alert(picked.error || "Failed to read saved game.")
      return
    }

    const applied = applySavedTurnToTab(tab, picked.save)
    if (!applied.ok) {
      alert(applied.error || "Could not apply saved game.")
      return
    }
    tab.gameSavePath = picked.path || null
    tab.uiState = "loadShip"
    if (picked.save?.shipName) tab.shipName = picked.save.shipName
    const fileName = baseNameFromPath(picked.path || "")
    if (fileName) tab.title = fileName.replace(/\.json$/i, "") || fileName

    // Only clear deployments when the save advanced the turn.
    if (applied.turn?.turnState?.advanceTurn !== false) {
      clearSystemDeploymentsForNewTurn(tab)
    }

    await applyHeavyLabelSetToTab(tab)

    tab.selected = null
    renderCanvas()
    renderCurrentProps()
    renderEnergyTable()
    updateTurnControlsUI()
    updateShipControlsVisibility()
    renderTabs()

    const loadedTurn = Number(applied.turn?.turnNumber)
    const niceTurn = Number.isFinite(loadedTurn) ? `Turn ${loadedTurn}` : "saved game"
    if (fileName) {
      console.log(`Loaded ${niceTurn} from ${fileName}`)
    }
  } catch (e) {
    alert(e?.message || "Failed to load saved game.")
  }
}

function getMoveChartStep(speed, impulse) {
  const safeSpeed = Math.max(0, Math.min(32, Number(speed) || 0))
  const safeImpulse = Math.max(1, Math.min(32, Number(impulse) || 1))
  const previous = Math.ceil(((safeImpulse - 1) * safeSpeed) / 32)
  const current = Math.ceil((safeImpulse * safeSpeed) / 32)
  if (current > previous) return String(current)
  return "–"
}

function buildMoveChartTable() {
  const table = document.createElement("table")
  table.className = "moveChartTable"

  const thead = document.createElement("thead")
  const headRow = document.createElement("tr")

  const corner = document.createElement("th")
  corner.className = "moveChartCorner"
  corner.textContent = "IMP"
  headRow.appendChild(corner)

  for (let speed = 32; speed >= 2; speed -= 1) {
    const th = document.createElement("th")
    th.className = "moveChartSpeed"
    th.textContent = String(speed)
    headRow.appendChild(th)
  }

  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement("tbody")
  for (let impulse = 1; impulse <= 32; impulse += 1) {
    const row = document.createElement("tr")

    const impCell = document.createElement("th")
    impCell.className = "moveChartImpulse"
    impCell.textContent = String(impulse)
    row.appendChild(impCell)

    for (let speed = 32; speed >= 2; speed -= 1) {
      const td = document.createElement("td")
      const step = getMoveChartStep(speed, impulse)
      td.className = step === "–" ? "moveChartDash" : "moveChartMove"
      td.textContent = step
      row.appendChild(td)
    }

    tbody.appendChild(row)
  }

  table.appendChild(tbody)
  return table
}

function getMoveChartStep(speed, impulse) {
  const safeSpeed = Math.max(0, Math.min(32, Number(speed) || 0))
  const safeImpulse = Math.max(1, Math.min(32, Number(impulse) || 1))
  const previous = Math.floor(((safeImpulse - 1) * safeSpeed) / 32)
  const current = Math.floor((safeImpulse * safeSpeed) / 32)
  if (current > previous) return String(current)
  return "-"
}

function normalizeMoveChartSpeeds(speeds) {
  const normalized = Array.isArray(speeds)
    ? speeds
      .map((speed) => Number(speed))
      .filter((speed) => Number.isFinite(speed) && speed >= 2 && speed <= 32)
    : []
  return Array.from(new Set(normalized)).sort((a, b) => b - a)
}

function formatMoveChartHighlightText(speeds) {
  const normalized = normalizeMoveChartSpeeds(speeds)
  if (normalized.length === 0) {
    return "Hardcoded 32-impulse reference chart. Click any speed header to toggle column highlights."
  }
  return `Hardcoded 32-impulse reference chart. Click any speed header to toggle column highlights. Highlighted speeds: ${normalized.join(", ")}.`
}

function buildMoveChartTable(highlightedSpeeds = [], onToggleSpeed = null) {
  const highlighted = new Set(normalizeMoveChartSpeeds(highlightedSpeeds))
  const table = document.createElement("table")
  table.className = "moveChartTable"

  const thead = document.createElement("thead")
  const headRow = document.createElement("tr")

  const corner = document.createElement("th")
  corner.className = "moveChartTopLabel"
  corner.colSpan = 2

  const topText = document.createElement("span")
  topText.className = "moveChartTopText"
  topText.textContent = "SPEED"

  const topArrow = document.createElement("span")
  topArrow.className = "moveChartTopArrow"
  topArrow.textContent = "->"

  corner.appendChild(topText)
  corner.appendChild(topArrow)
  headRow.appendChild(corner)

  for (let speed = 32; speed >= 2; speed -= 1) {
    const th = document.createElement("th")
    th.className = "moveChartSpeed"
    if (highlighted.has(speed)) th.classList.add("moveChartSpeedSelected")
    th.dataset.speed = String(speed)
    th.textContent = String(speed)
    th.title = "Click to toggle this speed column"
    th.tabIndex = 0
    th.setAttribute("role", "button")
    th.setAttribute("aria-pressed", highlighted.has(speed) ? "true" : "false")
    headRow.appendChild(th)
  }

  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement("tbody")
  for (let impulse = 1; impulse <= 32; impulse += 1) {
    const row = document.createElement("tr")
    row.className = impulse % 2 === 0 ? "moveChartRowEven" : "moveChartRowOdd"

    if (impulse === 1) {
      const impMarker = document.createElement("th")
      impMarker.className = "moveChartImpLabel"
      impMarker.rowSpan = 32

      const impText = document.createElement("span")
      impText.className = "moveChartImpText"
      impText.textContent = "IMP"

      const impArrow = document.createElement("span")
      impArrow.className = "moveChartImpArrow"
      impArrow.textContent = "v"

      impMarker.appendChild(impText)
      impMarker.appendChild(impArrow)
      row.appendChild(impMarker)
    }

    const impCell = document.createElement("th")
    impCell.className = "moveChartImpulse"

    const impValue = document.createElement("div")
    impValue.className = impulse % 2 === 0 ? "moveChartImpulsePlain" : "moveChartImpulseBadge"
    impValue.textContent = String(impulse)

    impCell.appendChild(impValue)
    row.appendChild(impCell)

    for (let speed = 32; speed >= 2; speed -= 1) {
      const td = document.createElement("td")
      const step = getMoveChartStep(speed, impulse)
      td.className = step === "-" ? "moveChartDash" : "moveChartMove"
      if (highlighted.has(speed)) td.classList.add("moveChartColumnSelected")
      td.dataset.speed = String(speed)
      td.textContent = step
      row.appendChild(td)
    }

    tbody.appendChild(row)
  }

  table.appendChild(tbody)

  if (typeof onToggleSpeed === "function") {
    const handleToggle = (target) => {
      const header = target?.closest?.(".moveChartSpeed[data-speed]")
      if (!header) return
      const speed = Number(header.dataset.speed)
      if (!Number.isFinite(speed)) return
      onToggleSpeed(speed)
    }

    table.addEventListener("click", (e) => {
      handleToggle(e.target)
    })

    table.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      const header = e.target?.closest?.(".moveChartSpeed[data-speed]")
      if (!header) return
      e.preventDefault()
      handleToggle(header)
    })
  }

  return table
}

function openMoveChartDialog() {
  const existing = document.getElementById("moveChartOverlay")
  if (existing) {
    existing.remove()
  }

  const overlay = document.createElement("div")
  overlay.id = "moveChartOverlay"
  overlay.className = "modalOverlay"

  const card = document.createElement("div")
  card.className = "modalCard moveChartCard"

  const title = document.createElement("div")
  title.className = "modalTitle"
  title.textContent = "Move Chart"

  const desc = document.createElement("div")
  desc.className = "modalDesc"

  const frame = document.createElement("div")
  frame.className = "moveChartFrame"

  const actions = document.createElement("div")
  actions.className = "modalActions"

  const btnClear = document.createElement("button")
  btnClear.textContent = "Clear Highlights"
  actions.appendChild(btnClear)

  const btnClose = document.createElement("button")
  btnClose.textContent = "Close"
  actions.appendChild(btnClose)

  card.appendChild(title)
  card.appendChild(desc)
  card.appendChild(frame)
  card.appendChild(actions)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  const renderMoveChart = () => {
    state.moveChartHighlightedSpeeds = normalizeMoveChartSpeeds(state.moveChartHighlightedSpeeds)
    desc.textContent = formatMoveChartHighlightText(state.moveChartHighlightedSpeeds)
    frame.replaceChildren(
      buildMoveChartTable(state.moveChartHighlightedSpeeds, (speed) => {
        const next = new Set(state.moveChartHighlightedSpeeds)
        if (next.has(speed)) next.delete(speed)
        else next.add(speed)
        state.moveChartHighlightedSpeeds = normalizeMoveChartSpeeds(Array.from(next))
        renderMoveChart()
      })
    )
    btnClear.disabled = state.moveChartHighlightedSpeeds.length === 0
  }

  const cleanup = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    window.removeEventListener("keydown", onKey)
  }

  const onKey = (e) => {
    if (e.key === "Escape") cleanup()
  }

  btnClear.onclick = () => {
    state.moveChartHighlightedSpeeds = []
    renderMoveChart()
  }
  btnClose.onclick = cleanup
  overlay.onclick = (e) => {
    if (e.target === overlay) cleanup()
  }
  window.addEventListener("keydown", onKey)
  renderMoveChart()
}

/* -----------------------------
   Events
----------------------------- */
function wireEvents() {
  const bindClick = (id, fn) => {
    const el = document.getElementById(id)
    if (el) el.onclick = fn
  }

  bindClick("btnNewTab", () => addEmptyTab())

  bindClick("btnMarkDamage", () => {
    const tab = getActiveTab()
    if (!tab || !tab.doc) return
    setDamageMode(!state.damageMode)
  })

  bindClick("btnRefitRemove", () => {
    const tab = getActiveTab()
    if (!tab || !tab.doc) return
    setRefitMode(!state.refitMode)
  })

  bindClick("btnSystemDeploy", () => {
    const tab = getActiveTab()
    if (!tab || !tab.doc) return
    setSystemMode(!state.systemMode)
  })

  bindClick("btnMoveChart", () => {
    openMoveChartDialog()
  })

  bindClick("btnStartTurn", async () => {
    const tab = getActiveTab()
    if (!tab || !tab.doc || tab.uiState !== "loadShip") return
    if (!tab.turnLocked) {
      tab.turnLocked = true
      updateTurnControlsUI()
      renderEnergyTable()
      return
    }

    // Unlocking: save energy allocation to Games folder
    try {
      const res = await saveTurnSnapshot(tab, { advanceTurn: true })
      if (!res || !res.ok) {
        alert(res?.error || "Failed to save energy allocation for the turn.")
        return
      }
      const prevEnergyValues = { ...(tab.energyValues || {}) }
      const prevEnergyDisplay = { ...(tab.energyDisplay || {}) }
      // Only clear deployed markers after we know the allocation was saved.
      clearSystemDeploymentsForNewTurn(tab)
      renderCanvas()
      renderCurrentProps()
      resetEnergyForNewTurn(tab, prevEnergyValues, prevEnergyDisplay)
      tab.turnLocked = false
      tab.turnNumber = (tab.turnNumber || 1) + 1
      updateTurnControlsUI()
      renderEnergyTable()
    } catch (e) {
      alert(e?.message || "Failed to save energy allocation for the turn.")
    }
  })

  bindClick("btnSaveNow", async () => {
    const tab = getActiveTab()
    if (!tab || !tab.doc || tab.uiState !== "loadShip") return
    const res = await saveTurnSnapshot(tab, { advanceTurn: false })
    if (!res || !res.ok) {
      alert(res?.error || "Failed to save the current turn.")
    }
  })

  bindClick("btnLoadGame", () => {
    handleLoadGame()
  })

  bindClick("btnOpen", async () => {
    const tab = ensureEmptyActiveTab()
    if (!tab) return

    const folderPick = await window.api.shipPickFolder()
    if (!folderPick) return
    if (!folderPick.ok) {
      alert(folderPick.error || "Folder pick failed.")
      return
    }

    const loaded = await window.api.shipLoadFolderDataset(folderPick.folderPath)
    if (!loaded) return
    if (!loaded.ok) {
      alert(loaded?.error || "Failed to load dataset.")
      return
    }

    let doc = null
    try {
      doc = JSON.parse(loaded.jsonText)
      doc = normalizeLoadedShipDoc(
        doc,
        fileStemFromPath(loaded.jsonPath) || baseNameFromPath(loaded.folderPath)
      )
    } catch (e) {
      alert("JSON parse failed: " + e.message)
      return
    }

    applyLoadedDatasetToTab(tab, loaded, doc)
    await applyHeavyLabelSetToTab(tab)
    tab.energyValues = {}
    tab.energyDisplay = {}
    tab.batteryAvailBase = null
    tab.turnLocked = false
    tab.turnNumber = 1
    tab.phaserCapsCleared = false
    tab.energyReset = false
    tab.customShieldLabels = new Set()
    tab.gameSavePath = null

    // Mark this tab as "Load Ship" so the left Ship Controls area appears.
    tab.uiState = "loadShip"

    const title =
      (doc && doc.shipName ? String(doc.shipName) : "") ||
      fileStemFromPath(loaded.jsonPath) ||
      baseNameFromPath(loaded.jsonPath) ||
      "Untitled"

    tab.shipName = doc.shipName || null
    tab.title = title

    tab.affiliation = null

    const okOptionMounts = await askOptionMountPowerRecords(tab)
    if (!okOptionMounts) {
      closeTabById(tab.id)
      return
    }

    const wsChoice = await askWeaponStatus()
    if (wsChoice === "cancel") {
      closeTabById(tab.id)
      return
    }
    if (wsChoice === "loadgame") {
      await handleLoadGame()
      return
    }
    const maxCaps = computeMaxPhaserCaps(tab)
    setEnergyValue(tab, "max phaser capacitors", maxCaps, "MAX PHASER CAPACITORS")
    const remainingKey =
      setEnergyValue(
        tab,
        "held phaser capacitors",
        wsChoice === "ws0" || wsChoice === "ws1" ? 0 : maxCaps,
        "HELD PHASER CAPACITORS"
      ) || "HELD PHASER CAPACITORS"
    if (!(findEnergyKey(tab.energyDisplay, "held phaser capacitors"))) {
      tab.energyDisplay[remainingKey] = tab.energyValues[remainingKey]
    }

    await ensureTabImageLoaded(tab)
    renderTabs()
    renderCanvas()
    renderCurrentProps()
    updateShipControlsVisibility()
  })

  const btnEditSetup = document.getElementById("btnEditSetup")
  if (btnEditSetup) {
    btnEditSetup.onclick = async () => {
      try {
        const res = await window.api.editSetupPaths()
        if (!res) return
        if (!res.ok) {
          alert(res.error || "Failed to update setup paths.")
          return
        }
        alert("Setup paths saved.")
      } catch (e) {
        alert(e?.message || "Failed to update setup paths.")
      }
    }
  }

  const btnRecomputeGroups = document.getElementById("btnRecomputeGroups")
  if (btnRecomputeGroups) {
    btnRecomputeGroups.onclick = () => {
      renderCanvas()
      renderCurrentProps()
    }
  }

  const canvas = document.getElementById("canvas")
  canvas.addEventListener("mousedown", (e) => {
    const tab = getActiveTab()
    if (!state.moveMode || !tab || !tab.doc || !tab.imageObj) return
    if (e.button !== 0) return

    const rect = canvas.getBoundingClientRect()
    syncTabViewToCanvas(tab, Math.round(rect.width), Math.round(rect.height))
    dragState.active = true
    dragState.moved = false
    dragState.tabId = tab.id
    dragState.startX = e.clientX
    dragState.startY = e.clientY
    dragState.startDx = Number(tab.view?.manualDx) || 0
    dragState.startDy = Number(tab.view?.manualDy) || 0
    updateMoveChartUI()
    e.preventDefault()
  })

  canvas.addEventListener("click", async (e) => {
    const tab = getActiveTab()
    if (!tab || !tab.doc) return

    if (state.moveMode) {
      dragState.moved = false
      return
    }

    // Energy locked? Still allow phaser/system recalcs
    const { ix, iy } = canvasToImagePoint(tab, e.clientX, e.clientY)

    if (state.damageMode) {
      const s = hitTestSquare(tab, ix, iy)
      if (s) {
        s.damaged = true
        tab.selected = { kind: "square", id: s.id }
        refreshEnergyAfterMarkerChange(tab)
        renderCanvas()
        renderCurrentProps()
      }
      return
    }

    if (state.refitMode) {
      const s = hitTestSquare(tab, ix, iy)
      if (s) {
        delete s.damaged
        s.refitRemoved = true
        tab.selected = { kind: "square", id: s.id }
        refreshEnergyAfterMarkerChange(tab)
        renderCanvas()
        renderCurrentProps()
      }
      return
    }

    if (state.systemMode) {
      const s = hitTestSquare(tab, ix, iy)
      if (s) {
        const name = getSquareDisplayName(s).toLowerCase()
        let phaserUsage = s.phaserCapUsage

        if (name.startsWith("phaser")) {
          if (name.includes("phaser 3")) {
            phaserUsage = 0.5
          } else if (name.includes("phaser 1") || name.includes("phaser 2")) {
            if (typeof phaserUsage !== "number") {
              const mode = await promptPhaserPower12()
              if (mode === null) return
              phaserUsage = mode === "low" ? 0.5 : 1
            }
          } else if (name.includes("phaser 4")) {
            if (typeof phaserUsage !== "number") {
              const mode = await promptPhaserPower4()
              if (mode === null) return
              if (mode === "low") phaserUsage = 0.5
              else if (mode === "medium") phaserUsage = 1
              else phaserUsage = 2
            }
          } else if (name.includes("phaser g")) {
            const currentCount = Number(s.phaserGCount) || 0
            const nextCount = Math.min(4, currentCount + 1)
            s.phaserGCount = nextCount
            phaserUsage = 0.25 * nextCount
            if (s.phaserGTimer) {
              clearTimeout(s.phaserGTimer)
              delete s.phaserGTimer
            }
            if (nextCount < 4) {
              s.phaserGTimer = setTimeout(() => {
                if (s.phaserGCount < 4) {
                  delete s.systemDeployed
                  refreshEnergyAfterMarkerChange(tab)
                  renderCanvas()
                  renderCurrentProps()
                }
              }, 1000)
            }
          }
        }

        s.systemDeployed = true
        if (typeof phaserUsage === "number") s.phaserCapUsage = phaserUsage
        refreshEnergyAfterMarkerChange(tab)
        tab.selected = { kind: "square", id: s.id }
        renderCanvas()
        renderCurrentProps()
      }
      return
    }

    const s = hitTestSquare(tab, ix, iy)
    if (s) tab.selected = { kind: "square", id: s.id }
    else {
      const g = hitTestGroup(tab, ix, iy)
      if (!g) tab.selected = null
      else tab.selected = { kind: "group", id: g.id }
    }

    renderCanvas()
    renderCurrentProps()
  })

  canvas.addEventListener("contextmenu", (e) => {
    if (state.moveMode) {
      e.preventDefault()
      return
    }
    if (!state.damageMode && !state.systemMode && !state.refitMode) return
    const tab = getActiveTab()
    if (!tab || !tab.doc) return

    const { ix, iy } = canvasToImagePoint(tab, e.clientX, e.clientY)
    const s = hitTestSquare(tab, ix, iy)
    if (!s) return

    e.preventDefault()

    if (state.damageMode) delete s.damaged
    if (state.refitMode) {
      delete s.refitRemoved
    }
    if (state.systemMode) delete s.systemDeployed
    if (state.systemMode || state.damageMode || state.refitMode) {
      refreshEnergyAfterMarkerChange(tab)
    }

    tab.selected = { kind: "square", id: s.id }
    renderCanvas()
    renderCurrentProps()
  })

  const stopMoveDrag = () => {
    if (!dragState.active) return
    dragState.active = false
    dragState.tabId = null
    updateMoveChartUI()
  }

  window.addEventListener("mousemove", (e) => {
    if (!dragState.active) return
    const tab = getActiveTab()
    if (!tab || !tab.doc || tab.id !== dragState.tabId) {
      stopMoveDrag()
      return
    }

    const dx = e.clientX - dragState.startX
    const dy = e.clientY - dragState.startY
    dragState.moved = dragState.moved || Math.abs(dx) > 1 || Math.abs(dy) > 1

    tab.view.manualDx = dragState.startDx + dx
    tab.view.manualDy = dragState.startDy + dy
    tab.view.initialized = false
    renderCanvas()
    updateMoveChartUI()
  })

  window.addEventListener("mouseup", stopMoveDrag)
  window.addEventListener("blur", stopMoveDrag)

  window.addEventListener("resize", () => {
    renderCanvas()
    syncLeftPanelScrollbar()
    updateMoveChartUI()
  })
}

/* -----------------------------
   Damage marking helpers
----------------------------- */
function setDamageMode(on) {
  state.damageMode = !!on
  if (state.damageMode) {
    state.systemMode = false
    state.refitMode = false
    state.moveMode = false
    dragState.active = false
    dragState.tabId = null
    const sysBtn = document.getElementById("btnSystemDeploy")
    if (sysBtn) sysBtn.classList.remove("systemActive")
    const refitBtn = document.getElementById("btnRefitRemove")
    if (refitBtn) refitBtn.classList.remove("refitActive")
    updateMoveChartUI()
  }
  const btn = document.getElementById("btnMarkDamage")
  if (!btn) return
  if (state.damageMode) btn.classList.add("damageActive")
  else btn.classList.remove("damageActive")
}

function updateMoveChartUI() {
  const btn = document.getElementById("btnMoveChart")
  if (btn) {
    if (state.moveMode) btn.classList.add("moveActive")
    else btn.classList.remove("moveActive")
  }

  const canvas = document.getElementById("canvas")
  if (!canvas) return
  if (state.moveMode) {
    canvas.style.cursor = dragState.active ? "grabbing" : "grab"
  } else {
    canvas.style.cursor = ""
  }
}

function setSystemMode(on) {
  state.systemMode = !!on
  if (state.systemMode) {
    state.damageMode = false
    state.refitMode = false
    state.moveMode = false
    dragState.active = false
    dragState.tabId = null
    const dmgBtn = document.getElementById("btnMarkDamage")
    if (dmgBtn) dmgBtn.classList.remove("damageActive")
    const refitBtn = document.getElementById("btnRefitRemove")
    if (refitBtn) refitBtn.classList.remove("refitActive")
    updateMoveChartUI()
  }
  const btn = document.getElementById("btnSystemDeploy")
  if (!btn) return
  if (state.systemMode) btn.classList.add("systemActive")
  else btn.classList.remove("systemActive")
}

function setRefitMode(on) {
  state.refitMode = !!on
  if (state.refitMode) {
    state.damageMode = false
    state.systemMode = false
    state.moveMode = false
    dragState.active = false
    dragState.tabId = null
    const dmgBtn = document.getElementById("btnMarkDamage")
    if (dmgBtn) dmgBtn.classList.remove("damageActive")
    const sysBtn = document.getElementById("btnSystemDeploy")
    if (sysBtn) sysBtn.classList.remove("systemActive")
    updateMoveChartUI()
  }
  const btn = document.getElementById("btnRefitRemove")
  if (!btn) return
  if (state.refitMode) btn.classList.add("refitActive")
  else btn.classList.remove("refitActive")
}

/* -----------------------------
   Phaser firing prompts
----------------------------- */
function promptPhaserPower12() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div")
    overlay.className = "modalOverlay"

    const card = document.createElement("div")
    card.className = "modalCard"

    const title = document.createElement("div")
    title.className = "modalTitle"
    title.textContent = "Phaser Firing Mode"

    const desc = document.createElement("div")
    desc.className = "modalDesc"
    desc.textContent = "Choose whether to fire a low-power (0.5) or full (1.0) shot."

    const actions = document.createElement("div")
    actions.className = "modalActions"

    const btnLow = document.createElement("button")
    btnLow.textContent = "Low Power (0.5)"
    const btnFull = document.createElement("button")
    btnFull.textContent = "Full Power (1.0)"
    const btnCancel = document.createElement("button")
    btnCancel.textContent = "Cancel"

    actions.appendChild(btnLow)
    actions.appendChild(btnFull)
    actions.appendChild(btnCancel)

    card.appendChild(title)
    card.appendChild(desc)
    card.appendChild(actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const cleanup = (choice) => {
      document.body.removeChild(overlay)
      resolve(choice)
    }

    btnLow.onclick = () => cleanup("low")
    btnFull.onclick = () => cleanup("full")
    btnCancel.onclick = () => cleanup(null)

    const onKey = (e) => {
      if (e.key === "Escape") cleanup(null)
    }
    window.addEventListener("keydown", onKey, { once: true })
  })
}

/* -----------------------------
   Phaser-4 power prompt
----------------------------- */
function promptPhaserPower4() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div")
    overlay.className = "modalOverlay"

    const card = document.createElement("div")
    card.className = "modalCard"

    const title = document.createElement("div")
    title.className = "modalTitle"
    title.textContent = "Phaser-4 Firing Mode"

    const desc = document.createElement("div")
    desc.className = "modalDesc"
    desc.textContent = "Choose the power level for this Phaser-4 shot."

    const actions = document.createElement("div")
    actions.className = "modalActions"

    const btnLow = document.createElement("button")
    btnLow.textContent = "Low (0.5)"
    const btnMed = document.createElement("button")
    btnMed.textContent = "Medium (1.0)"
    const btnFull = document.createElement("button")
    btnFull.textContent = "Normal (2.0)"
    const btnCancel = document.createElement("button")
    btnCancel.textContent = "Cancel"

    actions.appendChild(btnLow)
    actions.appendChild(btnMed)
    actions.appendChild(btnFull)
    actions.appendChild(btnCancel)

    card.appendChild(title)
    card.appendChild(desc)
    card.appendChild(actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const cleanup = (choice) => {
      document.body.removeChild(overlay)
      resolve(choice)
    }

    btnLow.onclick = () => cleanup("low")
    btnMed.onclick = () => cleanup("medium")
    btnFull.onclick = () => cleanup("full")
    btnCancel.onclick = () => cleanup(null)

    const onKey = (e) => {
      if (e.key === "Escape") cleanup(null)
    }
    window.addEventListener("keydown", onKey, { once: true })
  })
}

/* -----------------------------
   Weapon status prompt
----------------------------- */
function askWeaponStatus() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div")
    overlay.className = "modalOverlay"

    const card = document.createElement("div")
    card.className = "modalCard"
    card.style.minWidth = "360px"

    const title = document.createElement("div")
    title.className = "modalTitle"
    title.textContent = "Select Weapon Status"

    const desc = document.createElement("div")
    desc.className = "modalDesc"
    desc.textContent = "Choose WS level for this ship (affects initial phaser capacitor charge)."

    const actions = document.createElement("div")
    actions.className = "modalActions"

    const btnWS0 = document.createElement("button")
    btnWS0.textContent = "WS 0"
    const btnWS1 = document.createElement("button")
    btnWS1.textContent = "WS I"
    const btnWS2 = document.createElement("button")
    btnWS2.textContent = "WS II"
    const btnWS3 = document.createElement("button")
    btnWS3.textContent = "WS III"
    const btnCancel = document.createElement("button")
    btnCancel.textContent = "Cancel"

    actions.style.display = "flex"
    actions.style.flexWrap = "wrap"
    actions.style.gap = "8px"
    const btnLoadGame = document.createElement("button")
    btnLoadGame.textContent = "Load Game"
    ;[btnWS0, btnWS1, btnWS2, btnWS3, btnLoadGame, btnCancel].forEach(btn => {
      btn.style.flex = "1 1 45%"
      btn.style.minWidth = "120px"
    })

    actions.appendChild(btnWS0)
    actions.appendChild(btnWS1)
    actions.appendChild(btnWS2)
    actions.appendChild(btnWS3)
    actions.appendChild(btnLoadGame)
    actions.appendChild(btnCancel)

    card.appendChild(title)
    card.appendChild(desc)
    card.appendChild(actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    function cleanup(choice) {
      document.body.removeChild(overlay)
      resolve(choice)
    }

    btnWS0.onclick = () => cleanup("ws0")
    btnWS1.onclick = () => cleanup("ws1")
    btnWS2.onclick = () => cleanup("ws2")
    btnWS3.onclick = () => cleanup("ws3")
    btnLoadGame.onclick = () => cleanup("loadgame")
    btnCancel.onclick = () => cleanup("cancel")

    function onKey(e) {
      if (e.key === "Escape") cleanup("cancel")
    }
    window.addEventListener("keydown", onKey, { once: true })
  })
}

/* -----------------------------
   Boot
----------------------------- */
renderAppVersion()
loadAppVersion()
loadHeavyLabelSet()
addEmptyTab()
wireEvents()
renderCanvas()
renderCurrentProps()
syncLeftPanelScrollbar()
