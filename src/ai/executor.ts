import type Anthropic from '@anthropic-ai/sdk';
import type { DesignCanvasHandle, TextStyle } from '../components/DesignCanvas';
import { getGarment, getZone, garmentViews, hasGarment, hasView, listGarments } from '../data/garments';
import type { GarmentId, PrintEffect, ViewDesigns, ViewEffects, ViewId } from '../types';
import { effectFor, hasArtwork } from '../types';
import { nearestPantone, normalizeHex } from '../utils/color';
import { effectName } from '../utils/printEffects';
import { getPlacement, type PlacementId } from '../utils/placements';
import type { StudioToolName } from './toolDefs';

type ToolUse = Anthropic.Beta.BetaToolUseBlock;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** What the executor needs from the studio. Provided by App and read fresh on every call. */
export interface AgentContext {
  canvas(): DesignCanvasHandle | null;
  state(): { garment: GarmentId; color: string; view: ViewId; designs: ViewDesigns; effects: ViewEffects };
  /** Resolve once the canvas for the new garment/view has mounted and loaded. */
  setGarment(g: GarmentId): Promise<void>;
  setView(v: ViewId): Promise<void>;
  setColor(hex: string): void;
  setEffect(e: PrintEffect): void;
  /** Base64 JPEG of the current view's mockup (no data: prefix). */
  mockupJpeg(): Promise<string>;
}

class ToolInputError extends Error {}

const EFFECTS: PrintEffect[] = ['none', 'screen', 'puff', 'vintage'];
const MAX_SVG_CHARS = 200_000;

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolInputError(`"${field}" must be a non-empty string.`);
  return v;
};
const num = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ToolInputError(`"${field}" must be a number.`);
  return v;
};
const hex = (v: unknown, field: string): string => {
  const h = normalizeHex(str(v, field));
  if (!h) throw new ToolInputError(`"${field}" must be a 6-digit hex color like "#1E2A44".`);
  return h;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], field: string): T => {
  if (!allowed.includes(v as T)) throw new ToolInputError(`"${field}" must be one of: ${allowed.join(', ')}.`);
  return v as T;
};
const opt = <T>(v: unknown, parse: (x: unknown) => T): T | undefined => (v == null ? undefined : parse(v));

const ok = (id: string, content: unknown): ToolResult => ({
  type: 'tool_result',
  tool_use_id: id,
  content: typeof content === 'string' ? content : JSON.stringify(content),
});
const fail = (id: string, message: string): ToolResult => ({ type: 'tool_result', tool_use_id: id, content: message, is_error: true });

function requireCanvas(ctx: AgentContext): DesignCanvasHandle {
  const c = ctx.canvas();
  if (!c) throw new Error('The design canvas is not ready yet. Try again.');
  return c;
}

function placementFor(v: unknown) {
  const p = oneOf(v, ['left-chest', 'center-chest', 'full-back', 'none'] as const, 'placement');
  return p === 'none' ? null : getPlacement(p as PlacementId);
}

function studioState(ctx: AgentContext) {
  const s = ctx.state();
  const zone = getZone(s.garment, s.view);
  return {
    garment: s.garment,
    garment_name: getGarment(s.garment).name,
    garment_color: s.color,
    garment_color_pantone: nearestPantone(s.color).name,
    view: s.view,
    print_technique: effectName(effectFor(s.effects, s.view)),
    print_area: { width_in: zone.widthIn, height_in: zone.heightIn, placement: zone.placement },
    views: garmentViews(s.garment).map((v) => ({ id: v.id, label: v.label, print_area_in: `${v.zone.widthIn} x ${v.zone.heightIn}` })),
    views_with_artwork: garmentViews(s.garment).map((v) => v.id).filter((v) => hasArtwork(s.designs[v])),
    garments_available: listGarments().map((g) => ({ id: g.id, name: g.name, category: g.category })),
    layers_top_first: (ctx.canvas()?.describeLayers() ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      visible: l.visible,
      locked: l.locked,
      width_in: l.widthIn,
      height_in: l.heightIn,
      center_offset_in: l.centerOffsetIn,
      top_in: l.topIn,
      rotation_deg: l.rotationDeg,
      opacity: l.opacity,
      ...(l.kind === 'text'
        ? {
            text: l.text,
            font_family: l.fontFamily,
            font_size_px: l.fontSizePx,
            color: l.color,
            letter_spacing: l.letterSpacing,
            bold: l.bold,
            italic: l.italic,
          }
        : {}),
      ...(l.effectiveDpi != null ? { effective_dpi: l.effectiveDpi } : {}),
    })),
  };
}

function layerMissing(ctx: AgentContext, id: string) {
  return `No layer "${id}" on the ${ctx.state().view} view. Call get_studio_state for current layer ids.`;
}

/** Runs one tool call against the studio and returns its tool_result block. Never throws. */
export async function runStudioTool(block: ToolUse, ctx: AgentContext): Promise<ToolResult> {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const id = block.id;
  try {
    switch (block.name as StudioToolName) {
      case 'get_studio_state':
        return ok(id, studioState(ctx));

      case 'set_garment': {
        const g = str(input.garment, 'garment');
        if (!hasGarment(g)) throw new ToolInputError(`Unknown garment "${g}". See garments_available in get_studio_state.`);
        await ctx.setGarment(g);
        return ok(id, { garment: getGarment(g).name, views: garmentViews(g).map((v) => v.id), current_view: ctx.state().view });
      }

      case 'set_garment_color': {
        const h = hex(input.hex, 'hex');
        ctx.setColor(h);
        return ok(id, `Garment color set to ${h} (nearest ${nearestPantone(h).name}).`);
      }

      case 'switch_view': {
        const v = str(input.view, 'view');
        if (!hasView(ctx.state().garment, v)) {
          throw new ToolInputError(`The ${getGarment(ctx.state().garment).name} has no "${v}" view. Views: ${garmentViews(ctx.state().garment).map((x) => x.id).join(', ')}.`);
        }
        await ctx.setView(v);
        return ok(id, `Now editing the ${v} view.`);
      }

      case 'set_print_technique': {
        const e = oneOf(input.technique, EFFECTS, 'technique');
        ctx.setEffect(e);
        return ok(id, `${ctx.state().view} view print technique set to ${effectName(e)}.`);
      }

      case 'add_text': {
        const canvas = requireCanvas(ctx);
        const style: TextStyle = {
          fontFamily: str(input.font_family, 'font_family'),
          fontSize: Math.max(6, Math.min(400, num(input.font_size_px, 'font_size_px'))),
          fill: hex(input.color, 'color'),
          charSpacing: Math.round(num(input.letter_spacing, 'letter_spacing')),
          fontWeight: input.bold ? 'bold' : 'normal',
          fontStyle: input.italic ? 'italic' : 'normal',
          textAlign: 'center',
          underline: false,
        };
        const text = str(input.text, 'text').replace(/\\n/g, '\n');
        const placement = placementFor(input.placement);
        await canvas.addText(text, style);
        if (placement) canvas.applyPlacement(placement);
        const layer = canvas.describeLayers()[0];
        return ok(id, { added_layer_id: layer?.id, width_in: layer?.widthIn, height_in: layer?.heightIn });
      }

      case 'add_svg_artwork': {
        const canvas = requireCanvas(ctx);
        const svg = str(input.svg, 'svg').trim();
        if (!/^<\?xml[\s\S]*?<svg[\s>]|^<svg[\s>]/i.test(svg)) throw new ToolInputError('"svg" must be a complete <svg> document.');
        if (svg.length > MAX_SVG_CHARS) throw new ToolInputError(`SVG is too large (${svg.length} chars); keep it under ${MAX_SVG_CHARS}.`);
        const name = str(input.name, 'name').slice(0, 40);
        const file = new File([svg], `${name}.svg`, { type: 'image/svg+xml' });
        await canvas.addImageFile(file, placementFor(input.placement));
        const layer = canvas.describeLayers()[0];
        return ok(id, { added_layer_id: layer?.id, width_in: layer?.widthIn, height_in: layer?.heightIn });
      }

      case 'update_layer': {
        const canvas = requireCanvas(ctx);
        const layerId = str(input.layer_id, 'layer_id');
        const patch: Partial<TextStyle> & { text?: string; opacity?: number } = {};
        const text = opt(input.text, (v) => str(v, 'text').replace(/\\n/g, '\n'));
        if (text != null) patch.text = text;
        const font = opt(input.font_family, (v) => str(v, 'font_family'));
        if (font) patch.fontFamily = font;
        const size = opt(input.font_size_px, (v) => num(v, 'font_size_px'));
        if (size != null) patch.fontSize = Math.max(6, Math.min(400, size));
        const color = opt(input.color, (v) => hex(v, 'color'));
        if (color) patch.fill = color;
        const spacing = opt(input.letter_spacing, (v) => num(v, 'letter_spacing'));
        if (spacing != null) patch.charSpacing = Math.round(spacing);
        if (input.bold != null) patch.fontWeight = input.bold ? 'bold' : 'normal';
        if (input.italic != null) patch.fontStyle = input.italic ? 'italic' : 'normal';
        const opacity = opt(input.opacity, (v) => num(v, 'opacity'));
        if (opacity != null) patch.opacity = opacity;
        if (!(await canvas.updateLayer(layerId, patch))) return fail(id, layerMissing(ctx, layerId));
        return ok(id, canvas.describeLayers().find((l) => l.id === layerId) ?? 'Updated.');
      }

      case 'transform_layer': {
        const canvas = requireCanvas(ctx);
        const layerId = str(input.layer_id, 'layer_id');
        const done = canvas.setLayerGeometry(layerId, {
          widthIn: opt(input.width_in, (v) => num(v, 'width_in')),
          centerOffsetIn: opt(input.center_offset_in, (v) => num(v, 'center_offset_in')),
          topIn: opt(input.top_in, (v) => num(v, 'top_in')),
          rotationDeg: opt(input.rotation_deg, (v) => num(v, 'rotation_deg')),
        });
        if (!done) return fail(id, layerMissing(ctx, layerId));
        return ok(id, canvas.describeLayers().find((l) => l.id === layerId) ?? 'Moved.');
      }

      case 'apply_placement': {
        const preset = getPlacement(oneOf(input.preset, ['left-chest', 'center-chest', 'full-back'] as const, 'preset'));
        const ids = Array.isArray(input.layer_ids) ? input.layer_ids.filter((x): x is string => typeof x === 'string') : [];
        if (preset.id === 'full-back' && ctx.state().view !== 'back') {
          if (!hasView(ctx.state().garment, 'back')) return fail(id, `The ${getGarment(ctx.state().garment).name} has no back view.`);
          await ctx.setView('back');
        }
        const canvas = requireCanvas(ctx);
        const missing = canvas.selectLayers(ids);
        if (missing.length) return fail(id, layerMissing(ctx, missing[0]));
        if (!canvas.applyPlacement(preset)) return fail(id, `There is no artwork on the ${ctx.state().view} view to place.`);
        return ok(id, `Applied ${preset.name} on the ${ctx.state().view} view.`);
      }

      case 'arrange_layer': {
        const canvas = requireCanvas(ctx);
        const layerId = str(input.layer_id, 'layer_id');
        if (!canvas.describeLayers().some((l) => l.id === layerId)) return fail(id, layerMissing(ctx, layerId));
        canvas.arrange(oneOf(input.direction, ['front', 'forward', 'backward', 'back'] as const, 'direction'), layerId);
        return ok(id, { layer_order_top_first: canvas.describeLayers().map((l) => l.id) });
      }

      case 'delete_layer': {
        const canvas = requireCanvas(ctx);
        const layerId = str(input.layer_id, 'layer_id');
        if (!canvas.describeLayers().some((l) => l.id === layerId)) return fail(id, layerMissing(ctx, layerId));
        canvas.removeLayer(layerId);
        return ok(id, 'Layer deleted.');
      }

      case 'undo': {
        await requireCanvas(ctx).undo();
        return ok(id, 'Undid the last change. Layer ids may have changed; call get_studio_state before editing.');
      }

      case 'view_mockup': {
        const s = ctx.state();
        const data = await ctx.mockupJpeg();
        return {
          type: 'tool_result',
          tool_use_id: id,
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
            {
              type: 'text',
              text: `${getGarment(s.garment).name}, ${s.view} view, color ${s.color}, ${effectName(effectFor(s.effects, s.view))}. The dashed print area isn't drawn in the mockup.`,
            },
          ],
        };
      }

      default:
        return fail(id, `Unknown tool "${block.name}".`);
    }
  } catch (e) {
    const msg = e instanceof ToolInputError ? `Invalid input: ${e.message}` : `Tool failed: ${(e as Error).message}`;
    return fail(id, msg);
  }
}

/** Short human label for a tool call, shown in the chat. */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  const q = (v: unknown) => (typeof v === 'string' ? `“${v.length > 28 ? v.slice(0, 27) + '…' : v}”` : '');
  switch (name as StudioToolName) {
    case 'get_studio_state':
      return 'Read the design';
    case 'set_garment':
      return `Switched to ${hasGarment(String(input.garment)) ? getGarment(String(input.garment)).short : input.garment}`;
    case 'set_garment_color':
      return `Garment color ${String(input.hex ?? '').toUpperCase()}`;
    case 'switch_view':
      return `Switched to ${input.view} view`;
    case 'set_print_technique':
      return `Print technique: ${effectName(input.technique as PrintEffect)}`;
    case 'add_text':
      return `Added text ${q(input.text)}`;
    case 'add_svg_artwork':
      return `Drew artwork ${q(input.name)}`;
    case 'update_layer':
      return 'Restyled a layer';
    case 'transform_layer':
      return 'Moved / resized a layer';
    case 'apply_placement':
      return `Placement: ${getPlacement(input.preset as PlacementId)?.name ?? input.preset}`;
    case 'arrange_layer':
      return `Layer order: ${input.direction}`;
    case 'delete_layer':
      return 'Deleted a layer';
    case 'undo':
      return 'Undo';
    case 'view_mockup':
      return 'Checked the mockup';
    default:
      return name;
  }
}
