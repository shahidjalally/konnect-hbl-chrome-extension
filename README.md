# Konnect HBL Consumer QR Scanner Chrome Extension

This Chrome extension injects a **Scan QR Code** button beside the Konnect HBL OTC Bill Payment consumer number field found at:

```text
https://konnecthbl.com/AGENT-PORTAL/Transactions/Billpayment
```

The single payment target field is selected with the provided XPath-equivalent CSS selector:

```text
#txtconsumernumber
```

The bulk payment page is also supported. Bulk consumer fields are detected by IDs such as:

```text
#txtConsumer1
#txtConsumer2
#txtConsumer3
```

## Features

- Adds a **Scan QR Code** button next to the single bill payment consumer number field.
- Adds **Scan QR Code** buttons next to bulk bill payment consumer number fields like `#txtConsumer1`, `#txtConsumer2`, `#txtConsumer3`, and so on.
- Adds a toolbar popup with an **Inject scan controls** action for pages that were already open when the extension was installed or reloaded.
- Injects both **Camera QR** and **USB Scanner** controls beside each consumer field.
- Opens a camera scanner overlay when **Camera QR** is pressed.
- Starts keyboard-wedge capture mode when **USB Scanner** is pressed, so plug-and-play USB QR scanners can type the scanned payload into the selected row.
- Reads camera QR codes through Chrome's native `BarcodeDetector` API.
- Extracts a consumer number from the QR payload and fills the selected consumer field.
- Fills the depositor mobile number field with the default mobile number configured in the extension options page.
- Dispatches `input` and `change` events so the website can detect the filled values.
- Validates a license key against a remotely hosted JSON file before the scanner opens.

## Remote license control through GitHub

The extension validates licenses from `licenses/licenses.json`. After this repository is pushed to GitHub, use the raw file URL as the extension's **Remote license URL** in the options page:

```text
https://raw.githubusercontent.com/<github-user-or-org>/konnect-hbl-chrome-extension/<branch>/licenses/licenses.json
```

To revoke a customer, set that license entry's `enabled` field to `false` or remove the license entry and commit the file. To expire a customer, set `expiresAt` to a past ISO date.

Example license entry:

```json
{
  "key": "KONNECT-DEMO-001",
  "holder": "Demo License",
  "enabled": true,
  "expiresAt": "2027-06-06T23:59:59Z",
  "allowedDomains": ["konnecthbl.com"],
  "message": "Demo license is active."
}
```

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open the extension **Details** page and then **Extension options**.
6. Enter a license key, default depositor mobile number, and the raw GitHub license URL.
7. If a bill payment page was already open, reload it or click the extension toolbar icon and press **Inject scan controls**.
8. For a plug-and-play USB QR scanner, click **USB Scanner** beside the target consumer field, keep the page active, and scan the QR code with the USB device. The extension captures the scanner keyboard input, extracts the consumer number, fills the selected consumer field, and fills the matching depositor mobile number.

## Browser requirements

Camera scanning uses Chrome's native `BarcodeDetector` API for QR code detection. If an older Chrome build does not support QR code detection, the extension will show an error asking the user to update Chrome.

USB scanner mode supports plug-and-play scanners that behave like a keyboard, also called keyboard-wedge mode. Configure the scanner to send the QR payload followed by Enter or Tab for the fastest completion; the extension also commits a scan after a short idle pause.
