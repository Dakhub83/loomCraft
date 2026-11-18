# CLAUDE.md

LoomCraft: browser-only apparel design studio (Vite + React 19 + TypeScript + Tailwind v4 + Fabric.js 7 + jsPDF 4). No backend; persistence is IndexedDB through `idb-keyval` (`src/utils/storage.ts`).

## Commands

- `npm run dev`: dev server on http://localhost:5173
- `npm run build`: `tsc -b` + `vite build` (run `npx tsc -b` to type-check after changes)
- There is no test suite or linter. To verify changes, run the app in a browser.

## Architecture

- `App.tsx` first loads the autosaved workspace from IndexedDB (showing a splash screen), then mounts `Studio`. `Studio` owns all studio state: garment, color, view, `designs` (one Fabric JSON per view), `effects` (one print technique per view), and draft metadata. `stateRef` mirrors this state for callbacks such as `getSnapshot`.
- `DesignCanvas.tsx` wraps one Fabric `Canvas` and exposes an imperative `DesignCanvasHandle` through `ref`. Toolbar and panels call methods on it; it reports back through `onChange`, `onLayers`, `onSelection` and `onHistory`.
- `GarmentTemplates.tsx` describes garments as data (panels, ribs, stitches, folds, print `zone`) in a 500×560 coordinate space. `GarmentSVG` derives every shade from the single garment hex. Each print zone carries its real size in inches, and `zonePpi(zone)` turns that into pixels per inch.
- `utils/exportTools.ts` is **lazy-loaded** with `import()` from `ExportPanel` and `persist()`, so jsPDF, JSZip and `react-dom/server` stay out of the startup bundle. Don't import it statically from UI code; import types only. It renders offscreen. It re-renders saved JSON with `StaticCanvas`, gets garment SVG markup from `renderToStaticMarkup(GarmentSVG)`, composes mockups on a 2D canvas, writes PNG `pHYs` chunks for DPI, and builds the PDF tech pack. `exportProductionZip` bundles `mockups/` (front and back, plus sleeve when it has art), `print/` (300 DPI PNGs) and the PDF. PNGs are stored uncompressed (`STORE`) for speed.
- `utils/printEffects.ts` produces the SVG filter markup used both by the live preview (CSS `filter` on Fabric's `lowerCanvasEl`) and by exports (`ctx.filter`).

## Invariants and gotchas

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
- **Garment SVG performance.** Fabric grain is a single `feTurbulence` rect clipped to the silhouette; don't add a filter per panel. The SVG sits on its own compositor layer (`translateZ(0)`, `contain: strict`).

## Conventions

- Dark studio UI: neutrals are zinc or near-black hex (`#0a0a0c`, `#111114`), the accent is amber-400 (`#f5b041`), and Lucide icons are used throughout. Shared classes (`lc-input`, `lc-btn`, `lc-btn-primary`, `lc-range`, `lc-scroll`) live in `src/index.css`.
- Panels use the `Section` component exported from `Toolbar.tsx`.
- Fabric 7 API names: `bringObjectForward`, `sendObjectBackwards`, `bringObjectToFront`, `sendObjectToBack`. `loadFromJSON` and `clone` return promises.
