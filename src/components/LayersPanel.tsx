import { useState, type RefObject } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  Layers,
  Lock,
  MoveHorizontal,
  MoveVertical,
  PenTool,
  SlidersHorizontal,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import type { LayerInfo, SelectionInfo } from '../types';
import type { DesignCanvasHandle } from './DesignCanvas';
import { Section } from './Toolbar';

interface Props {
  layers: LayerInfo[];
  selection: SelectionInfo | null;
  canvas: RefObject<DesignCanvasHandle | null>;
}

const KIND_ICON = {
  text: <Type size={13} />,
  image: <ImageIcon size={13} />,
  vector: <PenTool size={13} />,
  shape: <PenTool size={13} />,
};

function IconBtn({ onClick, title, children, danger }: { onClick(): void; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.02] transition ${
        danger ? 'text-zinc-400 hover:border-red-500/40 hover:text-red-400' : 'text-zinc-400 hover:border-white/20 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

export function PropertiesPanel({ selection, canvas }: Omit<Props, 'layers'>) {
  const api = () => canvas.current;
  if (!selection) {
    return (
      <Section title="Selection" icon={<SlidersHorizontal size={14} />}>
        <p className="text-xs leading-relaxed text-zinc-500">
          Select a layer to move, scale and rotate it. Drag near the center to snap. Shortcuts: <kbd>Del</kbd> delete,{' '}
          <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate, arrows nudge, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo.
        </p>
      </Section>
    );
  }
  const lowDpi = selection.effectiveDpi !== undefined && selection.effectiveDpi < 150;
  return (
    <Section title="Selection" icon={<SlidersHorizontal size={14} />}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{selection.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {selection.widthIn.toFixed(2)}″ × {selection.heightIn.toFixed(2)}″ · {selection.angle}°
        </span>
      </div>

      {selection.effectiveDpi !== undefined && (
        <div
          className={`mb-3 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${
            lowDpi ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {lowDpi && <AlertTriangle size={13} />}
          {selection.effectiveDpi} DPI at this size{lowDpi ? ' — too low for sharp prints (aim for 300)' : ' — print ready'}
        </div>
      )}

      <label className="block text-[11px] text-zinc-400">
        <span className="flex justify-between">
          Opacity <span className="font-mono text-zinc-300">{Math.round(selection.opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={selection.opacity}
          onChange={(e) => api()?.setOpacity(Number(e.target.value))}
          className="lc-range mt-1 w-full"
        />
      </label>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <IconBtn onClick={() => api()?.arrange('front')} title="Bring to front">
          <ArrowUpToLine size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.arrange('forward')} title="Bring forward">
          <ChevronUp size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.arrange('backward')} title="Send backward">
          <ChevronDown size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.arrange('back')} title="Send to back">
          <ArrowDownToLine size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.center('h')} title="Center horizontally">
          <MoveHorizontal size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.center('v')} title="Center vertically">
          <MoveVertical size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.flip('x')} title="Flip horizontal">
          <FlipHorizontal2 size={14} />
        </IconBtn>
        <IconBtn onClick={() => api()?.flip('y')} title="Flip vertical">
          <FlipVertical2 size={14} />
        </IconBtn>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <IconBtn onClick={() => api()?.duplicateSelected()} title="Duplicate (Ctrl+D)">
          <span className="flex items-center gap-1.5 text-xs">
            <Copy size={13} /> Duplicate
          </span>
        </IconBtn>
        <IconBtn onClick={() => api()?.deleteSelected()} title="Delete (Del)" danger>
          <span className="flex items-center gap-1.5 text-xs">
            <Trash2 size={13} /> Delete
          </span>
        </IconBtn>
      </div>
    </Section>
  );
}

export function LayersPanel({ layers, selection, canvas }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const api = () => canvas.current;

  return (
    <Section
      title="Layers"
      icon={<Layers size={14} />}
      right={<span className="text-[11px] text-zinc-500">{layers.length}</span>}
    >
      {layers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-500">
          No layers on this view yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {layers.map((l, i) => {
            const selected = selection && !selection.multiple && selection.id === l.id;
            return (
              <li
                key={l.id}
                onClick={() => api()?.selectLayer(l.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                  selected ? 'border-amber-400/50 bg-amber-400/[0.08]' : 'border-transparent hover:bg-white/[0.04]'
                } ${l.visible ? '' : 'opacity-50'}`}
              >
                <span className="text-zinc-500">{KIND_ICON[l.kind]}</span>
                {editing === l.id ? (
                  <input
                    autoFocus
                    defaultValue={l.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      api()?.renameLayer(l.id, e.target.value);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="lc-input h-6 min-w-0 flex-1 px-1.5 py-0 text-xs"
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate text-zinc-200"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(l.id);
                    }}
                    title="Double-click to rename"
                  >
                    {l.name}
                  </span>
                )}
                <span className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                  <button
                    title="Move up"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      api()?.arrange('forward', l.id);
                    }}
                    className="rounded p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    title="Move down"
                    disabled={i === layers.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      api()?.arrange('backward', l.id);
                    }}
                    className="rounded p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    title={l.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      api()?.toggleVisible(l.id);
                    }}
                    className="rounded p-0.5 text-zinc-400 hover:text-white"
                  >
                    {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    title={l.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => {
                      e.stopPropagation();
                      api()?.toggleLock(l.id);
                    }}
                    className={`rounded p-0.5 hover:text-white ${l.locked ? 'text-amber-400' : 'text-zinc-400'}`}
                  >
                    {l.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    title="Delete layer"
                    onClick={(e) => {
                      e.stopPropagation();
                      api()?.removeLayer(l.id);
                    }}
                    className="rounded p-0.5 text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
