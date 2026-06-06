(() => {
  const API_NAME = "__konnectHblQrScanner";

  if (window[API_NAME]) {
    window[API_NAME].init();
    return;
  }

  const SINGLE_CONSUMER_IDS = ["txtconsumernumber", "txtConsumerNumber", "txtConsumerNo", "txtConsumer"];
  const BULK_CONSUMER_ID_PATTERN = /^txtConsumer(\d+)$/i;
  const CONSUMER_LABEL_PATTERN = /consumer\s*(number|no|#)?/i;
  const SCANNER_CONTAINER_ID = "konnect-qr-scanner-container";
  const BUTTON_CLASS = "konnect-qr-scan-button";
  const FIELD_WRAPPER_CLASS = "konnect-qr-field-wrapper";
  const FIELD_BUTTONS_CLASS = "konnect-qr-field-buttons";
  const DEFAULT_MOBILE_STORAGE_KEY = "defaultMobileNumber";
  const SCAN_IDLE_COMMIT_MS = 250;
  const BILL_TYPES = {
    electricity: {
      buttonText: "Electricity Bill",
      title: "Scan an electricity/WAPDA bill barcode with a plug-and-play USB scanner",
      overlayTitle: "Scan Electricity Bill Barcode",
      helpText: "Use the USB scanner to scan the electricity/WAPDA bill barcode. The extension reads the 14 digits immediately after the first alphabet character.",
      successText: "Electricity consumer number filled successfully."
    },
    gas: {
      buttonText: "Gas Bill",
      title: "Scan a gas/SNGPL barcode with a plug-and-play USB scanner",
      overlayTitle: "Scan Gas Bill Barcode",
      helpText: "Use the USB scanner to scan the gas barcode. The extension reads the 11 digits immediately after the 0300 gas biller prefix.",
      successText: "Gas consumer number filled successfully."
    }
  };

  let activeScan = false;
  let observer;
  let scanState = null;

  function init() {
    injectScanButtons();

    if (!observer) {
      observer = new MutationObserver(() => injectScanButtons());
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function injectScanButtons() {
    const fields = findConsumerFields();
    fields.forEach((field) => injectScanControls(field));
    return fields.length;
  }

  function findConsumerFields() {
    const fields = [];
    const seen = new Set();

    for (const input of findSingleConsumerInputs()) {
      addConsumerField(fields, seen, { input, mode: "single" });
    }

    document.querySelectorAll("input[id]").forEach((input) => {
      const match = input.id.match(BULK_CONSUMER_ID_PATTERN);
      if (match) {
        addConsumerField(fields, seen, { input, mode: "bulk", index: match[1] });
      }
    });

    return fields;
  }

  function addConsumerField(fields, seen, field) {
    if (!field.input || seen.has(field.input)) {
      return;
    }

    seen.add(field.input);
    fields.push(field);
  }

  function findSingleConsumerInputs() {
    const inputs = [];

    for (const id of SINGLE_CONSUMER_IDS) {
      const input = document.getElementById(id);
      if (input) {
        inputs.push(input);
      }
    }

    document.querySelectorAll('input[name*="consumer" i], input[id*="consumer" i]').forEach((input) => {
      if (!input.id.match(BULK_CONSUMER_ID_PATTERN) && isLikelyConsumerInput(input)) {
        inputs.push(input);
      }
    });

    const labelledInput = findInputByLabelText(CONSUMER_LABEL_PATTERN);
    if (labelledInput && !labelledInput.id.match(BULK_CONSUMER_ID_PATTERN)) {
      inputs.push(labelledInput);
    }

    return inputs;
  }

  function isLikelyConsumerInput(input) {
    const identity = `${input.id || ""} ${input.name || ""} ${input.placeholder || ""}`;
    return CONSUMER_LABEL_PATTERN.test(identity) && !/mobile|phone|depositor|amount|name/i.test(identity);
  }

  function injectScanControls(field) {
    if (!field.input || !field.input.parentElement) {
      return;
    }

    const currentButtonCount = normalizeExistingControls(field.input);

    if (field.input.dataset.konnectQrInjected === "true") {
      if (currentButtonCount === 0) {
        const existingWrapper = field.input.closest(`.${FIELD_WRAPPER_CLASS}`) || field.input.parentElement;
        existingWrapper.appendChild(buildBillButtons(field));
      }
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = FIELD_WRAPPER_CLASS;

    field.input.dataset.konnectQrInjected = "true";
    field.input.parentElement.insertBefore(wrapper, field.input);
    wrapper.append(field.input, buildBillButtons(field));
  }

  function buildBillButtons(field) {
    const electricityButton = buildBillButton("electricity", field);
    const gasButton = buildBillButton("gas", field);
    const buttons = document.createElement("div");
    buttons.className = FIELD_BUTTONS_CLASS;
    buttons.append(electricityButton, gasButton);
    return buttons;
  }

  function normalizeExistingControls(input) {
    const wrapper = input.closest?.(`.${FIELD_WRAPPER_CLASS}`) || input.parentElement;
    if (!wrapper) {
      return 0;
    }

    removeStaleControlsNearInput(input, wrapper);

    const buttonGroups = Array.from(wrapper.querySelectorAll(`.${FIELD_BUTTONS_CLASS}`));
    let keptButtons = null;

    buttonGroups.forEach((buttons) => {
      if (!keptButtons && isCurrentBillButtonGroup(buttons)) {
        keptButtons = buttons;
        return;
      }

      buttons.remove();
    });

    return keptButtons ? keptButtons.querySelectorAll(`.${BUTTON_CLASS}`).length : 0;
  }

  function removeStaleControlsNearInput(input, wrapper) {
    const parent = wrapper.parentElement || input.parentElement;
    if (!parent) {
      return;
    }

    Array.from(parent.children).forEach((child) => {
      if (child === wrapper || child.contains(input)) {
        return;
      }

      if (isScanControlElement(child)) {
        child.remove();
        return;
      }

      child.querySelectorAll?.(
        `.${FIELD_BUTTONS_CLASS}, .konnect-camera-scan-button, .konnect-usb-scan-button, .${BUTTON_CLASS}`
      ).forEach((control) => control.remove());

      if (child.classList?.contains(FIELD_WRAPPER_CLASS) && !child.querySelector("input") && !child.textContent.trim()) {
        child.remove();
      }
    });
  }

  function isCurrentBillButtonGroup(buttons) {
    const billButtons = buttons.querySelectorAll(`.${BUTTON_CLASS}`).length;
    const hasOldCameraButton = Boolean(buttons.querySelector(".konnect-camera-scan-button"));
    const hasOldUsbButton = Boolean(buttons.querySelector(".konnect-usb-scan-button"));
    const buttonLabels = Array.from(buttons.querySelectorAll(`.${BUTTON_CLASS}`), (button) => button.textContent.trim());
    const hasCurrentLabels = buttonLabels.includes(BILL_TYPES.electricity.buttonText) && buttonLabels.includes(BILL_TYPES.gas.buttonText);

    return !hasOldCameraButton && !hasOldUsbButton && billButtons === 2 && hasCurrentLabels;
  }

  function isScanControlElement(element) {
    return Boolean(
      element.classList?.contains(FIELD_BUTTONS_CLASS) ||
      element.classList?.contains(BUTTON_CLASS) ||
      element.classList?.contains("konnect-camera-scan-button") ||
      element.classList?.contains("konnect-usb-scan-button")
    );
  }

  function buildBillButton(type, field) {
    const config = BILL_TYPES[type];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${BUTTON_CLASS} konnect-${type}-scan-button`;
    button.textContent = config.buttonText;
    button.title = config.title;
    button.addEventListener("click", () => handleBillScanClick(field, type));
    return button;
  }

  async function handleBillScanClick(field, billType) {
    if (activeScan) {
      return;
    }

    const license = await requestLicenseValidation();
    if (!license.valid) {
      showToast(license.reason || "License is not valid.", "error");
      return;
    }

    startScanner(field, billType);
  }

  function requestLicenseValidation() {
    return chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE" });
  }

  async function startFirstScan(billType) {
    const field = getFirstAvailableField();
    if (!field) {
      showToast("No consumer number fields were found on this page.", "error");
      return { started: false, reason: "No consumer number fields were found on this page." };
    }

    await handleBillScanClick(field, billType);
    return { started: true };
  }

  function getFirstAvailableField() {
    const fields = findConsumerFields();
    fields.forEach((field) => injectScanControls(field));
    return fields.find((field) => !String(field.input.value || "").trim()) || fields[0] || null;
  }

  function startScanner(field, billType) {
    const input = document.getElementById(field.input.id);
    if (!input) {
      showToast("Consumer number field was not found.", "error");
      return;
    }

    stopScanner(false);
    activeScan = true;

    const overlay = buildScannerOverlay(field, billType);
    scanState = {
      billType,
      buffer: "",
      field: { ...field, input },
      overlay: overlay.container,
      timerId: null
    };

    document.body.appendChild(overlay.container);
    input.focus();
    input.select?.();
    document.addEventListener("keydown", handleScannerKeydown, true);
    showToast(`${BILL_TYPES[billType].buttonText} scanner is ready. Scan the barcode now.`, "info");
  }

  function handleScannerKeydown(event) {
    if (!scanState) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      stopScanner(true);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      commitScannerBuffer();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      scanState.buffer = "";
      scheduleScannerCommit();
      return;
    }

    if (event.key?.length === 1) {
      event.preventDefault();
      scanState.buffer += event.key;
      scheduleScannerCommit();
    }
  }

  function scheduleScannerCommit() {
    window.clearTimeout(scanState?.timerId);
    if (!scanState) {
      return;
    }

    scanState.timerId = window.setTimeout(commitScannerBuffer, SCAN_IDLE_COMMIT_MS);
  }

  async function commitScannerBuffer() {
    if (!scanState) {
      return;
    }

    const state = scanState;
    window.clearTimeout(state.timerId);
    const consumerNumber = extractConsumerNumber(state.buffer, state.billType);

    if (!consumerNumber) {
      stopScanner(false);
      showToast(`Scanned barcode did not match the ${BILL_TYPES[state.billType].buttonText} format. Click the correct button and scan again.`, "error");
      return;
    }

    await fillPaymentFields(state.field, consumerNumber);
    stopScanner(false);
    showToast(BILL_TYPES[state.billType].successText, "success");
  }

  function stopScanner(showCancelledToast) {
    if (!scanState) {
      return;
    }

    window.clearTimeout(scanState.timerId);
    document.removeEventListener("keydown", handleScannerKeydown, true);
    scanState.overlay?.remove();
    scanState = null;
    activeScan = false;

    if (showCancelledToast) {
      showToast("Barcode scanner mode cancelled.", "info");
    }
  }

  function buildScannerOverlay(field, billType) {
    const config = BILL_TYPES[billType];
    const container = document.createElement("div");
    container.id = SCANNER_CONTAINER_ID;
    container.className = "konnect-qr-overlay";

    const panel = document.createElement("div");
    panel.className = "konnect-qr-panel konnect-usb-panel";

    const title = document.createElement("h3");
    const rowText = field.mode === "bulk" ? ` for row ${field.index}` : "";
    title.textContent = `${config.overlayTitle}${rowText}`;

    const help = document.createElement("p");
    help.textContent = config.helpText;

    const target = document.createElement("p");
    target.className = "konnect-usb-target";
    target.textContent = `Target field: ${field.input.id || "Consumer No"}`;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "konnect-qr-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => stopScanner(true));

    panel.append(title, help, target, cancel);
    container.appendChild(panel);

    return { container };
  }

  async function fillPaymentFields(field, consumerNumber) {
    setInputValue(field.input, consumerNumber);

    const defaultMobileNumber = await getDefaultMobileNumber();
    if (!defaultMobileNumber) {
      return;
    }

    const mobileInput = findMobileInput(field);
    if (mobileInput) {
      setInputValue(mobileInput, defaultMobileNumber);
    } else {
      showToast("Consumer number filled, but the mobile number field was not found.", "error");
    }
  }

  async function getDefaultMobileNumber() {
    const syncSettings = await chrome.storage.sync.get(DEFAULT_MOBILE_STORAGE_KEY);
    const syncMobileNumber = String(syncSettings[DEFAULT_MOBILE_STORAGE_KEY] || "").trim();
    if (syncMobileNumber) {
      return syncMobileNumber;
    }

    const localSettings = await chrome.storage.local.get(DEFAULT_MOBILE_STORAGE_KEY);
    const localMobileNumber = String(localSettings[DEFAULT_MOBILE_STORAGE_KEY] || "").trim();
    if (localMobileNumber) {
      return localMobileNumber;
    }

    const response = await chrome.runtime.sendMessage({ type: "GET_DEFAULT_MOBILE_NUMBER" });
    return String(response?.defaultMobileNumber || "").trim();
  }

  function findMobileInput(field) {
    if (field.mode === "bulk") {
      return findBulkMobileInput(field.index);
    }

    return findSingleMobileInput();
  }

  function findBulkMobileInput(index) {
    const exactCandidates = [
      `#txtdepositorno${index}`,
      `#txtDepositorMobile${index}`,
      `#txtDepositMobile${index}`,
      `#txtMobile${index}`,
      `#txtdepositorMobile${index}`,
      `#txtdepositorMobileNumber${index}`,
      `#txtdepositorNumber${index}`
    ];

    for (const selector of exactCandidates) {
      const input = document.querySelector(selector);
      if (input) {
        return input;
      }
    }

    const wrapperCandidate = document.querySelector(`#divdepono${index}, #divdepositormobilenumber${index}`);
    const wrapperInput = wrapperCandidate?.querySelector('input[type="text"], input[type="tel"], input:not([type])');
    if (wrapperInput) {
      return wrapperInput;
    }

    return findInputByLabelText(new RegExp(`Depositor\\s+Mobile\\s+Number\\s+${index}\\b`, "i"));
  }

  function findSingleMobileInput() {
    const exactCandidates = [
      "#txtdepositorno",
      "#txtdepositormobilenumber",
      "#txtDepositorMobileNumber",
      "#txtDepositorMobile",
      "#txtdepositorMobile",
      "#txtMobileNumber",
      "#txtmobilenumber"
    ];

    for (const selector of exactCandidates) {
      const input = document.querySelector(selector);
      if (input) {
        return input;
      }
    }

    const wrapperCandidate = document.querySelector("#divdepono, #divdepositormobilenumber");
    const wrapperInput = wrapperCandidate?.querySelector('input[type="text"], input[type="tel"], input:not([type])');
    if (wrapperInput) {
      return wrapperInput;
    }

    return findInputByLabelText(/Depositor\s+Mobile\s+Number/i);
  }

  function findInputByLabelText(pattern) {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((candidate) => pattern.test(candidate.textContent || ""));
    if (!label) {
      return null;
    }

    const forInput = label.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (forInput) {
      return forInput;
    }

    const parentInput = label.parentElement?.querySelector('input[type="text"], input[type="tel"], input:not([type])');
    if (parentInput) {
      return parentInput;
    }

    const nextContainerInput = label.parentElement?.nextElementSibling?.querySelector?.('input[type="text"], input[type="tel"], input:not([type])');
    return nextContainerInput || null;
  }

  function extractConsumerNumber(rawValue, billType) {
    if (billType === "electricity") {
      return extractElectricityConsumerNumber(rawValue);
    }

    if (billType === "gas") {
      return extractGasConsumerNumber(rawValue);
    }

    return "";
  }

  function extractElectricityConsumerNumber(rawValue) {
    const value = normalizeBarcodeValue(rawValue);
    const alphabetIndex = value.search(/[A-Za-z]/);
    const candidate = alphabetIndex >= 0 ? value.slice(alphabetIndex + 1) : value;
    const consumerNumber = candidate.replace(/\D/g, "").slice(0, 14);

    return /^\d{14}$/.test(consumerNumber) ? consumerNumber : "";
  }

  function extractGasConsumerNumber(rawValue) {
    const digits = String(rawValue || "").replace(/\D/g, "");
    const prefixIndex = digits.indexOf("0300");
    if (prefixIndex < 0) {
      return "";
    }

    const consumerNumber = digits.slice(prefixIndex + 4, prefixIndex + 15);
    return /^\d{11}$/.test(consumerNumber) ? consumerNumber : "";
  }

  function normalizeBarcodeValue(rawValue) {
    return String(rawValue || "").trim().replace(/\s/g, "");
  }

  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `konnect-qr-toast konnect-qr-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4500);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "KONNECT_QR_PING") {
      sendResponse({ ready: true, fields: findConsumerFields().length });
      return false;
    }

    if (message?.type === "KONNECT_QR_INJECT_BUTTONS") {
      sendResponse({ ready: true, fields: injectScanButtons() });
      return false;
    }

    if (message?.type === "KONNECT_QR_START_FIRST_ELECTRICITY_SCAN") {
      startFirstScan("electricity").then(sendResponse);
      return true;
    }

    if (message?.type === "KONNECT_QR_START_FIRST_GAS_SCAN") {
      startFirstScan("gas").then(sendResponse);
      return true;
    }

    return false;
  });

  window[API_NAME] = { init, injectScanButtons, startFirstScan };
  init();
})();
