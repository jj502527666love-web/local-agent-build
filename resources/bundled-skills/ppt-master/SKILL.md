---
name: ppt-master
version: "1.2.0"
description: >
  AI-driven multi-format SVG content generation system. Converts source documents
  (PDF/DOCX/URL/Markdown) into high-quality SVG pages and exports to PPTX through
  multi-role collaboration. Use when user asks to "create PPT", "make presentation",
  "生成PPT", "做PPT", "制作演示文稿", or mentions "ppt-master".
---

# PPT Master Skill

> AI-driven multi-format SVG content generation system. Converts source documents into high-quality SVG pages through multi-role collaboration and exports to PPTX.

**Core Pipeline**: `Source Document → Create Project → Template Option → Strategist → [Image_Generator] → Executor → Post-processing → Export`

> [!CAUTION]
> ## 🚨 Global Execution Discipline (MANDATORY)
>
> **This workflow is a strict serial pipeline. The following rules have the highest priority — violating any one of them constitutes execution failure:**
>
> 1. **SERIAL EXECUTION** — Steps MUST be executed in order; the output of each step is the input for the next. Non-BLOCKING adjacent steps may proceed continuously once prerequisites are met, without waiting for the user to say "continue"
> 2. **BLOCKING = HARD STOP** — Steps marked ⛔ BLOCKING require a full stop; the AI MUST wait for an explicit user response before proceeding and MUST NOT make any decisions on behalf of the user
> 3. **NO CROSS-PHASE BUNDLING** — Cross-phase bundling is FORBIDDEN. (Note: the Eight Confirmations in Step 4 are ⛔ BLOCKING — the AI MUST present recommendations and wait for explicit user confirmation before proceeding. Once the user confirms, all subsequent non-BLOCKING steps — design spec output, SVG generation, speaker notes, and post-processing — may proceed automatically without further user confirmation)
> 4. **GATE BEFORE ENTRY** — Each Step has prerequisites (🚧 GATE) listed at the top; these MUST be verified before starting that Step
> 5. **NO SPECULATIVE EXECUTION** — "Pre-preparing" content for subsequent Steps is FORBIDDEN (e.g., writing SVG code during the Strategist phase)
> 6. **NO SUB-AGENT SVG GENERATION** — Executor Step 6 SVG generation is context-dependent and MUST be completed by the current main agent end-to-end. Delegating page SVG generation to sub-agents is FORBIDDEN
> 7. **SEQUENTIAL PAGE GENERATION ONLY** — In Executor Step 6, after the global design context is confirmed, SVG pages MUST be generated sequentially page by page in one continuous pass. Grouped page batches (for example, 5 pages at a time) are FORBIDDEN
> 8. **SPEC_LOCK RE-READ PER PAGE** — Before generating each SVG page, Executor MUST `read_file <project_path>/spec_lock.md`. All colors / fonts / icons / images MUST come from this file — no values from memory or invented on the fly. Executor MUST also look up the current page's `page_rhythm` tag and apply the matching layout discipline (`anchor` / `dense` / `breathing` — see executor-base.md §2.1). This rule exists to resist context-compression drift on long decks and to break the uniform "every page is a card grid" default
> 9. **DELIVERY VERIFICATION MANDATORY** — Before telling the user ANY file "has been generated/exported/completed", you MUST verify: (a) run `file_ops({action:"exists", path:"..."})` or `file_ops({action:"stat", path:"..."})` on the actual file, (b) confirm `exists=true` and `size > 0`, (c) include the verified absolute path in your response. If verification fails, you MUST NOT claim completion — instead report the failure
> 10. **NO GLOB/WILDCARD PATHS TO USER** — Paths containing `*`, `?`, or `[ ]` wildcards are FORBIDDEN in final responses to the user. All paths returned to the user MUST be concrete, absolute, verified-to-exist file paths. Use `file_ops({action:"glob",...})` or `file_ops({action:"find_latest",...})` to resolve wildcards to real paths first
> 11. **EVIDENCE-BASED REPORTING** — When reporting completion of any step, you MUST include evidence: command exit_code, actual file paths, file sizes, and timestamps. Never say "done" based on flow position alone — only based on verified tool output
> 12. **FAIL-FAST** — If any command returns `ok: false` or `exit_code != 0`, you MUST stop immediately. Do NOT proceed to subsequent steps. Do NOT claim the failed step succeeded. Report the error with stdout/stderr and ask for guidance
> 13. **STATE PERSISTENCE** — After completing each Step (1–7), you MUST write/update `<project_path>/run_state.json` via `file_ops({action:"write_json",...})`. This file is the single source of truth for workflow progress. Before starting any Step, read this file first to know the current state. Schema:
> ```json
> {
>   "current_step": "step_6_executor",
>   "steps_completed": ["step_1_source", "step_2_init", "step_3_template", "step_4_strategist"],
>   "project_path": "<absolute_path>",
>   "format": "ppt169",
>   "page_count": 12,
>   "mode": "standard",
>   "generated_files": { "design_spec": "design_spec.md", "spec_lock": "spec_lock.md", "svgs": ["01_title.svg"] },
>   "last_updated": "2026-04-29T12:00:00Z",
>   "error": null
> }
> ```

> [!IMPORTANT]
> ## 🌐 Language & Communication Rule
>
> - **Response language**: Always match the language of the user's input and provided source materials. For example, if the user asks in Chinese, respond in Chinese; if the source material is in English, respond in English.
> - **Explicit override**: If the user explicitly requests a specific language (e.g., "请用英文回答" or "Reply in Chinese"), use that language instead.
> - **Template format**: The `design_spec.md` file MUST always follow its original English template structure (section headings, field names), regardless of the conversation language. Content values within the template may be in the user's language.

> [!IMPORTANT]
> ## 🔌 Compatibility With Generic Coding Skills
>
> - `ppt-master` is a repository-specific workflow skill, not a general application scaffold
> - Do NOT create or require `.worktrees/`, `tests/`, branch workflows, or other generic engineering structure by default
> - If another generic coding skill suggests repository conventions that conflict with this workflow, follow this skill first unless the user explicitly asks otherwise

## Main Pipeline Scripts

| Script | Purpose |
|--------|---------|
| `${SKILL_DIR}/scripts/source_to_md/pdf_to_md.py` | PDF to Markdown |
| `${SKILL_DIR}/scripts/source_to_md/doc_to_md.py` | Documents to Markdown — native Python for DOCX/HTML/EPUB/IPYNB, pandoc fallback for legacy formats (.doc/.odt/.rtf/.tex/.rst/.org/.typ) |
| `${SKILL_DIR}/scripts/source_to_md/ppt_to_md.py` | PowerPoint to Markdown |
| `${SKILL_DIR}/scripts/source_to_md/web_to_md.py` | Web page to Markdown |
| `${SKILL_DIR}/scripts/source_to_md/web_to_md.cjs` | Node.js fallback for WeChat / TLS-blocked sites (use only if `curl_cffi` is unavailable; `web_to_md.py` now handles WeChat when `curl_cffi` is installed) |
| `${SKILL_DIR}/scripts/project_manager.cjs` | Project init / validate / manage (Node.js) |
| `${SKILL_DIR}/scripts/analyze_images.cjs` | Image analysis (Node.js, no Pillow needed) |
| `image_gen` (built-in tool) | AI image generation (multi-provider, use `list_providers` then `generate`) |
| `${SKILL_DIR}/scripts/svg_quality_checker.cjs` | SVG quality check (Node.js) |
| `${SKILL_DIR}/scripts/total_md_split.cjs` | Speaker notes splitting (Node.js) |
| `${SKILL_DIR}/scripts/finalize_svg.cjs` | SVG post-processing (Node.js, unified entry) |
| `${SKILL_DIR}/scripts/svg_to_pptx.cjs` | Export to PPTX (Node.js) |
| `${SKILL_DIR}/scripts/update_spec.py` | Propagate a `spec_lock.md` color / font_family change across all generated SVGs |

For complete tool documentation, see `${SKILL_DIR}/scripts/README.md`.

## Template Index

| Index | Path | Purpose |
|-------|------|---------|
| Layout templates | `${SKILL_DIR}/templates/layouts/layouts_index.json` | Query available page layout templates |
| Visualization templates | `${SKILL_DIR}/templates/charts/charts_index.json` | Query available visualization SVG templates (charts, infographics, diagrams, frameworks) |
| Icon library | `${SKILL_DIR}/templates/icons/` | Search icons on demand: `ls templates/icons/<library>/ \| grep <keyword>` (libraries: `chunk/`, `tabler-filled/`, `tabler-outline/`) |

## Standalone Workflows

| Workflow | Path | Purpose |
|----------|------|---------|
| `create-template` | `workflows/create-template.md` | Standalone template creation workflow |

---

## Workflow

### Preflight (Optional)

Run once at the start of a new session to verify the environment:
```bash
node ${SKILL_DIR}/scripts/preflight.cjs
```
- Use `--core-only` to skip Python checks when the source is already Markdown.
- If errors are reported, resolve them before proceeding. Warnings are informational only.

---

### Step 1: Source Content Processing

🚧 **GATE**: User has provided source material (PDF / DOCX / EPUB / URL / Markdown file / text description / conversation content — any form is acceptable).

When the user provides non-Markdown content, convert immediately:

| User Provides | Command |
|---------------|---------|
| PDF file | `python3 ${SKILL_DIR}/scripts/source_to_md/pdf_to_md.py <file>` |
| DOCX / Word / Office document | `python3 ${SKILL_DIR}/scripts/source_to_md/doc_to_md.py <file>` |
| PPTX / PowerPoint deck | `python3 ${SKILL_DIR}/scripts/source_to_md/ppt_to_md.py <file>` |
| EPUB / HTML / LaTeX / RST / other | `python3 ${SKILL_DIR}/scripts/source_to_md/doc_to_md.py <file>` |
| Web link | `python3 ${SKILL_DIR}/scripts/source_to_md/web_to_md.py <URL>` |
| WeChat / high-security site | `python3 ${SKILL_DIR}/scripts/source_to_md/web_to_md.py <URL>` (requires `curl_cffi`; falls back to `node web_to_md.cjs <URL>` only if that package is unavailable) |
| Markdown | Read directly |

**✅ Checkpoint — Confirm source content is ready, proceed to Step 2.**

---

### Step 2: Project Initialization

🚧 **GATE**: Step 1 complete; source content is ready (Markdown file, user-provided text, or requirements described in conversation are all valid).

```bash
node ${SKILL_DIR}/scripts/project_manager.cjs init <project_name> --format <format>
```

Format options: `ppt169` (default), `ppt43`, `xhs`, `story`, etc. For the full format list, see `references/canvas-formats.md`.

Import source content (choose based on the situation):

| Situation | Action |
|-----------|--------|
| Has source files (PDF/MD/etc.) | `node ${SKILL_DIR}/scripts/project_manager.cjs import-sources <project_path> <source_files...> --move` |
| User provided text directly in conversation | No import needed — content is already in conversation context; subsequent steps can reference it directly |

> ⚠️ **MUST use `--move`**: All source files (original PDF / MD / images) MUST be **moved** (not copied) into `sources/` for archiving.
> - Markdown files generated in Step 1, original PDFs, original MDs — **all** must be moved into the project via `import-sources --move`
> - Intermediate artifacts (e.g., `_files/` directories) are handled automatically by `import-sources`
> - After execution, source files no longer exist at their original location

**✅ Checkpoint — Confirm project structure created successfully, `sources/` contains all source files, converted materials are ready. Proceed to Step 3.**

---

### Step 3: Template Option

🚧 **GATE**: Step 2 complete; project directory structure is ready.

**Default path — free design, no question asked.** Proceed directly to Step 4. Do NOT query `layouts_index.json` and do NOT ask the user an A/B template-vs-free-design question. Free design is the standard mode: the AI tailors structure and style to the specific content.

**Template flow is opt-in.** Enter it only when one of these explicit triggers appears in the user's prior messages:

1. User names a specific template (e.g., "用 mckinsey 模板" / "use the academic_defense template")
2. User names a style / brand reference that maps to a template (e.g., "McKinsey 那种" / "Google style" / "学术答辩样式")
3. User explicitly asks what templates exist (e.g., "有哪些模板可以用")

Only when a trigger fires: read `${SKILL_DIR}/templates/layouts/layouts_index.json`, resolve the match (or list available options for trigger 3), and copy template files to the project directory:

```bash
cp ${SKILL_DIR}/templates/layouts/<template_name>/*.svg <project_path>/templates/
cp ${SKILL_DIR}/templates/layouts/<template_name>/design_spec.md <project_path>/templates/
cp ${SKILL_DIR}/templates/layouts/<template_name>/*.png <project_path>/images/ 2>/dev/null || true
cp ${SKILL_DIR}/templates/layouts/<template_name>/*.jpg <project_path>/images/ 2>/dev/null || true
```

**Soft hint (non-blocking, optional).** Before Step 4, if the user's content is an obvious strong match for an existing template (e.g., clearly an academic defense, a government report, a McKinsey-style consulting deck) AND the user has given no template signal, the AI MAY emit a single-sentence notice and continue without waiting:

> Note: the library has a template `<name>` that matches this scenario closely. Say the word if you want to use it; otherwise I'll continue with free design.

This is a hint, not a question — do NOT block, do NOT require an answer. Skip the hint entirely when the match is weak or ambiguous.

> To create a new global template, read `workflows/create-template.md`

**✅ Checkpoint — Default path proceeds to Step 4 without user interaction. If a template trigger fired, template files are copied before advancing.**

---

### Step 4: Strategist Phase (MANDATORY — cannot be skipped)

🚧 **GATE**: Step 3 complete; default free-design path taken, or (if triggered) template files copied into the project.

First, read the role definition:
```
Read references/strategist.md
```

> ⚠️ **Mandatory gate in `strategist.md`**: Before writing `design_spec.md`, Strategist MUST `read_file templates/design_spec_reference.md` and produce the spec following its full I–XI section structure. See `strategist.md` Section 1 for the explicit gate rule.

**Must complete the Eight Confirmations** (full template structure in `templates/design_spec_reference.md`):

⛔ **BLOCKING (Standard mode)**: The Eight Confirmations MUST be presented to the user as a bundled set of recommendations, and you MUST **wait for the user to confirm or modify** before outputting the Design Specification & Content Outline. This is the single core confirmation point in the workflow. Once confirmed, all subsequent script execution and slide generation should proceed fully automatically.

⚡ **FAST MODE**: If the user has explicitly indicated they want to skip confirmations (e.g., "直接开始", "不用确认", "默认就行", "just start", "skip confirmations", "auto"), then:
- Adopt the AI's recommended defaults for all eight items
- Write `"mode": "fast"` in `run_state.json`
- Output the Eight Confirmations as a brief summary (not a question) and proceed immediately without waiting
- Do NOT ask for confirmation — the user's intent to skip is the confirmation

1. Canvas format
2. Page count range
3. Target audience
4. Style objective
5. Color scheme
6. Icon usage approach
7. Typography plan
8. Image usage approach

If the user has provided images, run the analysis script **before outputting the design spec** (do NOT directly read/open image files — use the script output only):
```bash
node ${SKILL_DIR}/scripts/analyze_images.cjs <project_path>/images
```

> ⚠️ **Image handling rule**: The AI must NEVER directly read, open, or view image files (`.jpg`, `.png`, etc.). All image information must come from the `analyze_images.cjs` script output or the Design Specification's Image Resource List.

**Output**:
- `<project_path>/design_spec.md` — human-readable design narrative
- `<project_path>/spec_lock.md` — machine-readable execution contract (distilled from the decisions in design_spec.md; Executor re-reads this before every page). See `templates/spec_lock_reference.md` for the skeleton.

**✅ Checkpoint — Phase deliverables complete, auto-proceed to next step**:
```markdown
## ✅ Strategist Phase Complete
- [x] Eight Confirmations completed (user confirmed)
- [x] Design Specification & Content Outline generated
- [x] Execution lock (spec_lock.md) generated
- [ ] **Next**: Auto-proceed to [Image_Generator / Executor] phase
```

---

### Step 5: Image_Generator Phase (Conditional)

🚧 **GATE**: Step 4 complete; Design Specification & Content Outline generated and user confirmed.

> **Trigger condition**: Image approach includes "AI generation". If not triggered, skip directly to Step 6 (Step 6 GATE must still be satisfied).

Read `references/image-generator.md`

1. Extract all images with status "pending generation" from the design spec
2. Generate prompt document → `<project_path>/images/image_prompts.md`
3. Query available image providers:
   ```
   image_gen({ action: "list_providers" })
   ```
4. Generate images one by one (select a provider with `has_image_models: true`):
   ```
   image_gen({ action: "generate", prompt: "描述", model_provider_id: "<id>", model_id: "<model>", size: "16:9", output_dir: "<project_path>/images", output_filename: "cover_bg" })
   ```

> If no image provider is configured, inform the user and skip to Step 6. The pipeline can proceed without images — placeholders in design spec will be preserved.

**✅ Checkpoint — Confirm all images are ready, proceed to Step 6**:
```markdown
## ✅ Image_Generator Phase Complete
- [x] Prompt document created
- [x] All images saved to images/
```

---

### Step 6: Executor Phase

🚧 **GATE**: Step 4 (and Step 5 if triggered) complete; all prerequisite deliverables are ready.

Read the role definition based on the selected style:
```
Read references/executor-base.md          # REQUIRED: common guidelines
Read references/executor-general.md       # General flexible style
Read references/executor-consultant.md    # Consulting style
Read references/executor-consultant-top.md # Top consulting style (MBB level)
```

> Only need to read executor-base + one style file.

**Design Parameter Confirmation (Mandatory)**: Before generating the first SVG, the Executor MUST review and output key design parameters from the Design Specification (canvas dimensions, color scheme, font plan, body font size) to ensure spec adherence. See executor-base.md Section 2 for details.

**Per-page spec_lock re-read (Mandatory)**: Before generating **each** SVG page, Executor MUST `read_file <project_path>/spec_lock.md` and use only the colors / fonts / icons / images listed there. This resists context-compression drift on long decks. See executor-base.md §2.1 for details.

> ⚠️ **Main-agent only rule**: SVG generation in Step 6 MUST remain with the current main agent because page design depends on full upstream context (source content, design spec, template mapping, image decisions, and cross-page consistency). Do NOT delegate any slide SVG generation to sub-agents.
> ⚠️ **Generation rhythm rule**: After confirming the global design parameters, the Executor MUST generate pages sequentially, one page at a time, while staying in the same continuous main-agent context. Do NOT split Step 6 into grouped page batches such as 5 pages per batch.

**Visual Construction Phase**:
- Generate SVG pages sequentially, one page at a time, in one continuous pass → `<project_path>/svg_output/`

**Quality Check Gate (Mandatory)** — after all SVGs are generated and BEFORE speaker notes:
```bash
node ${SKILL_DIR}/scripts/svg_quality_checker.cjs <project_path>
```
- **error** = BLOCKING: banned SVG features, viewBox mismatch, forbidden elements. MUST fix the offending page before proceeding — re-generate and re-run the check.
- **warning** = NON-BLOCKING: low-resolution image, non-PPT-safe font tail, spec_lock minor drift. Review and fix when straightforward; otherwise acknowledge in the checkpoint and proceed.
- Do NOT treat warnings as errors. Do NOT loop re-generating pages for warning-only issues.
- Running the checker against `svg_output/` is required — running it only after `finalize_svg.cjs` is too late (finalize rewrites SVG and some violations get masked).

**Logic Construction Phase**:
- Generate speaker notes → `<project_path>/notes/total.md`

**✅ Checkpoint — Confirm all SVGs and notes are fully generated and quality-checked. Proceed directly to Step 7 post-processing**:
```markdown
## ✅ Executor Phase Complete
- [x] All SVGs generated to svg_output/
- [x] svg_quality_checker.cjs passed (0 errors)
- [x] Speaker notes generated at notes/total.md
```

---

### Step 7: Post-processing & Export

🚧 **GATE**: Step 6 complete; all SVGs generated to `svg_output/`; speaker notes `notes/total.md` generated.

> ⚠️ The following three sub-steps MUST be **executed individually one at a time**. Each command must complete and be confirmed successful before running the next.
> ❌ **NEVER** put all three commands in a single code block or single shell invocation.

**Step 7.1** — Split speaker notes:
```bash
node ${SKILL_DIR}/scripts/total_md_split.cjs <project_path>
```
**Verify**: Check `exit_code == 0`. Then `file_ops({action:"glob", path:"<project_path>/notes", pattern:"*.md"})` — confirm note count matches page count.

**Step 7.2** — SVG post-processing (icon embedding / image crop & embed / text flattening / rounded rect to path):
```bash
node ${SKILL_DIR}/scripts/finalize_svg.cjs <project_path>
```
**Verify**: Check `exit_code == 0`. Then `file_ops({action:"glob", path:"<project_path>/svg_final", pattern:"*.svg"})` — confirm SVG count matches `svg_output/`.

**Step 7.3** — Export PPTX (embeds speaker notes by default):
```bash
node ${SKILL_DIR}/scripts/svg_to_pptx.cjs <project_path> -s final
```
**Verify**: Check `exit_code == 0`. Then `file_ops({action:"find_latest", path:"<project_path>/exports", extension:".pptx"})` — confirm `found: true` and `size > 0`. Use the verified absolute path from this result as the delivery path to the user.

> ❌ **NEVER** use `cp` as a substitute for `finalize_svg.cjs` — it performs multiple critical processing steps
> ❌ **NEVER** export directly from `svg_output/` — MUST use `-s final` to export from `svg_final/`
> ❌ **NEVER** add extra flags like `--only`
> ❌ **NEVER** report a file path to the user without first verifying it exists via `file_ops`

---

## Role Switching Protocol

Before switching roles, you **MUST first read** the corresponding reference file — skipping is FORBIDDEN. Output marker:

```markdown
## [Role Switch: <Role Name>]
📖 Reading role definition: references/<filename>.md
📋 Current task: <brief description>
```

---

## Reference Resources

| Resource | Path |
|----------|------|
| Shared technical constraints | `references/shared-standards.md` |
| Canvas format specification | `references/canvas-formats.md` |
| Image layout specification | `references/image-layout-spec.md` |
| SVG image embedding | `references/svg-image-embedding.md` |

---

## Notes

- Do NOT add extra flags like `--only` to the post-processing commands — run them as-is
- Local preview: `python3 -m http.server -d <project_path>/svg_final 8000`
- **Troubleshooting**: If the user encounters issues during generation (layout overflow, export errors, blank images, etc.), check `${SKILL_DIR}/scripts/docs/troubleshooting.md` for known solutions
