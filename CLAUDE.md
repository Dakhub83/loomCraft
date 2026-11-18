# CLAUDE.md

LoomCraft: browser-only apparel design studio (Vite + React 19 + TypeScript + Tailwind v4 + Fabric.js 7 + jsPDF 4). No backend; persistence is IndexedDB through `idb-keyval` (`src/utils/storage.ts`).

## Commands

- `npm run dev`: dev server on http://localhost:5173
- `npm run build`: `tsc -b` + `vite build` (run `npx tsc -b` to type-check after changes)
- There is no test suite or linter. To verify changes, run the app in a browser.

## Architecture

- `App.tsx` first loads the autosaved workspace from IndexedDB (showing a splash screen), then mounts `Studio`. `Studio` owns all studio state: garment, color, view, `designs` (one Fabric JSON per view), `effects` (one print technique per view), and draft metadata. `stateRef` mirrors this state for callbacks such as `getSnapshot`.
- `DesignCanvas.tsx` wraps one Fabric `Canvas` and exposes an imperative `DesignCanvasHandle` through `ref`. Toolbar and panels call methods on it; it reports back through `onChange`, `onLayers`, `onSelection` and `onHistory`.
- **Garment registry: `src/data/garments.ts`.** Every garment is data:
  - category (tops, bottoms, outerwear, accessories or custom), with an optional sub-`group` such as "Fleece"
  - its own `views` with any ids (`front`, `back`, `sleeve`, `left-leg`, …), and a print `zone` per view in the 500×560 space with its real size in inches (`zonePpi(zone)` gives pixels per inch)
  - size-chart seeds, and optional `measureLines` for the size-spec diagram

  Add a garment by adding data; the UI, exports, PDF, size charts and AI tools all read the registry. Always resolve garments through `getGarment` / `getView` / `getZone` / `garmentViews`, and never assume a garment has `front`, `back` or `sleeve` (use `hasView`). `ViewDesigns` and `ViewEffects` are partial maps keyed by view id; read effects with `effectFor`.
- **Renderer: `GarmentTemplates.tsx`.** `GarmentSVG` draws vector `art` (panels, ribs, stitches, folds, cords, eyelets, buttons) with every shade derived from the garment hex. A `clip: true` rib draws knit texture only. `lite` skips the turbulence grain and blur for thumbnails.
- **Custom blanks** (`CustomGarmentRecord`) are photos stored in IndexedDB under `garment:<id>` and registered at boot with `setCustomGarments()` before the studio mounts. On screen they're tinted with an SVG mask plus CSS `mix-blend-mode`; exports use `drawGarment()` (canvas composite op, then `destination-in` with the photo). Keep the two in sync. A draft whose custom garment was deleted falls back to `DEFAULT_GARMENT`.
- `utils/exportTools.ts` is **lazy-loaded** with `import()` from `ExportPanel` and `persist()`, so jsPDF, JSZip and `react-dom/server` stay out of the startup bundle. Don't import it statically from UI code; import types only. It renders offscreen. It re-renders saved JSON with `StaticCanvas`, gets garment SVG markup from `renderToStaticMarkup(GarmentSVG)`, composes mockups on a 2D canvas, writes PNG `pHYs` chunks for DPI, and builds the PDF tech pack. `exportProductionZip` bundles `mockups/` (front and back, plus sleeve when it has art), `print/` (300 DPI PNGs) and the PDF. PNGs are stored uncompressed (`STORE`) for speed.
- **360° preview** (`components/Garment360.tsx`, lazy-loaded; Three.js never reaches the startup bundle). It has two modes:
  - **3D model** (default when a builder exists, see `hasGarmentModel`): `three/garmentModels.ts` builds procedural garments in inches around the mannequin in `three/body.ts` (y up, floor 0, wearer faces +z).
    - One parametric builder for tops (`TOPS` specs: ease, fit, drop shoulder, neck type, sleeves, hem band, pockets, front closure), one for bottoms (`BOTTOMS`), plus dedicated dad hat, beanie and tote builders.
    - Each returns per-view print **anchors** (zone centre, projection direction, up) placed from the registry zone sizes and descriptions, plus trim decals (painted on canvas) and hardware.
    - `three/modelScene.ts` projects each view's artwork from `buildPrintTextures()` (exportTools) with `DecalGeometry` at the zone's true inch size. Material per print technique is in `three/decals.ts`: DTG shows the weave, plastisol is a smoother film, puff gets a bump map.
    - Surfaces are `gridGeometry` / `tubeGeometry` (`three/geometry.ts`) with inch-based UVs. Parts hidden inside other parts are dropped with `keep()` (e.g. sleeve or leg triangles inside the body, the neck hole and tank armholes).
    - Every part is an outer FrontSide mesh plus an inner BackSide mesh (interior shade). The inside neck label is a BackSide decal drawn mirrored.
  - **Flat-lay** (`three/flatLay.ts`; the only mode for custom photo blanks): the 2D drawings inflated by a distance field. `buildTurntableTextures()` provides outside and inside textures. It is scaled ×5 so both modes work in inches.
  - **Fabrics:** `data/fabrics.ts` holds the fabric data (no Three.js) and is also used by the spec generator. `three/fabricMaterials.ts` turns `look` into cached, seamless procedural weave normal maps and slub color maps on `MeshPhysicalMaterial` with sheen.
    - The choice is stored per garment in `fabrics` (workspace and drafts; absent means `defaultFabricFor`).
    - `generateSpec(..., getFabric(fabrics[garment]))` swaps in its weight, composition, fiber and care.
  - **Interior and lighting:** the Interior slider is a camera-facing clipping plane, offset by the framed centre; the mannequin hides while cutting. Lighting is a RoomEnvironment PMREM plus a camera-attached key light with soft shadows and `NeutralToneMapping`, which keeps hex colors honest. The renderer calls `forceContextLoss()` on close because browsers cap live WebGL contexts.
- **Photoshop import.** `components/PsdImportDialog.tsx` is lazy-loaded and lazily imports `utils/psdImport.ts`, which uses `ag-psd`.
  - `parsePsd` builds a layer tree, top-most first, and applies layer masks. It flags likely background or mockup layers by name or by covering more than 85% of the canvas, and decides per text layer whether it can be rebuilt (it can't if warped, rotated, vertical or mixed-style).
  - `buildView` maps document pixels into a print zone with one of three fit modes: the canvas or artboard as the print area, the artwork's own bounds, or actual size from the PSD ppi. Images are resampled down to 300 DPI at their placed size. Text becomes IText when `loadGoogleFont` finds the family (from the PostScript name), and is then fitted to its Photoshop box with `setLayerGeometry`; otherwise the text layer's pixels are used.
  - Top-level groups go to a view (auto-matched by whole word: "Front", "Back", "Sleeve"…). The dialog drives views through the same `LayoutContext.setView` as auto-layout, and each view is one `importLayers` call, so one undo step.
  - Not supported: layer effects, adjustment layers and clipping masks (Merge flattens what's selected), and `.psb` files.
- `utils/printEffects.ts` produces the SVG filter markup used both by the live preview (CSS `filter` on Fabric's `lowerCanvasEl`) and by exports (`ctx.filter`).

## Invariants and gotchas

- **Claude assistant architecture.** `server/claudeProxy.ts` is a Vite plugin (dev and preview servers only) that holds `ANTHROPIC_API_KEY` from `.env.local` and calls `client.beta.messages.create`. It sends the model (`claude-opus-5-5`), medium effort, top-level `cache_control`, and server-side refusal fallbacks (`fallbacks: "default"`). The **browser** runs the tool loop (`src/ai/useStudioAgent.ts`), because every tool edits the live canvas. Rules for that loop:
  - Append assistant `content` unchanged (thinking and fallback blocks must round-trip), and keep the history append-only.
  - Return every `tool_result` in one user message, with failures as `is_error`.
  - Execute tools sequentially.
- **Tool definitions** live in `src/ai/toolDefs.ts`, imported by both the server and the client. Keep the file free of DOM and Node APIs, and keep the tools and system prompt byte-stable so prompt caching keeps hitting. Tools use `strict: true`, so every property is required and optional fields are nullable. Forced `tool_choice` is not allowed on Opus 5.5.
- **Assistant drawer** (`components/assistant/`): `AssistantDrawer` stays mounted, so it can slide, and doesn't block the canvas. Only the active tab's body is mounted; Claude chat state lives in `App` (`useStudioAgent`). The local helpers:
  - `LayoutHelper` → `utils/autoLayout.ts`. Recipes are lists of `{ view, graphic, box(zone) }` in inches. `runLayout` works on the source view first, copies to other views with `exportLayers`/`importLayers`, and switches views through the same `AgentContext.setView` the AI uses (it waits for `onReady`).
  - `ColorHelper` → `utils/colorHarmony.ts`, using WCAG contrast; 3:1 is treated as the print-legibility floor.
  - `SpecHelper` → `utils/manufacturingSpecs.ts` (`PROFILES` per garment id, a category fallback for custom blanks). Specs are stored per garment in `mfgSpecs` (workspace and drafts), shown in `SizeChartEditor`, written to the CSV, and rendered as the PDF's "MFG SPEC" page; page numbers are computed (`mfgPage` / `sizePage`).
- **PDF text** goes through the ASCII normalizer in `buildTechPack`. When adding symbols to spec text (°, ½, ², ⚠, …), add a mapping there, or they will be stripped.
- **Adding a tool** takes three steps: its schema in `toolDefs.ts`, a case in `executor.ts` (`runStudioTool` validates inputs and never throws), and a chip label in `describeToolCall`. The executor reaches the studio only through `AgentContext`, which `App` rebuilds every render. `setGarment` and `setView` resolve after the new canvas fires `onReady`.

- **Re-render discipline around Fabric.** `DesignCanvas` is wrapped in `memo` with a comparator that ignores `initialJSON`. Every callback passed to it must be stable (`useCallback` or a state setter); `onChange(view, json)` takes the view explicitly for that reason. Selection updates during drag, scale or rotate are batched to one per animation frame (`scheduleSelection`), and layer and selection updates are skipped when nothing changed. Keep it that way.
- **Keyboard shortcuts** live in `DesignCanvas` (only the mounted canvas listens): undo/redo, Ctrl+D, Delete/Backspace, and arrow nudges (1px, or 10px with Shift). They are skipped while typing in inputs or editing text. Only Ctrl/Cmd+S lives in `App`.
- **Placement presets** (`utils/placements.ts`) are boxes in inches relative to the print zone. `applyPlacement` scales and aligns the selection, or every unlocked visible layer when nothing is selected. A preset for another view (Full Back) sets `pendingPlacement`, switches the view, and is applied in `onReady` once the new canvas has loaded. With auto-place on, uploads use `defaultPlacementFor(view)`.

- **The canvas is remounted, not updated.** `DesignCanvas` reads `initialJSON` only on mount and is keyed by `${canvasNonce}-${garment}-${view}`. To load new content (draft load, new design, garment change), change the data and call `resetCanvases()` in App. That bumps the nonce and clears the undo history.
- **Undo history is per view.** It lives in App's `histories` ref (keyed by nonce, garment and view) and is passed in as a mutable `HistoryState`, so it survives view switches. `commit()` pushes a snapshot. Slider-style edits go through `commitSoon()` (debounced), and a pending debounce is flushed on unmount.
- **StrictMode-safe mounting.** The `<canvas>` element is created inside the effect and removed after `canvas.dispose()`. The cleanup only flushes edits if the initial load finished (`loaded` ref). Otherwise StrictMode's double mount would overwrite a design with an empty canvas.
- **Serialization.** Always serialize with `canvas.toObject(SERIAL_PROPS)`. `id` and `name` are registered through `FabricObject.customProperties` in `configureFabric()`. Read them with the `meta(obj)` helper, not by augmenting Fabric types. A layer counts as "locked" when `selectable === false`.
- **Fonts.** Call `loadGoogleFont()` and `cache.clearFontCache()` before applying a font, and `ensureFonts(json)` before any `loadFromJSON`. Otherwise text measures with a fallback font.
- **Garment switch** runs `refitDesign()` to scale and center artwork into the new zone. Zones differ in size and PPI (the tee sleeve is 40 ppi, the others 20).
- **Print export** renders at a multiplier of `300 / zonePpi(zone)`, cropped to the artwork bounds. Export filters are scaled per resolution (`ensureFilterInDocument(effect, scale)`) so grain and bevel size match the preview.
- **jsPDF text.** The built-in Helvetica can't encode typographic symbols, so `buildTechPack` wraps `doc.text` with an ASCII normalizer. Keep the tech pack to one page; the layer table truncates to the rows that fit.
- **Stage zoom** is a CSS `transform: scale()` on the stage. Fabric maps pointer positions through `getBoundingClientRect`, so this works. Don't resize the Fabric canvas for zoom.
- **Storage.** Each draft is its own key (`draft:<id>`), and the working session autosaves under `workspace`. On first run, drafts from the old localStorage format are imported automatically (`migrated-localstorage-v1`). Uploaded rasters are embedded in the Fabric JSON as data URLs.
- **Size charts** (`utils/sizeCharts.ts`, `SizeChartEditor.tsx`, `GradingChart.tsx`). There is one chart per garment in `sizeCharts` state, persisted in the workspace and drafts. When a garment has no stored chart, `defaultSizeChart(garment)` is used. Values are always stored in **inches**; `unit` only changes how they are displayed and parsed, so in/cm toggling never drifts. Grade steps count positions on the full `ALL_SIZES` ladder. Diagram lines come from `MEASURE_LINES[garment][point.diagram]`, and `measureOverlayMarkup()` returns an SVG string so the same overlay can be rasterized for page 2 of the PDF. The size-spec page is added only when `includeInTechPack` is set; the CSV in `specs/` is always included.
- **Garment SVG performance.** Fabric grain is a single `feTurbulence` rect clipped to the silhouette; don't add a filter per panel. The SVG sits on its own compositor layer (`translateZ(0)`, `contain: strict`).

## Conventions

- Dark studio UI: neutrals are zinc or near-black hex (`#0a0a0c`, `#111114`). The accent is electric violet: `violet-500` (`#8b5cf6`) for fills, borders and Fabric controls, `violet-400` for text and icons on dark backgrounds, and white text on violet buttons. In the PDF, `ACCENT` is violet-600 and `ACCENT_LIGHT` is violet-400 (used on the dark header band), and Lucide icons are used throughout. Shared classes (`lc-input`, `lc-btn`, `lc-btn-primary`, `lc-range`, `lc-scroll`) live in `src/index.css`.
- Panels use the `Section` component exported from `Toolbar.tsx`.
- Fabric 7 API names: `bringObjectForward`, `sendObjectBackwards`, `bringObjectToFront`, `sendObjectToBack`. `loadFromJSON` and `clone` return promises.
