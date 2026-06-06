const licenseKeyInput = document.getElementById("licenseKey");
const licenseEndpointInput = document.getElementById("licenseEndpoint");
const defaultMobileNumberInput = document.getElementById("defaultMobileNumber");
const saveButton = document.getElementById("save");
const statusText = document.getElementById("status");

loadSettings();
saveButton.addEventListener("click", saveSettings);

async function loadSettings() {
  const settings = await chrome.storage.sync.get(["licenseKey", "licenseEndpoint", "defaultMobileNumber"]);
  licenseKeyInput.value = settings.licenseKey || "";
  licenseEndpointInput.value = settings.licenseEndpoint || DEFAULT_LICENSE_ENDPOINT;
  defaultMobileNumberInput.value = settings.defaultMobileNumber || "";
}

async function saveSettings() {
  await chrome.storage.sync.set({
    licenseKey: licenseKeyInput.value.trim(),
    defaultMobileNumber: defaultMobileNumberInput.value.trim(),
    licenseEndpoint: licenseEndpointInput.value.trim() || DEFAULT_LICENSE_ENDPOINT,
    cachedLicense: null,
    cachedLicenseValidatedAt: 0
  });

  statusText.textContent = "Settings saved.";
  window.setTimeout(() => {
    statusText.textContent = "";
  }, 2500);
}
