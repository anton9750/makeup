# Blush Studio

A 3D cheek-colour try-on game built with React, three.js (via @react-three/fiber) and Vite.

```bash
npm install
npm run dev
```

## How to play
1. Click the makeup case. The lid springs open and a menu with 75 cheek shades appears.
2. Pick a shade. The middle pan takes that colour and the brush tip gets it too.
   You can also drag the brush onto any open pan to load that colour.
3. Click the statue (or its pedestal). The camera zooms in with a dolly-zoom whoosh.
4. Press and drag over the cheeks to blend colour. "Wipe cheeks" clears it, Esc goes back.

The mirror behind the table is a real reflection, so it shows the bedroom behind the camera.

## Deploy
Push to `main`. In the repo go to Settings > Pages and set Source to "GitHub Actions".
The workflow is in `.github/workflows/deploy.yml`.
