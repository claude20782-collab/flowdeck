# backgrounds — canvas animated background renderers

`renderers.ts` is fully standalone (zero imports, no React/deps) and driven by `components/app/BackgroundCanvas`.
- `RendererOpts`: `intensity` (0..1), `speed` (~0.25..2), `colors` = `{ accent, accent2, text, bg }` hex strings.
- `Renderer`: `init(ctx, w, h, opts)` on start + resize; `frame(ctx, dt, w, h, opts)` draws one frame (dt in ms) — renderers never clear.
- Exports: `RENDERERS`, `RENDERER_IDS` (UI order), `RENDERER_LABELS`, `TRAIL_RENDERERS`, `hexToRgba` helper.
- `TRAIL_RENDERERS` (`starfield`, `matrix`): the caller fades with `rgba(bg, 0.2)` instead of clearing, so previous frames persist as trails.
Counts scale with intensity × canvas area; all motion is dt-based (frame-rate independent); state is kept per canvas context.
