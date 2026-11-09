const state = {
  context: null,
  submitInProgress: false,
  manualDacSubmitInProgress: false,
  weaponPromptOpen: false,
  manualDacPromptOpen: false,
  manualDacContext: null
}

function byId(id) {
  return document.getElementById(id)
}

function normalizeInteger(value, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.trunc(num)
}

function normalizeDamageMode(value) {
  const raw = String(value || "").trim().toLowerCase()
  return raw === "manual" ? "manual" : "automatic"
}

function setHint(text, isError = false) {
  const el = byId("assignDamageHint")
  if (!el) return
  el.textContent = String(text || "")
  el.classList.toggle("error", isError === true)
}

function setDestructionPreview(payload) {
  const root = byId("assignDestructionChance")
  if (!root) return

  if (!payload || typeof payload !== "object") {
    root.classList.add("hidden")
    root.classList.remove("pending", "danger")
    return
  }

  const text = String(payload.text || "").trim()
  const detail = String(payload.detail || "").trim()
  if (!text && !detail) {
    root.classList.add("hidden")
    root.classList.remove("pending", "danger")
    return
  }

  const textEl = byId("assignDestructionChanceText")
  const detailEl = byId("assignDestructionChanceDetail")
  if (textEl) textEl.textContent = text || "Destruction chance"
  if (detailEl) detailEl.textContent = detail

  const chancePercent = Number(payload.chancePercent)
  root.classList.remove("hidden")
  root.classList.toggle("pending", String(payload.status || "") === "pending")
  root.classList.toggle("danger", Number.isFinite(chancePercent) && chancePercent >= 50)
}

function setControlsDisabled(disabled) {
  const ids = [
    "assignTotalDamage",
    "assignShieldNumber",
    "assignDamageMode",
    "assignAttacker",
    "btnAssignDamageSubmit"
  ]
  for (const id of ids) {
    const el = byId(id)
    if (el) el.disabled = !!disabled
  }
}

function isWeaponPromptOpen() {
  const overlay = byId("assignWeaponPromptOverlay")
  return !!overlay && !overlay.classList.contains("hidden")
}

function isManualDacPromptOpen() {
  const overlay = byId("assignManualDacOverlay")
  return !!overlay && !overlay.classList.contains("hidden")
}

function setWeaponPromptOpen(open) {
  const overlay = byId("assignWeaponPromptOverlay")
  if (!overlay) return

  const next = !!open
  state.weaponPromptOpen = next
  overlay.classList.toggle("hidden", !next)
  overlay.setAttribute("aria-hidden", next ? "false" : "true")

  if (!next) return

  const preferred = byId("assignWeaponPromptList")?.querySelector("button")
    || byId("btnAssignWeaponPromptSkip")
    || byId("btnAssignWeaponPromptCancel")
  preferred?.focus?.()
}

function setManualDacError(text) {
  const el = byId("assignManualDacError")
  if (!el) return
  const msg = String(text || "").trim()
  el.textContent = msg || "Enter a 2d6 total from 2 to 12."
  el.classList.toggle("hidden", msg.length === 0)
}

function getManualDacRollState() {
  const input = byId("assignManualDacRollInput")
  const total = normalizeInteger(input?.value, NaN)
  return {
    total,
    valid: Number.isFinite(total) && total >= 2 && total <= 12
  }
}

function deriveManualDacDefaultRoll(payload) {
  return Math.min(12, Math.max(2, normalizeInteger(payload?.defaultRoll, 7)))
}

function setManualDacElementHidden(id, hidden) {
  const el = byId(id)
  if (!el) return
  el.classList.toggle("manualDacHidden", hidden === true)
}

function setManualDacCompleteMode(enabled, completionText = "Damage complete") {
  const complete = enabled === true
  const closeButton = byId("btnAssignManualDacClose")
  if (closeButton) {
    closeButton.setAttribute("aria-label", complete ? "Close assign damage window" : "Cancel manual DAC allocation")
  }

  setManualDacElementHidden("assignManualDacPromptText", complete)
  setManualDacElementHidden("assignManualDacRollField", complete)
  setManualDacElementHidden("assignManualDacError", complete)
  setManualDacElementHidden("assignManualDacActions", complete)
  setManualDacElementHidden("assignManualDacComplete", !complete)

  const completeEl = byId("assignManualDacComplete")
  if (completeEl) {
    const text = String(completionText || "").trim()
    completeEl.textContent = text || "Damage complete"
  }
}

function setManualDacPromptOpen(open) {
  const overlay = byId("assignManualDacOverlay")
  if (!overlay) return

  const next = !!open
  state.manualDacPromptOpen = next
  overlay.classList.toggle("hidden", !next)
  overlay.setAttribute("aria-hidden", next ? "false" : "true")

  if (!next) return

  if (state.manualDacContext?.complete === true) {
    const preferred = byId("btnAssignManualDacClose")
    preferred?.focus?.()
    return
  }

  const rollInput = byId("assignManualDacRollInput")
  if (rollInput) {
    rollInput.focus()
    rollInput.select?.()
    return
  }

  const preferred = byId("btnAssignManualDacApply") || byId("btnAssignManualDacCancel")
  preferred?.focus?.()
}

function clearWeaponPromptUi() {
  const list = byId("assignWeaponPromptList")
  if (list) {
    list.innerHTML = ""
  }
  const skipBtn = byId("btnAssignWeaponPromptSkip")
  if (skipBtn) {
    skipBtn.classList.add("hidden")
  }
  setWeaponPromptOpen(false)
}

function clearManualDacPromptUi() {
  state.manualDacSubmitInProgress = false
  state.manualDacContext = null
  setManualDacError("")
  setManualDacPromptOpen(false)
}

function submitWeaponPromptSelection(optionId) {
  clearWeaponPromptUi()
  if (!window.api || typeof window.api.submitAssignDamageWeaponSelection !== "function") return
  window.api.submitAssignDamageWeaponSelection({
    optionId: String(optionId || "")
  })
}

function cancelWeaponPrompt() {
  clearWeaponPromptUi()
  if (!window.api || typeof window.api.cancelAssignDamageWeaponSelection !== "function") return
  window.api.cancelAssignDamageWeaponSelection({
    canceled: true
  })
}

function skipWeaponPrompt() {
  clearWeaponPromptUi()
  if (!window.api || typeof window.api.cancelAssignDamageWeaponSelection !== "function") return
  window.api.cancelAssignDamageWeaponSelection({
    skip: true
  })
}

function applyWeaponPrompt(payload) {
  const overlay = byId("assignWeaponPromptOverlay")
  const titleEl = byId("assignWeaponPromptTitle")
  const leadEl = byId("assignWeaponPromptLead")
  const listEl = byId("assignWeaponPromptList")

  if (!overlay || !listEl) return

  if (!payload || typeof payload !== "object") {
    clearWeaponPromptUi()
    return
  }

  const title = String(payload.title || "").trim() || "Choose Weapon Hit"
  const lead = String(payload.lead || "").trim() || "Select which box is hit."
  const options = Array.isArray(payload.options) ? payload.options : []
  const allowSkip = payload.allowSkip === true

  titleEl.textContent = title
  leadEl.textContent = lead
  listEl.innerHTML = ""

  const skipBtn = byId("btnAssignWeaponPromptSkip")
  if (skipBtn) {
    skipBtn.classList.toggle("hidden", !allowSkip)
  }

  for (const option of options) {
    if (!option || typeof option !== "object") continue

    const button = document.createElement("button")
    button.type = "button"
    button.className = "weaponSelectButton"

    const primary = document.createElement("span")
    primary.textContent = String(option.label || "Weapon")
    button.appendChild(primary)

    const detailText = String(option.detail || "").trim()
    if (detailText) {
      const detail = document.createElement("small")
      detail.textContent = detailText
      button.appendChild(detail)
    }

    button.addEventListener("click", () => {
      submitWeaponPromptSelection(option.optionId)
    })
    listEl.appendChild(button)
  }

  setWeaponPromptOpen(true)
}

function applyManualDacPrompt(payload) {
  const overlay = byId("assignManualDacOverlay")
  const lead = byId("assignManualDacLead")
  const rollInput = byId("assignManualDacRollInput")
  if (!overlay) return

  if (!payload || typeof payload !== "object") {
    clearManualDacPromptUi()
    return
  }

  state.manualDacContext = payload
  state.manualDacSubmitInProgress = false

  const complete = payload.complete === true
  setManualDacCompleteMode(complete, payload.completionText)

  if (complete) {
    if (lead) lead.textContent = "Manual DAC"
    setManualDacError("")
    setManualDacPromptOpen(true)
    return
  }

  const hitIndex = Math.max(1, normalizeInteger(payload.hitIndex, 1))
  const totalHits = Math.max(1, normalizeInteger(payload.totalHits, 1))
  const defaultRoll = deriveManualDacDefaultRoll(payload)

  if (lead) {
    lead.textContent = totalHits > 1
      ? `Internal ${hitIndex} of ${totalHits}`
      : "Internal Hit"
  }

  if (rollInput) rollInput.value = String(defaultRoll)

  setManualDacError(String(payload.errorText || ""))
  setManualDacPromptOpen(true)
}

function closeAssignDamageWindow() {
  if (window.api && typeof window.api.closeAssignDamageWindow === "function") {
    window.api.closeAssignDamageWindow()
  } else {
    window.close()
  }
}

function cancelManualDacPrompt() {
  const complete = state.manualDacContext?.complete === true
  clearManualDacPromptUi()
  if (!complete && window.api && typeof window.api.cancelAssignDamageManualDacPrompt === "function") {
    window.api.cancelAssignDamageManualDacPrompt({
      reason: "user-canceled"
    })
  }
  closeAssignDamageWindow()
}

function submitManualDacRoll() {
  if (state.manualDacSubmitInProgress) return
  if (state.manualDacContext?.complete === true) return

  const rollState = getManualDacRollState()
  if (!rollState.valid) {
    setManualDacError("Enter a 2d6 total from 2 to 12.")
    const rollInput = byId("assignManualDacRollInput")
    rollInput?.focus()
    rollInput?.select?.()
    return
  }

  if (!window.api || typeof window.api.submitAssignDamageManualDacPrompt !== "function") {
    setManualDacError("Manual DAC prompt IPC is not available.")
    return
  }

  state.manualDacSubmitInProgress = true
  try {
    setManualDacError("")
    setManualDacPromptOpen(false)
    window.api.submitAssignDamageManualDacPrompt({
      roll: rollState.total,
      hitIndex: normalizeInteger(state.manualDacContext?.hitIndex, 1),
      totalHits: normalizeInteger(state.manualDacContext?.totalHits, 1)
    })
  } finally {
    state.manualDacSubmitInProgress = false
  }
}

function renderShieldOptions(options, selectedShieldNumber) {
  const select = byId("assignShieldNumber")
  if (!select) return
  select.innerHTML = ""

  const list = Array.isArray(options) ? options : []
  for (const item of list) {
    const option = document.createElement("option")
    option.value = String(item?.number ?? "")
    const printed = Number.isFinite(Number(item?.value)) ? Math.trunc(Number(item.value)) : null
    option.textContent = printed !== null && printed > 0
      ? `Shield #${item.number} (${printed})`
      : `Shield #${item.number}`
    select.appendChild(option)
  }

  const wanted = String(selectedShieldNumber ?? "")
  if (wanted && list.some((item) => String(item?.number ?? "") === wanted)) {
    select.value = wanted
  } else if (list.length > 0) {
    select.value = String(list[0].number)
  }
}

// Each option is one player; its value is that player's damage colour.
function renderAttackerOptions(attackers, selectedColor) {
  const field = byId("assignAttackerField")
  const select = byId("assignAttacker")
  if (!field || !select) return
  const list = Array.isArray(attackers) ? attackers.filter((item) => item && item.color) : []
  field.classList.toggle("hidden", list.length === 0)
  const previous = select.value
  select.innerHTML = ""
  for (const item of list) {
    const option = document.createElement("option")
    option.value = String(item.color)
    option.textContent = `${item.name} (${item.label || item.color})`
    option.dataset.swatch = String(item.swatch || "")
    select.appendChild(option)
  }
  const wanted = list.some((item) => item.color === previous) ? previous : String(selectedColor || "")
  if (list.some((item) => item.color === wanted)) select.value = wanted
  updateAttackerSwatch()
}

function updateAttackerSwatch() {
  const select = byId("assignAttacker")
  const swatch = byId("assignAttackerSwatch")
  if (!select || !swatch) return
  const option = select.options[select.selectedIndex]
  swatch.style.background = option?.dataset.swatch || "transparent"
}

function syncDamageModeSelect(selectedMode) {
  const select = byId("assignDamageMode")
  if (!select) return
  const normalized = normalizeDamageMode(selectedMode)
  select.value = normalized
}

function collectSelectedPhaserKeys() {
  const container = byId("assignNonBearingPhasersList")
  if (!container) return []
  const checked = container.querySelectorAll('input[type="checkbox"]:checked')
  const out = []
  for (const el of checked) {
    const key = String(el.value || "")
    if (!key) continue
    out.push(key)
  }
  return out
}

function sendPreviewSelection() {
  const ctx = state.context || {}
  if (ctx.available !== true) return
  if (!window.api || typeof window.api.previewAssignDamageWindowSelection !== "function") return

  const totalDamageInput = byId("assignTotalDamage")
  const shieldSelect = byId("assignShieldNumber")
  const modeSelect = byId("assignDamageMode")

  window.api.previewAssignDamageWindowSelection({
    shipIndex: normalizeInteger(ctx.shipIndex, -1),
    rawTotalDamage: String(totalDamageInput?.value || ""),
    totalDamage: normalizeInteger(totalDamageInput?.value, NaN),
    shieldNumber: normalizeInteger(shieldSelect?.value, 0),
    assignmentMode: normalizeDamageMode(modeSelect?.value),
    selectedNonBearingPhaserKeys: collectSelectedPhaserKeys()
  })
}

function applyContext(context) {
  state.context = context && typeof context === "object" ? context : null
  state.submitInProgress = false
  const ctx = state.context || {}

  const shipDisplay = byId("assignShipDisplay")
  const totalDamageInput = byId("assignTotalDamage")

  if (shipDisplay) {
    shipDisplay.value = String(ctx.shipLabel || "No active ship")
  }

  renderShieldOptions(ctx.shieldOptions || [], ctx.selectedShieldNumber)
  syncDamageModeSelect(ctx.selectedAssignmentMode)
  renderAttackerOptions(ctx.attackers, ctx.selectedAttackerColor)

  if (totalDamageInput) {
    totalDamageInput.value = ctx.totalDamage != null && ctx.totalDamage !== "" ? String(ctx.totalDamage) : ""
  }

  const disabled = ctx.available !== true
  setControlsDisabled(disabled)
  if (disabled) {
    setDestructionPreview(null)
  } else {
    sendPreviewSelection()
  }

  if (ctx.hintText) {
    setHint(ctx.hintText, !!ctx.hintError)
  } else if (disabled) {
    setHint("Load and select a ship in the main StarHold window first.")
  } else {
    setHint("Enter damage and choose the shield hit.")
  }

  if (!disabled && totalDamageInput && !isWeaponPromptOpen() && !isManualDacPromptOpen()) {
    totalDamageInput.focus()
    totalDamageInput.select?.()
  }
}

function closeWindow() {
  if (isManualDacPromptOpen()) {
    cancelManualDacPrompt()
    return
  }
  if (isWeaponPromptOpen()) {
    cancelWeaponPrompt()
    return
  }
  closeAssignDamageWindow()
}

async function submitAssignDamage() {
  const ctx = state.context || {}
  if (ctx.available !== true) {
    setHint("No active ship is available to assign damage.", true)
    return
  }

  if (state.submitInProgress) return

  const totalDamageInput = byId("assignTotalDamage")
  const shieldSelect = byId("assignShieldNumber")
  const modeSelect = byId("assignDamageMode")

  const totalDamage = normalizeInteger(totalDamageInput?.value, 0)
  const shieldNumber = normalizeInteger(shieldSelect?.value, 0)
  const assignmentMode = normalizeDamageMode(modeSelect?.value)

  if (!Number.isFinite(totalDamage) || totalDamage <= 0) {
    setHint("Enter a total damage value greater than 0.", true)
    totalDamageInput?.focus()
    return
  }
  if (!Number.isFinite(shieldNumber) || shieldNumber <= 0) {
    setHint("Select a valid shield.", true)
    shieldSelect?.focus()
    return
  }

  if (!window.api || typeof window.api.submitAssignDamageWindow !== "function") {
    setHint("Assign Damage IPC is not available.", true)
    return
  }

  state.submitInProgress = true
  try {
    setControlsDisabled(true)
    window.api.submitAssignDamageWindow({
      shipIndex: normalizeInteger(ctx.shipIndex, -1),
      totalDamage,
      shieldNumber,
      assignmentMode,
      attackerColor: String(byId("assignAttacker")?.value || "")
    })
  } catch {
    state.submitInProgress = false
    setControlsDisabled(false)
  }
}

function init() {
  const btnClose = byId("btnAssignDamageClose")
  if (btnClose) btnClose.onclick = () => closeWindow()

  const btnCancel = byId("btnAssignDamageCancel")
  if (btnCancel) btnCancel.onclick = () => closeWindow()

  const btnSubmit = byId("btnAssignDamageSubmit")
  if (btnSubmit) btnSubmit.onclick = () => submitAssignDamage()

  const totalDamageInput = byId("assignTotalDamage")
  if (totalDamageInput) {
    totalDamageInput.addEventListener("input", () => sendPreviewSelection())
    totalDamageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitAssignDamage()
    })
  }

  const shieldSelect = byId("assignShieldNumber")
  if (shieldSelect) shieldSelect.addEventListener("change", () => sendPreviewSelection())

  const modeSelect = byId("assignDamageMode")
  if (modeSelect) modeSelect.addEventListener("change", () => sendPreviewSelection())

  const attackerSelect = byId("assignAttacker")
  if (attackerSelect) attackerSelect.addEventListener("change", () => updateAttackerSwatch())

  const weaponPromptOverlay = byId("assignWeaponPromptOverlay")
  if (weaponPromptOverlay) {
    weaponPromptOverlay.addEventListener("click", (event) => {
      if (event.target === weaponPromptOverlay) {
        cancelWeaponPrompt()
      }
    })
  }

  const btnWeaponPromptClose = byId("btnAssignWeaponPromptClose")
  if (btnWeaponPromptClose) btnWeaponPromptClose.addEventListener("click", () => cancelWeaponPrompt())

  const btnWeaponPromptSkip = byId("btnAssignWeaponPromptSkip")
  if (btnWeaponPromptSkip) btnWeaponPromptSkip.addEventListener("click", () => skipWeaponPrompt())

  const btnWeaponPromptCancel = byId("btnAssignWeaponPromptCancel")
  if (btnWeaponPromptCancel) btnWeaponPromptCancel.addEventListener("click", () => cancelWeaponPrompt())

  const manualDacOverlay = byId("assignManualDacOverlay")
  if (manualDacOverlay) {
    manualDacOverlay.addEventListener("click", (event) => {
      if (event.target === manualDacOverlay) {
        cancelManualDacPrompt()
      }
    })
  }

  const btnManualDacClose = byId("btnAssignManualDacClose")
  if (btnManualDacClose) btnManualDacClose.addEventListener("click", () => cancelManualDacPrompt())

  const btnManualDacCancel = byId("btnAssignManualDacCancel")
  if (btnManualDacCancel) btnManualDacCancel.addEventListener("click", () => cancelManualDacPrompt())

  const btnManualDacApply = byId("btnAssignManualDacApply")
  if (btnManualDacApply) btnManualDacApply.addEventListener("click", () => submitManualDacRoll())

  const manualDacRollInput = byId("assignManualDacRollInput")
  if (manualDacRollInput) {
    manualDacRollInput.addEventListener("input", () => {
      setManualDacError("")
    })
    manualDacRollInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        submitManualDacRoll()
      } else if (event.key === "Escape") {
        event.preventDefault()
        cancelManualDacPrompt()
      }
    })
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isManualDacPromptOpen()) {
        event.preventDefault()
        cancelManualDacPrompt()
        return
      }
      if (isWeaponPromptOpen()) {
        event.preventDefault()
        cancelWeaponPrompt()
        return
      }
      closeWindow()
    }
  })

  if (window.api && typeof window.api.onAssignDamageWindowState === "function") {
    window.api.onAssignDamageWindowState((payload) => {
      applyContext(payload)
    })
  }

  if (window.api && typeof window.api.onAssignDamageDestructionPreview === "function") {
    window.api.onAssignDamageDestructionPreview((payload) => {
      setDestructionPreview(payload)
    })
  }

  if (window.api && typeof window.api.onAssignDamageWeaponPrompt === "function") {
    window.api.onAssignDamageWeaponPrompt((payload) => {
      applyWeaponPrompt(payload)
    })
  }

  if (window.api && typeof window.api.onAssignDamageManualDacPrompt === "function") {
    window.api.onAssignDamageManualDacPrompt((payload) => {
      applyManualDacPrompt(payload)
    })
  }

  applyContext({
    available: false,
    shipLabel: "No active ship",
    shieldOptions: [],
    selectedAssignmentMode: "automatic",
    phasers: [],
    hintText: "Waiting for active ship data from the main StarHold window..."
  })
}

init()
