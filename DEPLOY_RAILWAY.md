# Railway Deployment (Always Online Backend)

This guide publishes the image enhancer backend and gives you a public endpoint for the Chrome plugin.

## 1) Push project to GitHub

Railway deploys from a GitHub repository.

## 2) Create Railway service

1. Open Railway dashboard.
2. Click `New Project` -> `Deploy from GitHub repo`.
3. Select this repo.
4. Railway will detect `Dockerfile` at repo root and build it.

If you previously had failed builds, open `Deployments` and click `Redeploy` after pulling latest `main`.

## 3) Set environment variables

In Railway service settings, add:

- `ENHANCER_API_KEY` = a strong secret key you choose

Optional:

- `PORT` is provided by Railway automatically; do not hardcode it.

## 4) Generate public domain

1. Open `Settings` -> `Networking`.
2. Under `Public Networking`, click `Generate Domain`.
3. You will get a URL like:
   - `https://your-service.up.railway.app`

## 5) Verify backend is alive

Open:

- `https://your-service.up.railway.app/health`

Expected response includes `status: ok`.

## 6) Fill Chrome plugin fields

In extension `Advanced`:

- `Backend mode`: `Cloud only (always online)`
- `Backend endpoint`: `https://your-service.up.railway.app/enhance`
- `API key`: same value as `ENHANCER_API_KEY`
- Keep `Allow local fallback` unchecked for best quality consistency.

Then click `Test Backend` and run enhancement.

## Notes

- First enhancement request can be slow because model weights may download on first run.
- If you rotate API key in Railway, update plugin `API key` too.
- Railway `Private Networking` warnings are expected if your service is not yet successfully deployed.
- If build fails at pip install, ensure your deployment is using the latest Dockerfile in `main`.
