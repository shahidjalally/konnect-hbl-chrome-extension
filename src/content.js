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
  const USB_SCANNER_CONTAINER_ID = "konnect-usb-scanner-container";
  const BUTTON_CLASS = "konnect-qr-scan-button";
  const USB_BUTTON_CLASS = "konnect-usb-scan-button";
  const FIELD_WRAPPER_CLASS = "konnect-qr-field-wrapper";
  const FIELD_BUTTONS_CLASS = "konnect-qr-field-buttons";
  const DEFAULT_MOBILE_STORAGE_KEY = "defaultMobileNumber";
  const USB_SCAN_IDLE_COMMIT_MS = 250;

  let mediaStream;
  let activeScan = false;
  let observer;
  let usbScanState = null;

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
    if (!field.input || field.input.dataset.konnectQrInjected === "true" || !field.input.parentElement) {
      return;
    }

    const cameraButton = document.createElement("button");
    cameraButton.type = "button";
    cameraButton.className = `${BUTTON_CLASS} konnect-camera-scan-button`;
    cameraButton.textContent = "Camera QR";
    cameraButton.title = "Scan a QR code with the device camera and fill this consumer number field";
    cameraButton.addEventListener("click", () => handleCameraScanClick(field));

    const usbButton = document.createElement("button");
    usbButton.type = "button";
    usbButton.className = `${BUTTON_CLASS} ${USB_BUTTON_CLASS}`;
    usbButton.textContent = "USB Scanner";
    usbButton.title = "Use a plug-and-play USB QR scanner in keyboard-wedge mode for this consumer number field";
    usbButton.addEventListener("click", () => handleUsbScanClick(field));

    const buttons = document.createElement("div");
    buttons.className = FIELD_BUTTONS_CLASS;
    buttons.append(cameraButton, usbButton);

    const wrapper = document.createElement("div");
    wrapper.className = FIELD_WRAPPER_CLASS;

    field.input.dataset.konnectQrInjected = "true";
    field.input.parentElement.insertBefore(wrapper, field.input);
    wrapper.append(field.input, buttons);
  }

  async function handleCameraScanClick(field) {
    if (activeScan) {
      return;
    }

    const license = await requestLicenseValidation();
    if (!license.valid) {
      showToast(license.reason || "License is not valid.", "error");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera access is not available on this page. Please use Chrome on HTTPS and try again.", "error");
      return;
    }

    startCameraScanner(field);
  }

  async function handleUsbScanClick(field) {
    if (activeScan) {
      return;
    }

    const license = await requestLicenseValidation();
    if (!license.valid) {
      showToast(license.reason || "License is not valid.", "error");
      return;
    }

    startUsbScanner(field);
  }

  function requestLicenseValidation() {
    return chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE" });
  }

  async function startFirstCameraScan() {
    const field = getFirstAvailableField();
    if (!field) {
      showToast("No consumer number fields were found on this page.", "error");
      return { started: false, reason: "No consumer number fields were found on this page." };
    }

    await handleCameraScanClick(field);
    return { started: true };
  }

  async function startFirstUsbScan() {
    const field = getFirstAvailableField();
    if (!field) {
      showToast("No consumer number fields were found on this page.", "error");
      return { started: false, reason: "No consumer number fields were found on this page." };
    }

    await handleUsbScanClick(field);
    return { started: true };
  }

  function getFirstAvailableField() {
    const fields = findConsumerFields();
    fields.forEach((field) => injectScanControls(field));
    return fields.find((field) => !String(field.input.value || "").trim()) || fields[0] || null;
  }

  async function startCameraScanner(field) {
    const input = document.getElementById(field.input.id);
    if (!input) {
      showToast("Consumer number field was not found.", "error");
      return;
    }

    activeScan = true;
    const overlay = buildCameraScannerOverlay(field);
    document.body.appendChild(overlay.container);

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      overlay.video.srcObject = mediaStream;
      await overlay.video.play();
      await waitForVideo(overlay.video);

      const detector = await createQrDetector();
      if (!detector) {
        showToast("QR code detection is not supported in this Chrome build. Please update Chrome and try again.", "error");
        stopCameraScanner(overlay.container);
        return;
      }

      await cameraScanLoop(detector, overlay.video, { ...field, input });
    } catch (error) {
      showToast(error?.message || "Unable to start QR scanner.", "error");
      stopCameraScanner(overlay.container);
    }
  }

  function startUsbScanner(field) {
    const input = document.getElementById(field.input.id);
    if (!input) {
      showToast("Consumer number field was not found.", "error");
      return;
    }

    stopUsbScanner(false);
    activeScan = true;

    const overlay = buildUsbScannerOverlay(field);
    usbScanState = {
      buffer: "",
      field: { ...field, input },
      overlay: overlay.container,
      timerId: null
    };

    document.body.appendChild(overlay.container);
    input.focus();
    input.select?.();
    document.addEventListener("keydown", handleUsbScannerKeydown, true);
    showToast("USB scanner is ready. Scan the QR code now.", "info");
  }

  function handleUsbScannerKeydown(event) {
    if (!usbScanState) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      stopUsbScanner(true);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      commitUsbScannerBuffer();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      usbScanState.buffer = "";
      scheduleUsbScannerCommit();
      return;
    }

    if (event.key?.length === 1) {
      event.preventDefault();
      usbScanState.buffer += event.key;
      scheduleUsbScannerCommit();
    }
  }

  function scheduleUsbScannerCommit() {
    window.clearTimeout(usbScanState?.timerId);
    if (!usbScanState) {
      return;
    }

    usbScanState.timerId = window.setTimeout(commitUsbScannerBuffer, USB_SCAN_IDLE_COMMIT_MS);
  }

  async function commitUsbScannerBuffer() {
    if (!usbScanState) {
      return;
    }

    const state = usbScanState;
    window.clearTimeout(state.timerId);
    const consumerNumber = extractConsumerNumber(state.buffer);

    if (!consumerNumber) {
      stopUsbScanner(false);
      showToast("USB scan did not contain a valid consumer number. Click USB Scanner and scan again.", "error");
      return;
    }

    await fillPaymentFields(state.field, consumerNumber);
    stopUsbScanner(false);
    showToast("USB QR scan filled consumer and mobile number successfully.", "success");
  }

  function stopUsbScanner(showCancelledToast) {
    if (!usbScanState) {
      return;
    }

    window.clearTimeout(usbScanState.timerId);
    document.removeEventListener("keydown", handleUsbScannerKeydown, true);
    usbScanState.overlay?.remove();
    usbScanState = null;
    activeScan = false;

    if (showCancelledToast) {
      showToast("USB scanner mode cancelled.", "info");
    }
  }

  function waitForVideo(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      window.setTimeout(resolve, 1200);
    });
  }

  async function createQrDetector() {
    if (!("BarcodeDetector" in window)) {
      return null;
    }

    const supportedFormats = await BarcodeDetector.getSupportedFormats();
    if (!supportedFormats.includes("qr_code")) {
      return null;
    }

    return new BarcodeDetector({ formats: ["qr_code"] });
  }

  function buildCameraScannerOverlay(field) {
    const container = document.createElement("div");
    container.id = SCANNER_CONTAINER_ID;
    container.className = "konnect-qr-overlay";

    const panel = document.createElement("div");
    panel.className = "konnect-qr-panel";

    const title = document.createElement("h3");
    title.textContent = field.mode === "bulk" ? `Scan Consumer Number ${field.index} QR Code` : "Scan Consumer Number QR Code";

    const help = document.createElement("p");
    help.textContent = "Point your camera at the QR code. The detected consumer number will be inserted automatically.";

    const video = document.createElement("video");
    video.className = "konnect-qr-video";
    video.setAttribute("playsinline", "true");
    video.muted = true;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "konnect-qr-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => stopCameraScanner(container));

    panel.append(title, help, video, cancel);
    container.appendChild(panel);

    return { container, video };
  }

  function buildUsbScannerOverlay(field) {
    const container = document.createElement("div");
    container.id = USB_SCANNER_CONTAINER_ID;
    container.className = "konnect-qr-overlay konnect-usb-overlay";

    const panel = document.createElement("div");
    panel.className = "konnect-qr-panel konnect-usb-panel";

    const title = document.createElement("h3");
    title.textContent = field.mode === "bulk" ? `USB Scanner Ready for Consumer ${field.index}` : "USB Scanner Ready";

    const help = document.createElement("p");
    help.textContent = "Keep this page active and scan with your plug-and-play USB QR scanner. Press Esc or Cancel to stop.";

    const target = document.createElement("p");
    target.className = "konnect-usb-target";
    target.textContent = `Target field: ${field.input.id}`;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "konnect-qr-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => stopUsbScanner(true));

    panel.append(title, help, target, cancel);
    container.appendChild(panel);

    return { container };
  }

  async function cameraScanLoop(detector, video, field) {
    if (!activeScan) {
      return;
    }

    const overlay = document.getElementById(SCANNER_CONTAINER_ID);
    if (!overlay) {
      activeScan = false;
      return;
    }

    try {
      const barcodes = await detector.detect(video);
      const rawValue = barcodes[0]?.rawValue;

      if (rawValue) {
        const consumerNumber = extractConsumerNumber(rawValue);
        if (consumerNumber) {
          await fillPaymentFields(field, consumerNumber);
          showToast("Consumer and mobile number filled successfully.", "success");
          stopCameraScanner(overlay);
          return;
        }
      }
    } catch (_error) {
      // Continue scanning; transient detector failures are common while the video is warming up.
    }

    requestAnimationFrame(() => cameraScanLoop(detector, video, field));
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
    const settings = await chrome.storage.sync.get(DEFAULT_MOBILE_STORAGE_KEY);
    return String(settings[DEFAULT_MOBILE_STORAGE_KEY] || "").trim();
  }

  function findMobileInput(field) {
    if (field.mode === "bulk") {
      return findBulkMobileInput(field.index);
    }

    return findSingleMobileInput();
  }

  function findBulkMobileInput(index) {
    const exactCandidates = [
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

  function extractConsumerNumber(rawValue) {
    const digits = String(rawValue).match(/\d{8,20}/g) || [];
    const preferred = digits.find((value) => value.length === 14) || digits[0];
    return preferred || "";
  }

  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function stopCameraScanner(container) {
    activeScan = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    container?.remove();
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

    if (message?.type === "KONNECT_QR_START_FIRST_SCAN") {
      startFirstCameraScan().then(sendResponse);
      return true;
    }

    if (message?.type === "KONNECT_QR_START_FIRST_USB_SCAN") {
      startFirstUsbScan().then(sendResponse);
      return true;
    }

    return false;
  });

  window[API_NAME] = { init, injectScanButtons, startFirstCameraScan, startFirstUsbScan };
  init();
})();
