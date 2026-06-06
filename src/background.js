importScripts("config.js");

const STORAGE_KEYS = {
  licenseKey: "licenseKey",
  licenseEndpoint: "licenseEndpoint",
  cachedLicense: "cachedLicense",
  cachedAt: "cachedLicenseValidatedAt"
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "VALIDATE_LICENSE") {
    return false;
  }

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
});

async function validateLicense(pageUrl) {
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
      reason: "Please set a license key from the extension options page."
    };
  }

  const endpoint = settings[STORAGE_KEYS.licenseEndpoint] || DEFAULT_LICENSE_ENDPOINT;
  const cached = settings[STORAGE_KEYS.cachedLicense];
  const cachedAt = Number(settings[STORAGE_KEYS.cachedAt] || 0);
  const cacheAgeMs = Date.now() - cachedAt;

  if (cached && cacheAgeMs < DEFAULT_LICENSE_CACHE_MINUTES * 60 * 1000) {
    const cachedResult = evaluateLicense(cached, licenseKey, pageUrl);
    if (cachedResult.valid) {
      return { ...cachedResult, source: "cache" };
    }
  }

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to fetch license file: HTTP ${response.status}`);
  }

  const licenseFile = await response.json();
  await chrome.storage.sync.set({
    [STORAGE_KEYS.cachedLicense]: licenseFile,
    [STORAGE_KEYS.cachedAt]: Date.now()
  });

  return { ...evaluateLicense(licenseFile, licenseKey, pageUrl), source: "remote" };
}

function evaluateLicense(licenseFile, licenseKey, pageUrl) {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  const licenses = Array.isArray(licenseFile?.licenses) ? licenseFile.licenses : [];
  const license = licenses.find((entry) => normalizeLicenseKey(entry.key) === normalizedKey);

  if (!license) {
    return { valid: false, reason: "License key was not found in the remote license file." };
  }

  if (license.enabled !== true) {
    return { valid: false, reason: license.message || "License is disabled." };
  }

  if (license.expiresAt && Date.parse(license.expiresAt) < Date.now()) {
    return { valid: false, reason: "License has expired." };
  }

  if (Array.isArray(license.allowedDomains) && license.allowedDomains.length > 0) {
    const hostname = safeHostname(pageUrl);
    const allowed = license.allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (!allowed) {
      return { valid: false, reason: "License is not enabled for this website." };
    }
  }

  return {
    valid: true,
    holder: license.holder || "Licensed user",
    reason: license.message || "License validated."
  };
}

function normalizeLicenseKey(value) {
  return String(value || "").trim().toUpperCase();
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return "";
  }
}
