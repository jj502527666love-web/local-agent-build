# PPT Master Toolset

This directory contains user-facing scripts for conversion, project setup, SVG processing, export, and image generation.

## Directory Layout

- Top-level `scripts/`: runnable entry scripts
- `scripts/source_to_md/`: source-document → Markdown converters (`pdf_to_md.py`, `doc_to_md.py`, `ppt_to_md.py`, `web_to_md.py`, `web_to_md.cjs`)
- `scripts/image_backends/`: internal provider implementations used by `image_gen.py`
- `scripts/template_import/`: internal PPTX reference-preparation helpers used by `pptx_template_import.py`
- `scripts/svg_finalize/`: internal post-processing helpers (reference for `finalize_svg.cjs`)
- `scripts/docs/`: topic-focused script documentation
- `scripts/assets/`: static assets consumed by scripts

## Quick Start

Typical end-to-end workflow:

```bash
python3 scripts/source_to_md/pdf_to_md.py <file.pdf>
# or
python3 scripts/source_to_md/ppt_to_md.py <deck.pptx>
node scripts/project_manager.cjs init <project_name> --format ppt169
node scripts/project_manager.cjs import-sources <project_path> <source_files...> --move
node scripts/total_md_split.cjs <project_path>
node scripts/finalize_svg.cjs <project_path>
node scripts/svg_to_pptx.cjs <project_path> -s final
```

Repository update:

```bash
python3 scripts/update_repo.py
```

## Script Index

| Area | Primary scripts | Documentation |
|------|-----------------|---------------|
| Conversion | `source_to_md/pdf_to_md.py`, `source_to_md/doc_to_md.py`, `source_to_md/ppt_to_md.py`, `source_to_md/web_to_md.py`, `source_to_md/web_to_md.cjs` | [docs/conversion.md](./docs/conversion.md) |
| Project management | `project_manager.cjs`, `batch_validate.py`, `generate_examples_index.py`, `error_helper.py`, `pptx_template_import.py` | [docs/project.md](./docs/project.md) |
| SVG pipeline | `finalize_svg.cjs`, `svg_to_pptx.cjs`, `total_md_split.cjs`, `svg_quality_checker.cjs` | [docs/svg-pipeline.md](./docs/svg-pipeline.md) |
| Spec maintenance | `update_spec.py` | [docs/update_spec.md](./docs/update_spec.md) |
| Image tools | `image_gen` (built-in tool), `image_gen.py` (CLI fallback), `analyze_images.cjs`, `gemini_watermark_remover.py` | [docs/image.md](./docs/image.md) |
| Repo maintenance | `update_repo.py` | README install/update section |
| Troubleshooting | validation, preview, export, dependency issues | [docs/troubleshooting.md](./docs/troubleshooting.md) |

## High-Frequency Commands

Conversion:

```bash
python3 scripts/source_to_md/pdf_to_md.py <file.pdf>
python3 scripts/source_to_md/ppt_to_md.py <deck.pptx>
python3 scripts/source_to_md/doc_to_md.py <file.docx>
python3 scripts/source_to_md/web_to_md.py <url>
```

Project setup:

```bash
node scripts/project_manager.cjs init <project_name> --format ppt169
node scripts/project_manager.cjs import-sources <project_path> <source_files...> --move
node scripts/project_manager.cjs validate <project_path>
```

Template source import:

```bash
python3 scripts/pptx_template_import.py <template.pptx>
python3 scripts/pptx_template_import.py <template.pptx> --manifest-only
```

Post-processing and export:

```bash
node scripts/total_md_split.cjs <project_path>
node scripts/finalize_svg.cjs <project_path>
node scripts/svg_to_pptx.cjs <project_path> -s final
```

Image generation:

```
image_gen({ action: "list_providers" })
image_gen({ action: "generate", prompt: "A modern futuristic workspace", model_provider_id: "<id>", model_id: "<model>", size: "16:9", output_dir: "<project_path>/images" })
```

CLI fallback (requires Python + .env):
```bash
python3 scripts/image_gen.py "A modern futuristic workspace"
node scripts/analyze_images.cjs <project_path>/images
```

Repository update:

```bash
python3 scripts/update_repo.py
python3 scripts/update_repo.py --skip-pip
```

## Recommendations

- Keep one user-facing entry point per workflow at the top level of `scripts/`
- Move provider-specific or helper internals into subdirectories
- Prefer the unified entry points `project_manager.cjs`, `finalize_svg.cjs`, and the built-in `image_gen` tool
- Prefer `svg_final/` over `svg_output/` when exporting

## Related Docs

- [Conversion Tools](./docs/conversion.md)
- [Project Tools](./docs/project.md)
- [SVG Pipeline Tools](./docs/svg-pipeline.md)
- [Image Tools](./docs/image.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [AGENTS Guide](../../../AGENTS.md)

_Last updated: 2026-04-09_
