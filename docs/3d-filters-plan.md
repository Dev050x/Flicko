# 3D face filters (Filament spike plan)

Goal: a GLB model (test file `~/Downloads/glasses.glb`) rendered in real 3D over the live camera, following the head smoothly (target 60 fps render from 7-10 fps tracking), and baked into the captured photo. Work in `flicko_app/apps/mobile`. Follow CLAUDE.md conventions; keep tokens low (use `codegraph explore`, read only what is needed).

## Facts already established

- Test model `glasses.glb`: 1.1 MB, 36.5k triangles, 17 meshes, 37 nodes, 6 PBR materials (`hrom_2__0`, `plastik`, `metal`, `metal_2`, `hrom`, `glass`), NORMAL + TEXCOORD_0, no textures/skins/animations. **Its origin is far from the model**: bbox x -12.89..-0.15, y -6.35..6.09, z 2.54..6.00. It must be re-centred and scaled at load (centre of the bbox on x/y, scale so width = 1 unit). That model is too heavy for the Skia flat-shader approach, which is why we use Filament.
- Already in the repo (uncommitted): `assets/filters/models/*.glb` (15 low-poly models, positions only), `src/features/model3d/glb.ts` + `project.ts` (a Skia software renderer, pure maths). Keep these as the **fallback** if Filament fails; do not delete.
- Face data: `src/features/face/live.ts` has `FaceTrackingResult.faces[]` with `leftEye`, `rightEye`, `box`, `roll`, `yaw`, `pitch`, 4x4 column-major `headPose`, mapped to view space by `frameToView` (`mapping.ts`). Live eyes are in the zustand store `useLiveEyes` (eyes + `at` only; yaw/pitch/roll are not stored yet). Tracker runs ~7-10 fps (54 ms inference).
- Live preview: `components/camera/live-overlay.tsx` (React Native views). Capture bake: `features/filters/apply-filter.ts` (`composePhoto`, Skia offscreen, 1080 wide). Filters: `assets/filters/filters.json` + `features/filters/catalog.ts` + `placement.ts`.
- Camera stack: VisionCamera 5.2.3 + `react-native-vision-camera-skia`, Skia 2.6.2, Reanimated 4, RN 0.86.3, Expo SDK 57, Android only, dev build. `react-native-filament` latest is 1.11.0 (peer deps not verified; check on install).
- Never touch the user's expo server on 8081. Stop any server/process you start. Native deps need a rebuild; the user runs it.
- Rules: commits one-line `feat:`/`fix:`/`chore:` etc, no scope, never say "reel(s)" or "dexscreener". 16 GB RAM, no swap: cap heavy jobs.

## Step 1: compatibility gate (stop and report if it fails)

1. `bun add react-native-filament` (and its required peers, e.g. `react-native-worklets-core` if it still needs it; Reanimated 4 uses `react-native-worklets`, check for a conflict). Read its README / Android requirements first.
2. Metro: make sure `.glb` is an asset extension (Expo default usually has it; verify `metro.config.js`).
3. Add a dev-only screen `src/app/dev/model3d.tsx` that renders `<FilamentScene>` with the glasses GLB (rotating slowly) on a transparent background over `<Camera>` or a plain colour. Output: the user rebuilds (`bunx expo run:android`) and reports it renders.
   - If the install/build fails or Filament cannot be transparent over the camera: write the finding in this file under "Result", and switch to the Skia fallback (Step 5).

## Step 2: layering over the camera

- Put the Filament view above the camera preview in `camera-view.tsx`, `pointerEvents="none"`, transparent clear colour, only mounted when the selected filter is a `model` filter.
- Check camera and tracker fps with the existing dev HUD (`features/face/hud.ts`) with and without Filament mounted. Record the numbers here. Pass: tracker still >= 7 fps and preview not visibly slower.

## Step 3: pose pipeline (the smoothness)

- New `src/features/model3d/pose.ts`: from the latest face (eye midpoint + eye distance in view space, yaw/pitch/roll or `headPose`), produce a target pose `{x, y, scale, yaw, pitch, roll}`.
- Store pose targets in Reanimated shared values (extend the push path in `useFaceTracking`; do not add React state per detection).
- Per-frame (60 fps, UI/worklet thread) smoothing: One Euro filter on every channel, plus velocity prediction of about 40-60 ms, plus fade/hide ~150 ms after the face is lost. Apply the result to the Filament entity transform each frame via the library's render callback / `useRenderCallback`.
- Camera mapping: use a perspective camera in Filament whose FOV matches the preview, place the model at `z` derived from eye distance so on-screen size equals the real eye spacing. Mirror handling for the front camera as in `mapping.ts`. Expose a `YAW_SIGN`/`PITCH_SIGN` constant; the user will confirm the directions on device.
- Normalise the model at load: re-centre, scale to unit width; per-filter `anchor` offset (eyes, head-top) in `filters.json`.

## Step 4: capture

Preferred: after the photo is taken, render the same scene offscreen at the photo resolution using the final pose, read the pixels back to an RGBA bitmap, make an `SkImage` and draw it in `composePhoto` after the photo and colour matrix, like an overlay. Alternative if offscreen readback is not available: snapshot the live Filament surface and scale it. Pass: the saved photo shows the glasses in the same place and size as the preview.

## Step 5: fallback

If Filament fails: render with the existing `features/model3d/project.ts` through a Skia `<Canvas>` driven by the same shared-value pose (UI thread), and bake with `canvas.drawVertices` in `apply-filter.ts`. The test glasses file is too heavy for this (36k triangles); for the fallback use `assets/filters/models/degen_sunglasses.glb` or decimate.

## Step 6: wire into the catalog (only after Steps 1-4 pass)

- `filters.json`: new `type: "model"` filters with `model` path and `anchor` ("eyes" | "head"), `scale`, `offset`; add to `catalog.ts` (`FilterType`, require map for models) and `layoutFor` handling; thumbnails by capturing a render.
- Then add the 15 low-poly models with per-model anchors.

## Acceptance for the spike

1. Glasses visible in 3D over the live camera, correct size and position on the eyes.
2. Turning the head yaw/pitch/roll turns the glasses with it; motion looks smooth (no 7-10 fps stepping).
3. Photo capture contains the glasses in the same position.
4. HUD fps numbers recorded in a "Result" section below.

## Result

(fill in during the spike)
