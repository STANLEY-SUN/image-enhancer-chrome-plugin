# Real-ESRGAN Backend API (Optional)

Use this service if you want Chrome extension output to match the current fidelity-first pipeline.

## Endpoint

- `GET /health`
- `POST /enhance`
- multipart form fields:
  - `image` (required file)
  - `scale` (`2` or `4`)
  - `mode` (`fidelity`, `balanced`, `sharp`)
- response: enhanced image (`image/png`)
- optional auth:
  - set env `ENHANCER_API_KEY=your_secret`
  - client sends `Authorization: Bearer your_secret` or `X-API-Key: your_secret`
- optional stability mode:
  - `ENABLE_FACE_ENHANCE=0` (recommended on small cloud instances)
  - `ENABLE_FACE_ENHANCE=1` enables GFPGAN face restoration (higher memory usage)

## Start service

```bash
source .venv-realesrgan/bin/activate
pip install fastapi uvicorn python-multipart
export ENHANCER_API_KEY=your_secret_key
export ENABLE_FACE_ENHANCE=0
uvicorn server.realesrgan_api:app --host 127.0.0.1 --port 8765
```

Then keep extension backend endpoint as:

`http://127.0.0.1:8765/enhance`

## Run backend in background (recommended)

From project root:

```bash
./scripts/start-backend.sh
./scripts/status-backend.sh
./scripts/stop-backend.sh
```

If you close terminal after `start-backend.sh`, backend keeps running in background.

## Cloud deployment (always-online)

Deploy this API to a GPU runtime (RunPod / Modal / Replicate / self-hosted GPU VM).
Railway quickstart is available in:

`DEPLOY_RAILWAY.md`

Required runtime env:

```bash
ENHANCER_API_KEY=your_secret_key
```

Extension settings:

- `Backend mode` -> `Cloud only (always online)`
- `Backend endpoint` -> `https://your-domain/enhance`
- `API key` -> your `ENHANCER_API_KEY`
