# LoomCraft

Apparel design studio built with Vite, React, TypeScript, Tailwind CSS v4, Fabric.js, jsPDF, JSZip and idb-keyval.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

### Claude design assistant (optional)

Copy `.env.example` to `.env.local`, add your Anthropic API key, and restart `npm run dev`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The key is read by a small proxy inside the Vite dev/preview server (`server/claudeProxy.ts`) and never reaches the browser. A static deployment of `dist/` has no proxy, so to use the assistant in production, host the same handler as a serverless function at `/api/claude`.

## Features

- **Garment library**: 16 built-in vector flat-lays, filtered by category pills, with ribbing, stitching, folds and fabric texture all derived from the chosen hex color:
  - Tops: Boxy Tee, Long-Sleeve Tee, Polo, Tank, Crop Top
  - Fleece (under Tops): Pullover Hoodie, Zip-Up Hoodie, Crewneck
  - Bottoms: Joggers, Shorts, Cargo Pants
  - Outerwear: Coach Jacket, Work Jacket
  - Accessories: Tote, Dad Hat, Beanie

  Each garment has its own views (for example Front / Back / Left Leg / Right Leg, or Crown) and print areas sized in inches, and the UI and tech pack follow them.
- **Photoshop import**: open a `.psd` from **Graphics → Import Photoshop project** (or drop it on the upload box).
  - Pick layers, and choose which view each top-level group goes to. Groups named Front, Back, Sleeve and so on are matched automatically, and hidden and background or mockup layers start unchecked.
  - Choose the placement: the canvas is the print area, fit the artwork to the print area, or actual size from the file's ppi.
  - Text layers stay editable when their font is on Google Fonts. Otherwise, or with **Merge into one image per view**, they come in as pixels.
- **360° preview** (the **360° View** button on the stage): the garment is shown in 3D with your artwork on it.
  - Drag to rotate all the way around, scroll to zoom, and press Space to auto-spin.
  - Jump to Front, Side, Back or Inside.
  - The **Interior** slider cuts away the half facing you to show the inside of the garment: the reverse of the fabric, ink bleed-through and the neck label.
  - **Snapshot** saves the current angle as a PNG.
  - The preview updates live when you change the garment color.
- **Custom garments**: upload your own front/back flat-lay photos, drag the print area into place, set its real width in inches, and tint the photo with multiply or overlay blending.
- **Design canvas**: a Fabric.js canvas sits over the safe print zone. It supports drag, corner-scale and rotate, snaps to the center with guides, and has layer ordering, lock/hide, and undo/redo per view.
- **Assistant drawer** (the Assistant button): a slide-over with three local helpers that need no API key:
  - **Layouts**: one-click streetwear layouts with real inch proportions (Minimal Left Chest + Oversized Back, Center Stacked Editorial, Sleeve Hit + Chest Logo, Neck Hit + Big Back). Artwork is copied across views as needed. There's also a "Balance this view" button.
  - **Colors**: ink pairings for the garment color (high contrast, tonal, complementary accent, vintage), each with its contrast ratio, nearest Pantone and a suggested technique. It also checks the contrast of the inks already in your design, and can recolor the selection or the whole view.
  - **Specs**: a manufacturing spec generator covering fabric weight (GSM / oz), composition, construction, trims, care and factory print notes for each view's print method. It flags fabric/method conflicts (for example DTG on nylon). The spec appears in the Size Chart, the CSV, and a Manufacturing Spec page in the PDF.
- **Claude design assistant** (the drawer's "Ask Claude" tab): a chat panel where Claude (Opus 5.5) edits the design for you. It can:
  - switch garments, colors, views and print techniques
  - add and restyle text, and draw vector artwork as SVG
  - move layers in inches and apply placement presets
  - render the mockup to check its own work or critique yours

  Every change goes through the normal undo history.
- **Size / spec chart**: a graded measurement table for each garment, XXS to 5XL.
  - Tolerances and grade rules for each measurement, with entries in inches or cm (fractions like `23 1/2` work).
  - Auto-grade from a base size, or infer grade rules from existing values.
  - Checks that flag sizes that shrink, missing values and values outside tolerance.
  - Per-row sparklines, plus a grading chart: one measurement with its tolerance band, or every measurement compared by % change from base.
  - A diagram of where each measurement is taken, CSV export, and a size-spec page in the tech pack PDF.
- **Placement presets**: Left Chest, Center Chest and Full Back scale and align artwork, and uploads can be auto-placed.
- **Keyboard**: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+D duplicate, Delete to remove, arrows to nudge 1px (Shift for 10px), Ctrl/Cmd+S to save.
- **Assets and type**: upload multiple PNG, SVG, JPG or WebP files (SVGs stay vector). Text supports any Google Font, letter spacing, weight, style and alignment.
- **Print techniques**: Digital, Screen Print, Puff Print and Vintage Distressed, implemented as SVG filters. The same filters drive the live preview and the mockup export.
- **Production Pack (.ZIP)**: one click bundles:
  - front and back mockup PNGs (2000 × 2240 px)
  - a 300 DPI transparent print PNG per view, cropped to the artwork, with DPI metadata
  - a branded PDF tech pack: page 1 has print placements, sizes in inches, and Hex + nearest-Pantone colors; page 2 has the size spec
  - the size chart as a CSV

  A single mockup PNG export is also available.
- **Drafts**: stored in IndexedDB (no ~5 MB limit), with save, save as, rename, duplicate, delete and thumbnails. The working session also autosaves.

## Structure

```
src/
  data/
    garments.ts                 garment registry: categories, views, print zones, size seeds, vector art
  App.tsx                       studio layout, state, shortcuts
  components/
    GarmentTemplates.tsx        color-adaptive renderer for vector and photo garments
    GarmentPicker.tsx           category pills + garment grid
    CustomGarmentEditor.tsx     custom blank uploader with visual print-area editor
    DesignCanvas.tsx            Fabric.js canvas, snapping, history, imperative API
    Toolbar.tsx                 garment/color/view, uploads, typography, print technique
    LayersPanel.tsx             selection properties + layer list
    ExportPanel.tsx             export buttons
    DraftManager.tsx            collection drawer
    SizeChartEditor.tsx         size spec dialog (table, diagram, grading tools)
    GradingChart.tsx            grading line charts + sparklines
    AssistantPanel.tsx          Claude chat (the "Ask Claude" tab)
    assistant/                  drawer + Layouts / Colors / Specs helper tabs
    Header.tsx                  logo, name, undo/redo, save
  utils/
    exportTools.ts              mockup compose, 300 DPI PNG, PDF tech pack
    printEffects.ts             SVG filter definitions
    color.ts                    color math, Pantone matching, palette extraction
    fonts.ts                    Google Fonts loader
    storage.ts                  IndexedDB persistence (idb-keyval): drafts, workspace, custom garments
  ai/
    toolDefs.ts                 model, system prompt and tool schemas (shared with the server)
    executor.ts                 runs Claude's tool calls against the studio
    useStudioAgent.ts           client-side agent loop
server/
  claudeProxy.ts                Vite plugin: /api/claude proxy holding the API key
    placements.ts               placement presets
    autoLayout.ts               layout recipes (inch boxes per view) + runner
    colorHarmony.ts             contrast, HSL, ink library and pairing suggestions
    manufacturingSpecs.ts       fabric profiles and print-method notes per garment
    sizeCharts.ts               size spec model, grading, validation, diagram lines, CSV
    fabricHelpers.ts            Fabric config + helpers
```

## Notes

- Pantone values are nearest matches to on-screen color. Confirm them against a physical guide.
- Print-texture effects in exported mockups need `ctx.filter`, which works in Chrome, Edge and Firefox. In Safari, mockups export without the texture.
