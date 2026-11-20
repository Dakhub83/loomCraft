import { garmentViews, getGarment } from '../data/garments';
import type { FabricDef } from '../data/fabrics';
import type { GarmentId, ManufacturingSpec, PrintEffect, ViewDesigns, ViewEffects } from '../types';
import { effectFor, hasArtwork } from '../types';
import { isDark } from './color';
import { inksInJSON } from './colorHarmony';

/* ================================================================================================
 * Manufacturing spec generator: recommended fabric, weight, construction, trims and factory print
 * notes for the selected garment and the print method on each view. Runs locally from these
 * tables; the output is plain editable text stored with the design.
 * ============================================================================================== */

interface FabricProfile {
  gsm: number;
  /** Shown instead of GSM-derived oz for woven fabrics sold by weight per yard. */
  weightNote?: string;
  composition: string;
  construction: string[];
  trims: string[];
  care: string;
  /** Fiber family – drives print-method compatibility warnings. */
  fiber: 'cotton' | 'cotton-blend' | 'nylon' | 'acrylic' | 'canvas' | 'polyester' | 'leather' | 'foam';
  embroideryFirst?: boolean;
}

const COTTON_CARE = 'Machine wash cold inside out · tumble dry low · do not iron print · do not dry clean';

const PROFILES: Record<string, FabricProfile> = {
  tee: {
    gsm: 240, composition: '100% combed ring-spun cotton, single jersey (30/1)', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Boxy fit with 2.5″ dropped shoulder', '1″ 1×1 rib collar, coverstitched; self-fabric back-neck tape', 'Double-needle sleeve and bottom hems', 'Side-seamed, garment-dyed or pigment-washed finish optional'],
    trims: ['Printed neck label (no sewn tag)', 'Size/care label at left side seam'],
  },
  longsleeve: {
    gsm: 220, composition: '100% combed ring-spun cotton, single jersey', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Regular fit, set-in sleeves', '¾″ 1×1 rib collar; 3″ 1×1 rib cuffs', 'Double-needle bottom hem', 'Self-fabric back-neck tape'],
    trims: ['Printed neck label', 'Care label at left side seam'],
  },
  polo: {
    gsm: 220, composition: '100% combed cotton piqué', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Flat-knit collar and 1″ armband trims', '3-button placket, 7″ length', 'Side vents at hem, 1.5″', 'Set-in sleeves, double-needle hem'],
    trims: ['3 × 18L tonal 4-hole buttons', 'Woven neck label', 'Care label at left side seam'],
  },
  tank: {
    gsm: 180, composition: '100% combed ring-spun cotton, single jersey', fiber: 'cotton', care: COTTON_CARE,
    construction: ['½″ self-fabric binding at neck and armholes, coverstitched', 'Double-needle bottom hem', 'Side-seamed'],
    trims: ['Printed neck label', 'Care label at left side seam'],
  },
  crop: {
    gsm: 220, composition: '100% combed ring-spun cotton, single jersey', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Boxy cropped fit, dropped shoulder', '1″ 1×1 rib collar', 'Raw-edge or ¾″ double-needle hem (specify)'],
    trims: ['Printed neck label', 'Care label at left side seam'],
  },
  hoodie: {
    gsm: 460, composition: '100% cotton French terry (loopback), brushed or unbrushed', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Double-layer hood with flat drawcord and metal eyelets', 'Kangaroo pouch, coverstitched', '2×2 rib cuffs (3″) and waistband (3″)', 'Dropped shoulder, flatlock or coverstitch seams'],
    trims: ['Flat cotton drawcord, 10 mm, with metal aglets', 'Woven neck label', 'Care label at left side seam'],
  },
  ziphoodie: {
    gsm: 420, composition: '80% cotton / 20% polyester brushed fleece', fiber: 'cotton-blend', care: COTTON_CARE,
    construction: ['Full-length #5 metal zipper with auto-lock slider', 'Double-layer hood with drawcord', 'Split front pockets', '2×2 rib cuffs and waistband'],
    trims: ['YKK #5 metal zipper, antique brass or gunmetal', 'Flat drawcord with metal aglets', 'Woven neck label'],
  },
  crewneck: {
    gsm: 400, composition: '100% cotton French terry (loopback)', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Relaxed fit, set-in sleeves', 'V-stitch insert below collar', '1″ 2×2 rib collar; 2.75″ rib cuffs and waistband', 'Coverstitched seams'],
    trims: ['Woven neck label', 'Care label at left side seam'],
  },
  joggers: {
    gsm: 400, composition: '100% cotton French terry (loopback)', fiber: 'cotton', care: COTTON_CARE,
    construction: ['1.5″ elastic waistband with internal flat drawcord', 'Side-seam pockets; optional back welt pocket', '3″ 2×2 rib cuffs', 'Gusseted crotch'],
    trims: ['Flat drawcord with metal aglets and eyelets', 'Woven waistband label'],
  },
  shorts: {
    gsm: 330, composition: '100% cotton French terry (or 100% polyester athletic mesh, 150 GSM)', fiber: 'cotton', care: COTTON_CARE,
    construction: ['1.5″ elastic waistband with drawcord', '7″ inseam, double-needle hem', 'Side-seam pockets'],
    trims: ['Flat drawcord', 'Woven waistband label'],
  },
  cargo: {
    gsm: 340, weightNote: '10 oz/yd² cotton twill', composition: '100% cotton twill, garment-washed', fiber: 'canvas', care: COTTON_CARE,
    construction: ['Relaxed straight leg', 'Button fly or zip fly with shank button', 'Flap cargo pockets with snap or button closure', 'Belt loops ×6, bar-tacked stress points'],
    trims: ['Metal shank button, 17 mm', 'Bar tacks at pockets and loops', 'Woven waistband label'],
  },
  coach: {
    gsm: 110, weightNote: '70D nylon taslan shell', composition: '100% nylon taslan with water-repellent finish; 100% polyester mesh lining', fiber: 'nylon', care: 'Machine wash cold, gentle · hang dry · do not iron · do not dry clean',
    construction: ['Snap front, 6 snaps', 'Point collar', 'Elastic cuffs', 'Drawcord hem with cord stoppers'],
    trims: ['Matte-black metal snaps ×6', 'Round drawcord with stoppers', 'Woven neck label'],
  },
  work: {
    gsm: 400, weightNote: '12 oz/yd² duck canvas or denim', composition: '100% cotton duck canvas (or 12 oz rigid denim)', fiber: 'canvas', care: 'Machine wash cold inside out · hang dry · expect fading on denim',
    construction: ['Point collar, button front', 'Chest flap pockets with button closure', 'Yoke and pleat seams, triple-needle topstitch', 'Buttoned cuffs and waistband with side tabs'],
    trims: ['Metal shank buttons, 17 mm', 'Contrast topstitch thread (specify)', 'Woven neck label'],
  },
  tote: {
    gsm: 400, weightNote: '12 oz/yd² cotton canvas', composition: '100% natural cotton canvas', fiber: 'canvas', care: 'Spot clean or hand wash cold · line dry',
    construction: ['15 × 16″ body, flat (no gusset) or 3″ gusset', '24″ self-fabric or webbing handles', 'Box-X stitched handle attachments', 'Turned top hem, 1″'],
    trims: ['Woven side-seam label'],
  },
  dadhat: {
    gsm: 270, weightNote: 'Washed cotton twill', composition: '100% cotton twill, garment-washed', fiber: 'cotton', care: 'Spot clean · do not machine wash', embroideryFirst: true,
    construction: ['Unstructured 6-panel, low profile', 'Pre-curved brim with 8 rows of stitching', 'Self-fabric strap with metal buckle', 'Sewn eyelets, top button'],
    trims: ['Antique brass slide buckle', 'Cotton sweatband', 'Woven inside label'],
  },
  beanie: {
    gsm: 0, weightNote: '1×1 rib knit, 12-gauge', composition: '100% acrylic (or merino/acrylic blend)', fiber: 'acrylic', care: 'Hand wash cold · lay flat to dry', embroideryFirst: true,
    construction: ['1×1 rib knit, fold-over 3″ cuff', 'Fully fashioned crown', 'Woven or embroidered patch on cuff (specify)'],
    trims: ['Woven label or patch, 2.5 × 1″'],
  },
  'soccer-jersey': {
    gsm: 140, composition: '100% recycled polyester birdseye interlock; side panels in 100% polyester mesh', fiber: 'polyester', care: 'Machine wash cold inside out · do not tumble dry · do not iron prints · no fabric softener',
    construction: ['Athletic fit, set-in sleeves', 'V-neck with 1×1 rib trim', 'Ventilated mesh side panels', 'Flatlock seams throughout (no chafing)', 'Full-coverage dye sublimation recommended for kit graphics'],
    trims: ['Heat-applied club crest (or embroidered badge)', 'Player name & number: heat-transfer vinyl or sublimated, numbers 8–10″ back / 4″ front', 'Heat-transfer care label (tagless)', 'Sleeve competition badge: silicone heat transfer'],
  },
  'gk-jersey': {
    gsm: 160, composition: '100% polyester interlock; foam elbow pads', fiber: 'polyester', care: 'Machine wash cold inside out · do not tumble dry · do not iron prints · no fabric softener',
    construction: ['Regular fit, long set-in sleeves', 'Crew neck with rib trim', 'Bonded foam pads at elbows', 'Flatlock seams; sublimated body recommended'],
    trims: ['Heat-applied crest', 'Name & number in heat-transfer vinyl', 'Tagless heat-transfer label'],
  },
  tracksuit: {
    gsm: 260, composition: '100% polyester warp-knit tricot, brushed back', fiber: 'polyester', care: 'Machine wash cold inside out · do not tumble dry · do not iron prints · no fabric softener',
    construction: [
      'Jacket: full-length #5 zip with 2.25″ stand collar, set-in sleeves, zipped or welt side pockets, 2″ rib cuffs and hem band',
      'Pants: 1.5″ elastic waistband with internal drawcord, side-seam pockets, tapered leg with 3″ rib cuffs',
      'Contrast side stripe (tape or panel) down each pant leg; optional matching stripe on the sleeves',
      'Jacket and pants cut from the same dye lot so the set matches',
    ],
    trims: ['#5 coil zip with branded puller', 'Flat drawcord with metal aglets', 'Contrast stripe tape, 1″', 'Woven neck label in jacket; waistband label in pants'],
  },
  'training-top': {
    gsm: 180, composition: '92% polyester / 8% elastane brushed-back performance knit', fiber: 'polyester', care: 'Machine wash cold inside out · do not tumble dry · do not iron prints · no fabric softener',
    construction: ['Slim fit', 'Mock-neck stand collar, 8″ quarter-zip', 'Flatlock seams', 'Optional thumbholes at cuffs'],
    trims: ['#5 coil zip with branded puller', 'Reflective or heat-applied crest', 'Tagless heat-transfer label'],
  },
  'soccer-shorts': {
    gsm: 140, composition: '100% recycled polyester interlock; contrast side panels', fiber: 'polyester', care: 'Machine wash cold inside out · do not tumble dry · do not iron prints · no fabric softener',
    construction: ['6″ inseam, relaxed athletic fit', '1.5″ covered elastic waistband with internal drawcord', 'Contrast side panels', 'Optional inner brief liner'],
    trims: ['Flat drawcord with silicone tips', 'Heat-applied crest and number (4″) on leg', 'Tagless heat-transfer label'],
  },
  'base-layer': {
    gsm: 220, composition: '78% recycled polyester / 22% elastane, 4-way stretch warp knit', fiber: 'polyester', care: 'Machine wash cold · do not tumble dry · do not iron · no fabric softener',
    construction: ['Compression fit (negative ease, ~30% stretch at chest)', 'Crew neck with self-fabric binding', 'Contoured side panels', 'Flatlock seams throughout, no seams on top of the shoulder', 'Long sleeves with self cuffs (thumbholes optional)'],
    trims: ['Small heat-transfer logo (left chest) and back-neck mark', 'Tagless heat-transfer care label', 'Low-bleed, high-stretch ink only'],
  },
  'compression-shorts': {
    gsm: 220, composition: '78% recycled polyester / 22% elastane, 4-way stretch warp knit', fiber: 'polyester', care: 'Machine wash cold · do not tumble dry · do not iron · no fabric softener',
    construction: ['8″ inseam compression fit', '2″ covered elastic waistband (no drawcord)', 'Gusseted crotch', 'Flatlock seams', 'Silicone gripper tape inside the leg hems'],
    trims: ['Heat-transfer logo on waistband or left thigh', 'Tagless heat-transfer care label', 'Colour-matched to the match shorts (competition rules)'],
  },
  backpack: {
    gsm: 0, weightNote: '600D recycled polyester, PU-coated', composition: '100% recycled polyester 600D Oxford; 210D polyester lining; EVA-padded back panel', fiber: 'polyester', care: 'Spot clean with a damp cloth · air dry · do not machine wash',
    construction: ['25 L main compartment, two-way zip around the top', 'Padded 15″ laptop sleeve against the back panel', 'Zip front pocket with organiser', 'Side bottle pocket (elastic mesh), side compression straps', 'S-curve padded shoulder straps with sternum strap, 3 mm EVA back panel', 'Bound internal seams; bar-tacks at strap and handle anchors'],
    trims: ['#8 coil zips with branded pullers (main), #5 (front pocket)', '1″ nylon webbing, ladder-lock adjusters', 'Woven label on the front panel or heat-transfer logo', 'Care / composition label inside'],
  },
  duffel: {
    gsm: 0, weightNote: '600D recycled polyester, PU-coated', composition: '100% recycled polyester 600D Oxford; 210D polyester lining', fiber: 'polyester', care: 'Spot clean with a damp cloth · air dry · do not machine wash',
    construction: ['40 L barrel body, #10 two-way zip along the top', 'Wrap-around webbing handles stitched to the base, hook-and-loop handle wrap', 'Detachable padded shoulder strap on metal D-rings', 'End-panel zip pocket (shoes / wet kit)', 'Reinforced base panel, 4 base feet optional'],
    trims: ['#10 coil zip, metal pullers', '1.5″ polyester webbing', 'Metal D-rings and swivel snap hooks', 'Woven label, care label inside'],
  },
  beltbag: {
    gsm: 0, weightNote: '210D nylon ripstop', composition: '100% nylon ripstop, PU-coated; 190T polyester lining', fiber: 'nylon', care: 'Spot clean with a damp cloth · air dry · do not machine wash',
    construction: ['Crescent body with two-way top zip', 'Zip front pocket', 'Adjustable 1.5″ webbing strap, worn at the waist or cross-body', 'Breathable mesh back panel'],
    trims: ['#5 coil zips with cord pullers', '1.5″ side-release buckle', 'Woven brand tab on the strap'],
  },
  drawstring: {
    gsm: 0, weightNote: '210D polyester', composition: '100% polyester 210D', fiber: 'polyester', care: 'Machine wash cold · line dry',
    construction: ['Single-compartment sack, 1.75″ top channel', 'Cords run through the channel and anchor at the bottom corners', 'Reinforced bottom corners with metal grommets'],
    trims: ['5 mm polyester cord', 'Metal grommets', 'Printed care label'],
  },
  'low-top': {
    gsm: 0, weightNote: '1.2–1.4 mm full-grain leather upper', composition: 'Leather upper; textile lining; EVA insole; rubber cupsole', fiber: 'leather', care: 'Wipe clean · condition leather · air dry away from heat', embroideryFirst: false,
    construction: ['Cupsole construction: stitched-on rubber cupsole', 'Toe cap, quarter panels, eyestay and heel counter overlays', 'Padded collar and tongue, textile lining', 'Removable EVA insole', 'Flat waxed laces, 5 eyelet pairs'],
    trims: ['Flat cotton laces (120 cm) with aglets', 'Woven tongue label', 'Heel pull tab', 'Printed sock-liner logo'],
  },
  'high-top': {
    gsm: 0, weightNote: '10 oz canvas or leather upper', composition: 'Cotton canvas (or leather) upper; textile lining; vulcanised rubber sole', fiber: 'canvas', care: 'Spot clean · air dry away from heat', embroideryFirst: false,
    construction: ['Vulcanised construction: rubber foxing tape around the upper', 'Padded ankle collar, 7 eyelet pairs', 'Toe cap and heel counter overlays', 'Cushioned insole'],
    trims: ['Flat cotton laces (160 cm) with aglets', 'Ankle patch (rubber or woven)', 'Heel pull tab'],
  },
  slides: {
    gsm: 0, weightNote: 'Injection-moulded EVA', composition: 'Injection-moulded EVA footbed and strap (one piece) or EVA footbed with synthetic-leather strap', fiber: 'foam', care: 'Rinse with water · air dry away from heat', embroideryFirst: false,
    construction: ['Contoured footbed with raised heel cup and toe ridge', 'One-piece moulded strap (or cemented synthetic strap)', 'Textured outsole for grip'],
    trims: ['Moulded / debossed logo on the strap', 'Footbed print (pad print) at the heel', 'Size moulded under the arch'],
  },
  snapback: {
    gsm: 270, weightNote: 'Cotton twill, buckram-backed front', composition: '100% cotton twill (or acrylic/wool blend); buckram front panels', fiber: 'cotton', care: 'Spot clean · do not machine wash', embroideryFirst: true,
    construction: ['Structured 6-panel, high profile', 'Flat brim with 8 rows of stitching, green under-visor optional', 'Plastic snap closure, 7 positions', 'Sewn eyelets, top button, taped seams'],
    trims: ['Plastic snapback closure', 'Cotton sweatband', 'Woven inside label'],
  },
  'bucket-hat': {
    gsm: 270, weightNote: 'Washed cotton twill', composition: '100% cotton twill, garment-washed', fiber: 'cotton', care: 'Machine wash cold · reshape and air dry', embroideryFirst: true,
    construction: ['6-panel crown with flat top', 'Downward-angled brim with 4 rows of stitching', 'Taped inner seams, 2 sewn vent eyelets'],
    trims: ['Cotton sweatband', 'Woven inside label'],
  },
  'soccer-socks': {
    gsm: 0, weightNote: 'Knit sock, 168-needle, cushioned foot', composition: '75% nylon / 20% polyester / 5% elastane', fiber: 'polyester', care: 'Machine wash cold · do not tumble dry · do not iron', embroideryFirst: false,
    construction: ['Knee-high rib leg with fold-over cuff', 'Terry-cushioned sole, heel and toe', 'Arch support band', 'Knitted-in cuff stripes (yarn colours to spec)'],
    trims: ['Knitted-in logo on calf (jacquard), or heat transfer', 'Paper band / header card'],
  },
};

const CATEGORY_FALLBACK: Record<string, FabricProfile> = {
  bags: {
    gsm: 0, weightNote: '600D polyester', composition: '100% polyester 600D, PU-coated; polyester lining', fiber: 'polyester', care: 'Spot clean with a damp cloth · air dry · do not machine wash',
    construction: ['Specify compartments, zips and padding'], trims: ['Coil zips with pullers', 'Webbing and hardware', 'Woven label'],
  },
  footwear: {
    gsm: 0, weightNote: 'Specify upper material', composition: 'Specify upper, lining, insole and outsole', fiber: 'leather', care: 'Wipe clean · air dry away from heat',
    construction: ['Specify construction (cupsole / vulcanised / moulded)'], trims: ['Laces', 'Tongue label'],
  },
  custom: {
    gsm: 0, weightNote: 'Specify fabric weight', composition: 'Specify fiber content', fiber: 'cotton', care: COTTON_CARE,
    construction: ['Specify construction details'], trims: ['Neck/brand label', 'Care label'],
  },
};

/* ---------- print methods ---------- */

const METHOD_NAME: Record<PrintEffect, string> = {
  none: 'Direct-to-garment (DTG)',
  screen: 'Plastisol screen print',
  puff: 'Puff plastisol screen print',
  vintage: 'Water-based / discharge screen print, distressed',
};

function methodNotes(method: PrintEffect, darkGarment: boolean, profile: FabricProfile, inks: number, raster: number): string[] {
  const notes: string[] = [];
  switch (method) {
    case 'none':
      notes.push(darkGarment ? 'Pretreat required on dark garments; white ink underbase.' : 'No pretreat needed on light garments (CMYK only).');
      notes.push('Print at 1200 dpi; heat-press cure 160 °C (320 °F) for 90 s.');
      if (profile.fiber !== 'cotton') notes.push('⚠ DTG is designed for cotton — expect duller color on blends and poor adhesion on nylon/acrylic.');
      break;
    case 'screen':
      notes.push(`${inks || 'Specify'} spot color${inks === 1 ? '' : 's'}${inks ? ' — one screen each' : ''}; Pantone-matched plastisol.`);
      notes.push('156 mesh for solids, 230 mesh for fine detail; flash between colors.');
      if (darkGarment) notes.push('White underbase required on dark garments (+1 screen).');
      notes.push('Cure at 160 °C (320 °F), 60–90 s; stretch test after cure.');
      if (raster) notes.push(`${raster} raster image${raster > 1 ? 's' : ''} detected — needs simulated-process separations or halftones (65 lpi).`);
      break;
    case 'puff':
      notes.push(`${inks || 'Specify'} puff color${inks === 1 ? '' : 's'}; puff additive at 10–15% in plastisol.`);
      notes.push('86–110 mesh, thick stencil (200 µm emulsion) for loft.');
      notes.push('Minimum line weight 2 mm (0.08″); avoid detail under 3 mm and halftones.');
      notes.push('Cure at 165 °C (330 °F) until fully expanded (~1.5 mm loft); test wash before bulk.');
      break;
    case 'vintage':
      notes.push(profile.fiber === 'cotton' ? 'Discharge base on dark cotton; water-based inks on light garments.' : '⚠ Discharge only works on 100% cotton — use water-based ink on this fabric.');
      notes.push('Distressed screen texture built into the film; soft hand, no underbase.');
      notes.push('Cure 160 °C (320 °F) 2–3 min; enzyme or garment wash after print for worn-in look.');
      break;
  }
  if (profile.fiber === 'polyester' && method !== 'none')
    notes.push('⚠ Polyester: use low-bleed (dye-blocker) ink and a low-cure plastisol (~150 °C) to prevent dye migration.');
  if (profile.fiber === 'nylon' && method !== 'none') notes.push('⚠ Nylon shell: add nylon bonding agent / catalyst to plastisol and run a pre-production wash test.');
  if (profile.fiber === 'leather')
    notes.push('⚠ Leather / suede: screen ink and DTG crack or rub off. Use UV-LED print with flexible ink, heat-transfer (PU) film, laser etch, or emboss / deboss; test adhesion on the finished hide.');
  if (profile.fiber === 'foam')
    notes.push('⚠ EVA foam: print with pad printing or UV-LED, or mould the artwork in (emboss / deboss); screen ink does not bond to the foam skin.');
  return notes;
}

/**
 * Builds a fresh spec for a garment from its print methods and artwork. `fabric` is an explicit fabric
 * choice (from the 360° view); it replaces the garment profile's weight, composition, fiber and care.
 */
export function generateSpec(garment: GarmentId, color: string, designs: ViewDesigns, effects: ViewEffects, fabric?: FabricDef): ManufacturingSpec {
  const def = getGarment(garment);
  const base = PROFILES[garment] ?? CATEGORY_FALLBACK[def.category] ?? CATEGORY_FALLBACK.custom;
  const profile: FabricProfile = fabric
    ? { ...base, gsm: fabric.gsm, weightNote: fabric.weightNote, composition: fabric.composition, fiber: fabric.fiber, care: fabric.care }
    : base;
  const dark = isDark(color);
  const oz = profile.gsm ? (profile.gsm / 33.906).toFixed(1) : null;

  const views = garmentViews(garment);
  const withArt = views.filter((v) => hasArtwork(designs[v.id]));
  const basedOn: Record<string, PrintEffect> = {};
  const lines: string[] = [];

  for (const v of withArt.length ? withArt : views.slice(0, 1)) {
    const method = effectFor(effects, v.id);
    basedOn[v.id] = method;
    const { inks, rasterImages } = inksInJSON(designs[v.id]);
    const useEmbroidery = profile.embroideryFirst && method === 'none';
    lines.push(`${v.label.toUpperCase()} — ${useEmbroidery ? 'Flat embroidery (recommended for headwear)' : METHOD_NAME[method]} · max ${v.zone.widthIn} × ${v.zone.heightIn} in`);
    if (useEmbroidery) {
      lines.push(`• ${inks.length || 'Specify'} thread color${inks.length === 1 ? '' : 's'}; max 15,000 stitches; 3D puff embroidery optional for bold letterforms.`);
      lines.push('• Minimum text height 0.25″; satin stitch columns 1–10 mm; tear-away backing.');
    } else {
      for (const n of methodNotes(method, dark, profile, inks.length, rasterImages)) lines.push(`• ${n}`);
    }
    lines.push('');
  }
  if (!withArt.length) lines.unshift('No artwork yet — notes below are for the default view. Regenerate after placing artwork.', '');
  lines.push('• Approve a strike-off on production fabric before bulk.', `• Garment color ${color} — confirm dye lot against the approved lab dip.`);

  return {
    fabricWeight: profile.gsm ? `${profile.gsm} GSM (${oz} oz/yd²)${profile.weightNote ? ` · ${profile.weightNote}` : ''}` : profile.weightNote ?? 'Specify',
    composition: profile.composition,
    construction: profile.construction.map((c) => `• ${c}`).join('\n'),
    trims: profile.trims.map((t) => `• ${t}`).join('\n'),
    printNotes: lines.join('\n').trim(),
    care: profile.care,
    basedOn,
    generatedAt: Date.now(),
  };
}

/** True when the print methods or artwork views changed since the spec was generated. */
export function specIsStale(spec: ManufacturingSpec, garment: GarmentId, designs: ViewDesigns, effects: ViewEffects): boolean {
  const views = garmentViews(garment).filter((v) => hasArtwork(designs[v.id])).map((v) => v.id);
  const keys = Object.keys(spec.basedOn);
  if (views.length && (views.length !== keys.length || views.some((v) => !(v in spec.basedOn)))) return true;
  return keys.some((k) => spec.basedOn[k] !== effectFor(effects, k));
}

export const methodName = (e: PrintEffect) => METHOD_NAME[e];
