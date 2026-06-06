const licenseKeyInput = document.getElementById("licenseKey");
const licenseEndpointInput = document.getElementById("licenseEndpoint");
const defaultMobileNumberInput = document.getElementById("defaultMobileNumber");
const deviceIdInput = document.getElementById("deviceId");
const saveButton = document.getElementById("save");
const copyActivationRequestButton = document.getElementById("copyActivationRequest");
const openActivationRequestButton = document.getElementById("openActivationRequest");
const statusText = document.getElementById("status");

loadSettings();
saveButton.addEventListener("click", saveSettings);
copyActivationRequestButton.addEventListener("click", copyActivationRequest);
openActivationRequestButton.addEventListener("click", openActivationRequest);

async function loadSettings() {
  const [settings, localSettings, device] = await Promise.all([
    chrome.storage.sync.get(["licenseKey", "licenseEndpoint", "defaultMobileNumber"]),
    chrome.storage.local.get("defaultMobileNumber"),
    chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" })
  ]);

  licenseKeyInput.value = settings.licenseKey || "";
  licenseEndpointInput.value = settings.licenseEndpoint || DEFAULT_LICENSE_ENDPOINT;
  defaultMobileNumberInput.value = settings.defaultMobileNumber || localSettings.defaultMobileNumber || "";
  deviceIdInput.value = device.deviceId || "";
}

async function saveSettings() {
  const defaultMobileNumber = defaultMobileNumberInput.value.trim();

  await Promise.all([
    chrome.storage.sync.set({
      licenseKey: licenseKeyInput.value.trim(),
      defaultMobileNumber,
      licenseEndpoint: licenseEndpointInput.value.trim() || DEFAULT_LICENSE_ENDPOINT,
      cachedLicense: null,
      cachedLicenseValidatedAt: 0
    }),
    chrome.storage.local.set({ defaultMobileNumber })
  ]);

  showStatus("Settings saved.");
}

async function copyActivationRequest() {
  const requestText = buildActivationRequestText();
  await navigator.clipboard.writeText(requestText);
  showStatus("Activation request copied.");
}

function openActivationRequest() {
  const title = encodeURIComponent(`Activate Konnect HBL extension device ${deviceIdInput.value}`);
  const body = encodeURIComponent(buildActivationRequestText());
  const separator = DEFAULT_ACTIVATION_REQUEST_URL.includes("?") ? "&" : "?";
  chrome.tabs.create({ url: `${DEFAULT_ACTIVATION_REQUEST_URL}${separator}title=${title}&body=${body}` });
}

function buildActivationRequestText() {
  const licenseKey = licenseKeyInput.value.trim() || "<enter license key>";
  const deviceId = deviceIdInput.value.trim() || "<device id unavailable>";

  return [
    "Konnect HBL Chrome extension activation request",
    "",
    `License key: ${licenseKey}`,
    `Device ID: ${deviceId}`,
    "",
    "Add this Device ID to the matching license entry in licenses/licenses.json:",
    "",
    '"allowedDeviceIds": [',
    `  "${deviceId}"`,
    "]"
  ].join("\n");
}

function showStatus(message) {
  statusText.textContent = message;
  window.setTimeout(() => {
    statusText.textContent = "";
  }, 2500);
}
