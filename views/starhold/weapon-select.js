const state = {
  context: null,
  submitInProgress: false
}

function byId(id) {
  return document.getElementById(id)
}

function closeWindow() {
  if (window.api && typeof window.api.closeWeaponSelectWindow === "function") {
    window.api.closeWeaponSelectWindow()
  } else {
    window.close()
  }
}

function cancelSelection() {
  if (state.submitInProgress) return
  if (
    !window.api ||
    typeof window.api.cancelAssignDamageWeaponSelection !== "function"
  ) {
    closeWindow()
    return
  }
  state.submitInProgress = true
  window.api.cancelAssignDamageWeaponSelection({
    canceled: true
  })
}

function skipSelection() {
  if (state.submitInProgress) return
  if (
    !window.api ||
    typeof window.api.cancelAssignDamageWeaponSelection !== "function"
  ) {
    closeWindow()
    return
  }
  state.submitInProgress = true
  window.api.cancelAssignDamageWeaponSelection({
    skip: true
  })
}

function submitSelection(optionId) {
  if (state.submitInProgress) return
  if (!window.api || typeof window.api.submitAssignDamageWeaponSelection !== "function") {
    return
  }

  state.submitInProgress = true
  try {
    window.api.submitAssignDamageWeaponSelection({
      optionId: String(optionId || "")
    })
  } catch {
    state.submitInProgress = false
  }
}

function applyContext(context) {
  state.context = context && typeof context === "object" ? context : null
  state.submitInProgress = false

  const titleEl = byId("weaponSelectWindowTitle")
  const leadEl = byId("weaponSelectWindowLead")
  const listEl = byId("weaponSelectWindowList")
  if (!titleEl || !leadEl || !listEl) return

  const ctx = state.context || {}
  titleEl.textContent = String(ctx.title || "").trim() || "Choose Weapon Hit"
  leadEl.textContent = String(ctx.lead || "").trim() || "Select which box is hit."

  const options = Array.isArray(ctx.options) ? ctx.options : []
  const allowSkip = ctx.allowSkip === true
  listEl.innerHTML = ""

  const skipBtn = byId("btnWeaponSelectWindowSkip")
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
      submitSelection(option.optionId)
    })
    listEl.appendChild(button)
  }

  const preferred = listEl.querySelector("button")
    || (allowSkip ? byId("btnWeaponSelectWindowSkip") : null)
    || byId("btnWeaponSelectWindowCancel")
  preferred?.focus?.()
}

function init() {
  const btnClose = byId("btnWeaponSelectWindowClose")
  if (btnClose) btnClose.addEventListener("click", () => cancelSelection())

  const btnSkip = byId("btnWeaponSelectWindowSkip")
  if (btnSkip) btnSkip.addEventListener("click", () => skipSelection())

  const btnCancel = byId("btnWeaponSelectWindowCancel")
  if (btnCancel) btnCancel.addEventListener("click", () => cancelSelection())

  if (window.api && typeof window.api.onWeaponSelectWindowState === "function") {
    window.api.onWeaponSelectWindowState((payload) => {
      applyContext(payload)
    })
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      cancelSelection()
    }
  })
}

init()
