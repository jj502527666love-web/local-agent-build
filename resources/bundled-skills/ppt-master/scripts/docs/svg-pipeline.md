# SVG Pipeline Tools

These tools cover post-processing, SVG validation, speaker notes, and PPTX export.

## Recommended Pipeline

Run these steps in order:

```bash
node scripts/total_md_split.cjs <project_path>
node scripts/finalize_svg.cjs <project_path>
node scripts/svg_to_pptx.cjs <project_path> -s final
```

## `finalize_svg.cjs`

Unified post-processing entry point (Node.js). This is the preferred way to run SVG cleanup.

It aggregates:
- `embed_icons.py`
- `crop_images.py`
- `fix_image_aspect.py`
- `embed_images.py`
- `flatten_tspan.py`
- `svg_rect_to_path.py`

## `svg_to_pptx.cjs`

Convert project SVGs into PPTX (Node.js, zero external dependencies).

```bash
node scripts/svg_to_pptx.cjs <project_path> -s final
node scripts/svg_to_pptx.cjs <project_path> -s final -o output.pptx
node scripts/svg_to_pptx.cjs <project_path> -s final --no-notes
```

Behavior:
- Default output: timestamped file in `exports/` — `<project_name>_<timestamp>.pptx` (SVG-as-image mode)
- Recommended source directory: `svg_final/`
- Speaker notes are embedded automatically unless `--no-notes` is used
- No external dependencies required (built-in ZIP writer)

## `total_md_split.cjs`

Split `total.md` into per-slide note files (Node.js).

```bash
node scripts/total_md_split.cjs <project_path>
node scripts/total_md_split.cjs <project_path> -o <output_directory>
node scripts/total_md_split.cjs <project_path> -q
```

Requirements:
- Each section begins with `# `
- Heading text matches the SVG filename
- Sections are separated by `---`

## `svg_quality_checker.cjs`

Validate SVG technical compliance (Node.js).

```bash
node scripts/svg_quality_checker.cjs examples/project/svg_output/01_cover.svg
node scripts/svg_quality_checker.cjs examples/project/svg_output
node scripts/svg_quality_checker.cjs examples/project
node scripts/svg_quality_checker.cjs examples/project --format ppt169
```

Checks include:
- `viewBox`
- banned elements
- width/height consistency
- line-break structure

## `svg_position_calculator.py`

Analyze or pre-calculate chart coordinates.

Common commands:

```bash
python3 scripts/svg_position_calculator.py analyze <svg_file>
python3 scripts/svg_position_calculator.py interactive
python3 scripts/svg_position_calculator.py calc bar --data "East:185,South:142"
python3 scripts/svg_position_calculator.py calc pie --data "A:35,B:25,C:20"
python3 scripts/svg_position_calculator.py from-json config.json
```

Use this when chart geometry needs to be verified before or after AI generation.

## Advanced Standalone Tools

### `flatten_tspan.py`

```bash
python3 scripts/svg_finalize/flatten_tspan.py examples/<project>/svg_output
python3 scripts/svg_finalize/flatten_tspan.py path/to/input.svg path/to/output.svg
```

### `svg_rect_to_path.py`

```bash
python3 scripts/svg_finalize/svg_rect_to_path.py <project_path>
python3 scripts/svg_finalize/svg_rect_to_path.py <project_path> -s final
python3 scripts/svg_finalize/svg_rect_to_path.py path/to/file.svg
```

Use when rounded corners must survive PowerPoint shape conversion.

### `fix_image_aspect.py`

```bash
python3 scripts/svg_finalize/fix_image_aspect.py path/to/slide.svg
python3 scripts/svg_finalize/fix_image_aspect.py 01_cover.svg 02_toc.svg
python3 scripts/svg_finalize/fix_image_aspect.py --dry-run path/to/slide.svg
```

Use when embedded images stretch after PowerPoint shape conversion.

### `embed_icons.py`

```bash
python3 scripts/svg_finalize/embed_icons.py output.svg
python3 scripts/svg_finalize/embed_icons.py svg_output/*.svg
python3 scripts/svg_finalize/embed_icons.py --dry-run svg_output/*.svg
```

Replaces `<use data-icon="chunk/name" .../>`, `<use data-icon="tabler-filled/name" .../>` and `<use data-icon="tabler-outline/name" .../>` placeholders with actual SVG path elements. Use for manual icon embedding checks outside `finalize_svg.cjs`.

## PPT Compatibility Rules

Use PowerPoint-safe transparency syntax:

| Avoid | Use instead |
|------|-------------|
| `fill=\"rgba(...)\"` | `fill=\"#hex\"` + `fill-opacity` |
| `<g opacity=\"...\">` | Set opacity on each child |
| `<image opacity=\"...\">` | Overlay with a mask layer |

PowerPoint also has trouble with:
- marker-based arrows
- unsupported filters
- direct SVG features not mapped to DrawingML
