# LoomCraft

Apparel design studio built with Vite, React, TypeScript, Tailwind CSS v4, Fabric.js, jsPDF, JSZip and idb-keyval.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Features

- **Garment templates**: Oversized Drop-Shoulder Tee, Heavyweight Boxy Hoodie and Relaxed Crewneck, each with Front, Back and Sleeve views. Ribbing, stitching, folds and fabric texture are all derived from the chosen hex color.
- **Design canvas**: a Fabric.js canvas sits over the safe print zone. It supports drag, corner-scale and rotate, snaps to the center with guides, and has layer ordering, lock/hide, and undo/redo per view.
- **Placement presets**: Left Chest, Center Chest and Full Back scale and align artwork, and uploads can be auto-placed.
- **Keyboard**: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+D duplicate, Delete to remove, arrows to nudge 1px (Shift for 10px), Ctrl/Cmd+S to save.
- **Assets and type**: upload multiple PNG, SVG, JPG or WebP files (SVGs stay vector). Text supports any Google Font, letter spacing, weight, style and alignment.
- **Print techniques**: Digital, Screen Print, Puff Print and Vintage Distressed, implemented as SVG filters. The same filters drive the live preview and the mockup export.
- **Production Pack (.ZIP)**: one click bundles:
  - front and back mockup PNGs (2000 × 2240 px)
  - a 300 DPI transparent print PNG per view, cropped to the artwork, with DPI metadata
  - a 1-page branded PDF tech pack with print sizes in inches, placement, and Hex + nearest-Pantone colors

  A single mockup PNG export is also available.
- **Drafts**: stored in IndexedDB (no ~5 MB limit), with save, save as, rename, duplicate, delete and thumbnails. The working session also autosaves.

## Structure

```
src/
  App.tsx                       studio layout, state, shortcuts
  components/
    GarmentTemplates.tsx        vector garment specs + color-adaptive renderer
    DesignCanvas.tsx            Fabric.js canvas, snapping, history, imperative API
    Toolbar.tsx                 garment/color/view, uploads, typography, print technique
    LayersPanel.tsx             selection properties + layer list
    ExportPanel.tsx             export buttons
    DraftManager.tsx            collection drawer
    Header.tsx                  logo, name, undo/redo, save
  utils/
    exportTools.ts              mockup compose, 300 DPI PNG, PDF tech pack
    printEffects.ts             SVG filter definitions
    color.ts                    color math, Pantone matching, palette extraction
    fonts.ts                    Google Fonts loader
    storage.ts                  IndexedDB persistence (idb-keyval)
    placements.ts               placement presets
    fabricHelpers.ts            Fabric config + helpers
```

## Notes

- Pantone values are nearest matches to on-screen color. Confirm them against a physical guide.
- Print-texture effects in exported mockups need `ctx.filter`, which works in Chrome, Edge and Firefox. In Safari, mockups export without the texture.
