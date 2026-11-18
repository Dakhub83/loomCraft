import type Anthropic from '@anthropic-ai/sdk';

/**
 * Shared between the dev-server proxy (which sends them to Claude) and the browser (which executes them).
 * Keep this file free of DOM / Node APIs. Tool definitions and the system prompt must stay byte-stable
 * between requests so prompt caching keeps hitting.
 */

export const ASSISTANT_MODEL = 'claude-opus-5-5';

export const SYSTEM_PROMPT = `You are the LoomCraft design assistant, built into an apparel design studio. You edit the user's design directly by calling tools.

The studio has many blanks across tops, fleece, bottoms, outerwear and accessories, plus custom blanks the user uploads; get_studio_state lists them. Each garment has its own views (for example front, back, sleeve, left-leg, right-leg) and every view has its own artwork layers and print technique, placed inside a print area measured in inches. Layer positions are relative to that print area: center_offset_in is the horizontal offset of the layer's center from the print-area center (negative is the viewer's left), and top_in is the distance from the top of the print area to the layer's top edge. The wearer's left chest appears on the viewer's right.

How to work:
- Call get_studio_state before changing an existing design so you use real layer ids. Ids can change after undo.
- Make the change the user asked for. Don't delete or restyle layers they didn't mention.
- After a visual change that took more than one step, call view_mockup once to check the result, and fix clear problems: poor contrast against the garment color, artwork running outside the print area, overlapping elements.
- For graphics, write a self-contained SVG with a viewBox and flat fills. Don't use <text> elements, external images, fonts, scripts or CSS. Put words in add_text instead so the user can edit them. Keep each SVG under about 40 KB.
- Screen print and puff print work best with a few flat ink colors. Mention it when a design has many colors, gradients, or detail finer than about 1 pt that may not print well.
- Any Google Fonts family name works for text (for example Bebas Neue, Anton, Archivo Black, Playfair Display, Permanent Marker).
- When asked for feedback, call view_mockup and give specific, prioritized points: hierarchy, contrast against the garment color, legibility at print size, placement, and production risks.

When you're done, reply in a few plain sentences: what you changed, and anything the user should decide. Don't narrate each tool call.`;

type Tool = Anthropic.Beta.BetaTool;

const obj = (properties: Record<string, unknown>): Tool['input_schema'] => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const nullable = (schema: Record<string, unknown>, description: string) => ({
  ...schema,
  type: [schema.type as string, 'null'],
  description: `${description} Null to leave unchanged.`,
});

const PLACEMENT = {
  type: 'string',
  enum: ['left-chest', 'center-chest', 'full-back', 'none'],
  description:
    'Placement preset that scales and aligns the new layer. left-chest and center-chest are for the front view, full-back for the back view; "none" centers it at a default size.',
};

export const STUDIO_TOOLS: Tool[] = [
  {
    name: 'get_studio_state',
    description:
      'Returns the current garment, color, view, print technique, print-area size in inches, which views have artwork, and every layer on the current view (top-most first) with ids, text styling and geometry in inches.',
    input_schema: obj({}),
    strict: true,
  },
  {
    name: 'set_garment',
    description: 'Switch the garment blank. Artwork on views the new garment shares is kept and refitted to its print areas.',
    input_schema: obj({ garment: { type: 'string', description: 'Garment id from garments_available in get_studio_state (for example tee, hoodie, joggers, tote).' } }),
    strict: true,
  },
  {
    name: 'set_garment_color',
    description: 'Set the garment (fabric) color.',
    input_schema: obj({ hex: { type: 'string', description: '6-digit hex color such as "#1E2A44".' } }),
    strict: true,
  },
  {
    name: 'switch_view',
    description: 'Switch which side of the garment is being edited. Layer tools act on the current view only.',
    input_schema: obj({ view: { type: 'string', description: 'A view id of the current garment, from views in get_studio_state.' } }),
    strict: true,
  },
  {
    name: 'set_print_technique',
    description: 'Set the print technique for the current view. "none" is digital (DTG); vintage is a distressed, cracked look.',
    input_schema: obj({ technique: { type: 'string', enum: ['none', 'screen', 'puff', 'vintage'] } }),
    strict: true,
  },
  {
    name: 'add_text',
    description: 'Add an editable text layer to the current view.',
    input_schema: obj({
      text: { type: 'string', description: 'Use \\n for line breaks.' },
      font_family: { type: 'string', description: 'Google Fonts family name.' },
      font_size_px: { type: 'number', description: 'Font size in studio pixels (the print area is about 20 px per inch on front and back).' },
      color: { type: 'string', description: '6-digit hex ink color.' },
      letter_spacing: { type: 'integer', description: 'Tracking in thousandths of an em (0 is normal, 100 is wide).' },
      bold: { type: 'boolean' },
      italic: { type: 'boolean' },
      placement: PLACEMENT,
    }),
    strict: true,
  },
  {
    name: 'add_svg_artwork',
    description: 'Add vector artwork you write as SVG markup to the current view. It stays vector for 300 DPI print output.',
    input_schema: obj({
      name: { type: 'string', description: 'Short layer name.' },
      svg: { type: 'string', description: 'Complete <svg> document with a viewBox and flat fills.' },
      placement: PLACEMENT,
    }),
    strict: true,
  },
  {
    name: 'update_layer',
    description: 'Restyle an existing layer on the current view. Text properties apply to text layers only.',
    input_schema: obj({
      layer_id: { type: 'string' },
      text: nullable({ type: 'string' }, 'New text content.'),
      font_family: nullable({ type: 'string' }, 'Google Fonts family name.'),
      font_size_px: nullable({ type: 'number' }, 'Font size in studio pixels.'),
      color: nullable({ type: 'string' }, '6-digit hex color.'),
      letter_spacing: nullable({ type: 'integer' }, 'Tracking in thousandths of an em.'),
      bold: nullable({ type: 'boolean' }, 'Bold on/off.'),
      italic: nullable({ type: 'boolean' }, 'Italic on/off.'),
      opacity: nullable({ type: 'number' }, 'Opacity from 0.05 to 1.'),
    }),
    strict: true,
  },
  {
    name: 'transform_layer',
    description: 'Resize, move or rotate a layer on the current view, using inches relative to the print area.',
    input_schema: obj({
      layer_id: { type: 'string' },
      width_in: nullable({ type: 'number' }, 'New width in inches (height scales proportionally).'),
      center_offset_in: nullable({ type: 'number' }, 'Horizontal offset of the layer center from the print-area center, in inches.'),
      top_in: nullable({ type: 'number' }, 'Distance from the top of the print area to the top of the layer, in inches.'),
      rotation_deg: nullable({ type: 'number' }, 'Rotation in degrees.'),
    }),
    strict: true,
  },
  {
    name: 'apply_placement',
    description: 'Scale and align layers to a placement preset as a group. If layer_ids is empty, every unlocked layer on the view is used. Full Back switches to the back view first.',
    input_schema: obj({
      preset: { type: 'string', enum: ['left-chest', 'center-chest', 'full-back'] },
      layer_ids: { type: 'array', items: { type: 'string' } },
    }),
    strict: true,
  },
  {
    name: 'arrange_layer',
    description: 'Change a layer’s stacking order on the current view.',
    input_schema: obj({
      layer_id: { type: 'string' },
      direction: { type: 'string', enum: ['front', 'forward', 'backward', 'back'] },
    }),
    strict: true,
  },
  {
    name: 'delete_layer',
    description: 'Delete a layer from the current view.',
    input_schema: obj({ layer_id: { type: 'string' } }),
    strict: true,
  },
  {
    name: 'undo',
    description: 'Undo the last change on the current view.',
    input_schema: obj({}),
    strict: true,
  },
  {
    name: 'view_mockup',
    description: 'Render the current view as a mockup image (garment, artwork and print texture) so you can see and check the design.',
    input_schema: obj({}),
    strict: true,
  },
];

export type StudioToolName =
  | 'get_studio_state'
  | 'set_garment'
  | 'set_garment_color'
  | 'switch_view'
  | 'set_print_technique'
  | 'add_text'
  | 'add_svg_artwork'
  | 'update_layer'
  | 'transform_layer'
  | 'apply_placement'
  | 'arrange_layer'
  | 'delete_layer'
  | 'undo'
  | 'view_mockup';
