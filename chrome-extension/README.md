# Image Enhancer Pro (Chrome Extension)

## What this package does

- Drag/drop or select local images in popup.
- 2x / 4x upscaling.
- Fidelity / Balanced / Sharp modes.
- Before/after compare slider.
- One-click download.
- Right-click image on page -> "Enhance this image".
- Backend diagnostics in Advanced: Test Backend + Auto Detect Local Backend.
- Backend modes: Auto / Cloud only / Local only.

## Enhancement engine behavior

1. Backend mode controls endpoint strategy:
   - `Cloud only`: use configured endpoint only (best for always-online).
   - `Local only`: use local endpoint candidates.
   - `Auto`: try configured endpoint first, then local candidates.
2. Local fallback is optional and disabled by default because quality is lower.
3. If fallback is disabled and backend is unavailable, extension shows an error.

Backend request contract:

- Method: `POST`
- Content-Type: `multipart/form-data`
- Fields:
  - `image` (file)
  - `scale` (`2` or `4`)
  - `mode` (`fidelity`, `balanced`, `sharp`)
- Optional headers:
  - `Authorization: Bearer <api_key>`
  - `X-API-Key: <api_key>`
- Response: enhanced image binary (`image/png` or `image/jpeg`)

## Package for Chrome Web Store

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click "Load unpacked" and select this `chrome-extension` folder for local test.
4. For upload package, zip folder contents with `manifest.json` at zip root.
