# Konnect HBL Consumer Barcode Scanner Chrome Extension

This Chrome extension injects exactly two plug-and-play USB barcode scanner buttons beside each Konnect HBL consumer number field:

- **Electricity Bill** for WAPDA/electricity barcodes.
- **Gas Bill** for SNGPL/gas barcodes.

Supported pages include:

```text
https://konnecthbl.com/AGENT-PORTAL/Transactions/Billpayment
https://www.konnecthbl.com/AGENT-PORTAL/Transactions/Billpayment
https://konnecthbl.com/AGENT-PORTAL/Transactions/BulkBillpayment
https://www.konnecthbl.com/AGENT-PORTAL/Transactions/BulkBillpayment
```

The single payment target field is detected from common Konnect HBL consumer-number IDs such as `#txtconsumernumber`, `#txtConsumerNumber`, and label/name fallbacks containing “consumer number”. Bulk consumer fields are detected by IDs such as `#txtConsumer1`, `#txtConsumer2`, `#txtConsumer3`, and so on.

## Barcode parsing

- **Electricity Bill / WAPDA**: skips the very first barcode character and extracts the next 14 digits.
  - Example barcode: `E181564110252121225120126000002303000002511150126`
  - Filled consumer number: `18156411025212`
- **Gas Bill / SNGPL**: skips/excludes the first 4 barcode digits and extracts the next 11 digits.
  - Example barcode: `0300047473338490042600000040626000000094000009003`
  - Filled consumer number: `04747333849`

## Features

- Adds exactly two buttons next to each single or bulk consumer number field: **Electricity Bill** and **Gas Bill**.
- Uses plug-and-play USB scanners that behave like keyboards, also called keyboard-wedge scanners.
- Captures scanner input after the matching button is clicked, then commits on Enter, Tab, or a short idle pause.
- Extracts the correct consumer number for the selected bill type and fills the selected consumer field.
- Fills the depositor mobile number field with the default mobile number configured in the extension options page.
- Dispatches `input` and `change` events so the Konnect HBL page detects the filled values.
- Adds a toolbar popup with an **Inject scan controls** action for pages that were already open when the extension was installed or reloaded.
- Validates a license key and browser-specific Device ID against a remotely hosted JSON file before scanner mode starts.

## Device-bound remote license control through GitHub

The extension generates a random Device ID and stores it in `chrome.storage.local`, which binds approval to the current Chrome profile on one laptop/browser installation. Chrome extensions cannot safely read a real machine serial number, and they should not embed a GitHub write token because users could extract it. Instead, the extension shows/copies an activation request from the options page.

Activation flow:

1. Install the extension and open **Extension options**.
2. Copy the generated **Device ID** or click **Open GitHub request**.
3. Add that Device ID to the matching entry in `licenses/licenses.json` under `allowedDeviceIds`.
4. Commit/push the updated JSON file to GitHub.
5. The extension works only when the license key is enabled and the local Device ID is present in `allowedDeviceIds`.

Example license entry:

```json
{
  "key": "CUSTOMER-001",
  "holder": "Customer 001",
  "enabled": true,
  "expiresAt": "2027-06-06T23:59:59Z",
  "allowedDomains": ["konnecthbl.com"],
  "allowedDeviceIds": ["PASTE-CUSTOMER-DEVICE-ID-HERE"],
  "message": "Customer 001 is active."
}
```

The extension validates licenses from `licenses/licenses.json`. After this repository is pushed to GitHub, use the raw file URL as the extension's **Remote license URL** in the options page:

```text
https://raw.githubusercontent.com/<github-user-or-org>/konnect-hbl-chrome-extension/<branch>/extension/licenses/licenses.json
```

To revoke a customer, set that license entry's `enabled` field to `false`, remove the license entry, remove the Device ID from `allowedDeviceIds`, or set `expiresAt` to a past ISO date.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this repository.
5. Open the extension **Details** page and then **Extension options**.
6. Enter a license key, default depositor mobile number, and the raw GitHub license URL.
7. Copy the Device ID from options and add it to `allowedDeviceIds` for that license in GitHub.
8. If a bill payment page was already open, reload it or click the extension toolbar icon and press **Inject scan controls**.
9. Click **Electricity Bill** or **Gas Bill** beside the target consumer field, keep the page active, and scan the barcode with the USB device.

## USB scanner requirements

Use a plug-and-play scanner configured as a keyboard-wedge device. Configure it to send the barcode payload followed by Enter or Tab for the fastest completion; the extension also commits a scan after a short idle pause.

## Injection troubleshooting

- The manifest runs on all `konnecthbl.com` paths and all frames, then the content script injects controls only when it finds consumer-number inputs.
- If a Konnect page was already open when you loaded or reloaded the extension, reload the page or use the toolbar popup's **Inject scan controls** button.
- If you previously loaded an older version and see old **Camera QR** / **USB Scanner** buttons, reload the Konnect page after reloading this extension in `chrome://extensions`.
