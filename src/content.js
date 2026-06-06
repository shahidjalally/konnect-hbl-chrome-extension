const SINGLE_CONSUMER_SELECTOR = "#txtconsumernumber";
const BULK_CONSUMER_ID_PATTERN = /^txtConsumer(\d+)$/;
const SCANNER_CONTAINER_ID = "konnect-qr-scanner-container";
const BUTTON_CLASS = "konnect-qr-scan-button";
const FIELD_WRAPPER_CLASS = "konnect-qr-field-wrapper";
const DEFAULT_MOBILE_STORAGE_KEY = "defaultMobileNumber";

let mediaStream;
let activeScan = false;

function init() {
  injectScanButtons();

  const observer = new MutationObserver(() => injectScanButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function injectScanButtons() {
  findConsumerFields().forEach((field) => injectScanButton(field));
}

function findConsumerFields() {
  const fields = [];
  const singleConsumerInput = document.querySelector(SINGLE_CONSUMER_SELECTOR);

  if (singleConsumerInput) {
    fields.push({ input: singleConsumerInput, mode: "single" });
  }

  document.querySelectorAll('input[id^="txtConsumer"]').forEach((input) => {
    const match = input.id.match(BULK_CONSUMER_ID_PATTERN);
    if (match) {
      fields.push({ input, mode: "bulk", index: match[1] });
    }
  });

  return fields;
}

function injectScanButton(field) {
  if (!field.input || field.input.dataset.konnectQrInjected === "true") {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.textContent = "Scan QR Code";
  button.addEventListener("click", () => handleScanClick(field));

  const wrapper = document.createElement("div");
  wrapper.className = FIELD_WRAPPER_CLASS;

  field.input.dataset.konnectQrInjected = "true";
  field.input.parentElement.insertBefore(wrapper, field.input);
  wrapper.append(field.input, button);
}

async function handleScanClick(field) {
  if (activeScan) {
    return;
  }

  const license = await requestLicenseValidation();
  if (!license.valid) {
    showToast(license.reason || "License is not valid.", "error");
    return;
  }

  if (!("BarcodeDetector" in window)) {
    showToast("QR scanner is not available in this Chrome build. Please update Chrome and try again.", "error");
    return;
  }

  const supportedFormats = await BarcodeDetector.getSupportedFormats();
  if (!supportedFormats.includes("qr_code")) {
    showToast("QR code detection is not supported in this Chrome build.", "error");
    return;
  }

  startScanner(field);
}

function requestLicenseValidation() {
  return chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE" });
}

async function startScanner(field) {
  const input = document.getElementById(field.input.id);
  if (!input) {
    showToast("Consumer number field was not found.", "error");
    return;
  }

  activeScan = true;
  const overlay = buildScannerOverlay(field);
  document.body.appendChild(overlay.container);

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    overlay.video.srcObject = mediaStream;
    await overlay.video.play();

    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    await scanLoop(detector, overlay.video, { ...field, input });
  } catch (error) {
    showToast(error?.message || "Unable to start QR scanner.", "error");
    stopScanner(overlay.container);
  }
}

function buildScannerOverlay(field) {
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
  cancel.addEventListener("click", () => stopScanner(container));

  panel.append(title, help, video, cancel);
  container.appendChild(panel);

  return { container, video };
}

async function scanLoop(detector, video, field) {
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
        stopScanner(overlay);
        return;
      }
    }
  } catch (_error) {
    // Continue scanning; transient detector failures are common while the video is warming up.
  }

  requestAnimationFrame(() => scanLoop(detector, video, field));
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

function stopScanner(container) {
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

init();
