# Troubleshooting

## Validation Failed

1. Run:

```bash
node scripts/project_manager.cjs validate <project_path>
```

2. Fix missing files or invalid directories reported by the validator.
3. Re-run validation before post-processing or export.

## SVG Preview Looks Wrong

1. Check the file path and filename.
2. Confirm naming conventions are consistent.
3. Preview via a local server if browser file loading is inconsistent:

```bash
python3 -m http.server --directory <svg_output_path> 8000
```

## Speaker Notes Do Not Split

Check `total.md`:
- headings must start with `# `
- heading text must match SVG filenames
- sections must be separated by `---`

Then rerun:

```bash
node scripts/total_md_split.cjs <project_path>
```

## PPT Export Quality Issues

Preferred sequence:

```bash
node scripts/total_md_split.cjs <project_path>
node scripts/finalize_svg.cjs <project_path>
node scripts/svg_to_pptx.cjs <project_path> -s final
```

Do not export directly from `svg_output/` when `svg_final/` exists.

## Dependency Checklist

Most tools use the standard library. Install extra dependencies only when needed:

```bash
pip install -r requirements.txt
```

Important optional packages:
- `Pillow` for image utilities (Python scripts only)
- `numpy` for watermark removal
- `PyMuPDF` for PDF conversion
- `google-genai` / `openai` for image generation backends

Note: Core pipeline tools (total_md_split, finalize_svg, svg_to_pptx, project_manager, analyze_images, svg_quality_checker) are now Node.js and require no Python dependencies.
