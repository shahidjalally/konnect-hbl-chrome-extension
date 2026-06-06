const SUPPORTED_PAGE_PATTERN = /^https?:\/\/([^/]+\.)?konnecthbl\.com\//i;

const statusText = document.getElementById("status");
const injectButtonsButton = document.getElementById("injectButtons");
const electricityScanFirstButton = document.getElementById("electricityScanFirst");
const gasScanFirstButton = document.getElementById("gasScanFirst");
const openOptionsButton = document.getElementById("openOptions");

injectButtonsButton.addEventListener("click", () => runOnCurrentTab("KONNECT_QR_INJECT_BUTTONS"));
electricityScanFirstButton.addEventListener("click", () => runOnCurrentTab("KONNECT_QR_START_FIRST_ELECTRICITY_SCAN"));
gasScanFirstButton.addEventListener("click", () => runOnCurrentTab("KONNECT_QR_START_FIRST_GAS_SCAN"));
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

updateInitialStatus();

async function updateInitialStatus() {
  const tab = await getActiveTab();
  if (!isSupportedTab(tab)) {
    statusText.textContent = "This page is not a supported Konnect HBL page.";
    return;
  }

  statusText.textContent = "Ready. Inject controls, then use Electricity or Gas Bill beside a consumer field.";
}

async function runOnCurrentTab(type) {
  const tab = await getActiveTab();
  if (!isSupportedTab(tab)) {
    statusText.textContent = "Open a Konnect HBL Billpayment or BulkBillpayment page first.";
    return;
  }

  setBusy(true);
  try {
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type });
    if (type === "KONNECT_QR_INJECT_BUTTONS") {
      statusText.textContent = response?.fields
        ? `Injected scan controls for ${response.fields} consumer field(s).`
        : "No consumer number fields were found on this page.";
    } else if (type === "KONNECT_QR_START_FIRST_ELECTRICITY_SCAN") {
      statusText.textContent = response?.started === false
        ? response.reason
        : "Electricity scanner mode is ready on the page. Scan with the USB device now.";
    } else {
      statusText.textContent = response?.started === false
        ? response.reason
        : "Gas scanner mode is ready on the page. Scan with the USB device now.";
    }
  } catch (error) {
    statusText.textContent = error?.message || "Unable to control this page. Reload it and try again.";
  } finally {
    setBusy(false);
  }
}

async function ensureContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId, allFrames: true },
    files: ["src/styles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["src/content.js"]
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupportedTab(tab) {
  return Boolean(tab?.url && SUPPORTED_PAGE_PATTERN.test(tab.url));
}

function setBusy(isBusy) {
  injectButtonsButton.disabled = isBusy;
  electricityScanFirstButton.disabled = isBusy;
  gasScanFirstButton.disabled = isBusy;
}
