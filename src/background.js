importScripts("config.js");

const STORAGE_KEYS = {
  licenseKey: "licenseKey",
  licenseEndpoint: "licenseEndpoint",
  cachedLicense: "cachedLicense",
  cachedAt: "cachedLicenseValidatedAt",
  deviceId: "deviceId",
  defaultMobileNumber: "defaultMobileNumber"
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VALIDATE_LICENSE") {
    validateLicense(sender.tab?.url)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          valid: false,
          reason: "License validation failed.",
          details: error?.message || String(error)
        });
      });

    return true;
  }

  if (message?.type === "GET_DEVICE_ID") {
    getOrCreateDeviceId().then((deviceId) => sendResponse({ deviceId }));
    return true;
  }

  if (message?.type === "GET_DEFAULT_MOBILE_NUMBER") {
    getDefaultMobileNumber().then((defaultMobileNumber) => sendResponse({ defaultMobileNumber }));
    return true;
  }

  return false;
});

async function validateLicense(pageUrl) {
  const deviceId = await getOrCreateDeviceId();
  const settings = await chrome.storage.sync.get([
    STORAGE_KEYS.licenseKey,
    STORAGE_KEYS.licenseEndpoint,
    STORAGE_KEYS.cachedLicense,
    STORAGE_KEYS.cachedAt
  ]);

  const licenseKey = normalizeLicenseKey(settings[STORAGE_KEYS.licenseKey]);
  if (!licenseKey) {
    return {
      valid: false,
      deviceId,
      reason: `Please set a license key from the extension options page. Device ID: ${deviceId}`
    };
  }

  const endpoint = settings[STORAGE_KEYS.licenseEndpoint] || DEFAULT_LICENSE_ENDPOINT;
  const cached = settings[STORAGE_KEYS.cachedLicense];
  const cachedAt = Number(settings[STORAGE_KEYS.cachedAt] || 0);
  const cacheAgeMs = Date.now() - cachedAt;

  if (cached && cacheAgeMs < DEFAULT_LICENSE_CACHE_MINUTES * 60 * 1000) {
    const cachedResult = evaluateLicense(cached, licenseKey, pageUrl, deviceId);
    if (cachedResult.valid) {
      return { ...cachedResult, source: "cache" };
    }
  }

  const licenseFile = await fetchLicenseFile(endpoint);
  await chrome.storage.sync.set({
    [STORAGE_KEYS.cachedLicense]: licenseFile,
    [STORAGE_KEYS.cachedAt]: Date.now()
  });

  return { ...evaluateLicense(licenseFile, licenseKey, pageUrl, deviceId), source: "remote" };
}

async function getOrCreateDeviceId() {
  const existing = await chrome.storage.local.get(STORAGE_KEYS.deviceId);
  const existingDeviceId = String(existing[STORAGE_KEYS.deviceId] || "").trim();
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

  const hex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0"));
  const deviceId = [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-").toUpperCase();

  await chrome.storage.local.set({ [STORAGE_KEYS.deviceId]: deviceId });
  return deviceId;
}

async function getDefaultMobileNumber() {
  const syncSettings = await chrome.storage.sync.get(STORAGE_KEYS.defaultMobileNumber);
  const syncMobileNumber = String(syncSettings[STORAGE_KEYS.defaultMobileNumber] || "").trim();
  if (syncMobileNumber) {
    return syncMobileNumber;
  }

  const localSettings = await chrome.storage.local.get(STORAGE_KEYS.defaultMobileNumber);
  return String(localSettings[STORAGE_KEYS.defaultMobileNumber] || "").trim();
}

async function fetchLicenseFile(endpoint) {
  if (isPlaceholderEndpoint(endpoint)) {
    return fetchBundledLicenseFile();
  }

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    const bundledLicenseFile = await fetchBundledLicenseFile();
    bundledLicenseFile.fallbackReason = error?.message || String(error);
    return bundledLicenseFile;
  }
}

async function fetchBundledLicenseFile() {
  const response = await fetch(chrome.runtime.getURL("licenses/licenses.json"));
  if (!response.ok) {
    throw new Error(`Unable to fetch bundled license file: HTTP ${response.status}`);
  }

  return response.json();
}

function isPlaceholderEndpoint(endpoint) {
  return !endpoint || endpoint.includes("YOUR_GITHUB_USERNAME");
}

function evaluateLicense(licenseFile, licenseKey, pageUrl, deviceId) {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const licenses = Array.isArray(licenseFile?.licenses) ? licenseFile.licenses : [];
  const license = licenses.find((entry) => normalizeLicenseKey(entry.key) === normalizedKey);

  if (!license) {
    return { valid: false, deviceId, reason: "License key was not found in the remote license file." };
  }

  if (license.enabled !== true) {
    return { valid: false, deviceId, reason: license.message || "License is disabled." };
  }

  if (license.expiresAt && Date.parse(license.expiresAt) < Date.now()) {
    return { valid: false, deviceId, reason: "License has expired." };
  }

  const allowedDeviceIds = Array.isArray(license.allowedDeviceIds)
    ? license.allowedDeviceIds.map(normalizeDeviceId).filter(Boolean)
    : [];
  if (!allowedDeviceIds.includes(normalizedDeviceId)) {
    return {
      valid: false,
      deviceId,
      reason: `This browser is not activated for this license. Send this Device ID for approval: ${deviceId}`
    };
  }

  if (Array.isArray(license.allowedDomains) && license.allowedDomains.length > 0) {
    const hostname = safeHostname(pageUrl);
    const allowed = license.allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (!allowed) {
      return { valid: false, deviceId, reason: "License is not enabled for this website." };
    }
  }

  return {
    valid: true,
    deviceId,
    holder: license.holder || "Licensed user",
    reason: license.message || "License and device validated."
  };
}

function normalizeLicenseKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toUpperCase();
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return "";
  }
}
