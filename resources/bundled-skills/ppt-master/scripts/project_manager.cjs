#!/usr/bin/env node
/**
 * PPT Master - Project Manager (Node.js)
 *
 * Usage:
 *   node scripts/project_manager.cjs init <name> [--format ppt169] [--dir projects]
 *   node scripts/project_manager.cjs import-sources <project_path> <source1> [...] [--move|--copy]
 *   node scripts/project_manager.cjs validate <project_path>
 *   node scripts/project_manager.cjs info <project_path>
 */

'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var url = require('url');

var TOOLS_DIR = __dirname;
var SKILL_DIR = path.dirname(TOOLS_DIR);

var CANVAS_FORMATS = {
  ppt169:      { name: 'PPT 16:9',       dimensions: '1280x720',  viewbox: '0 0 1280 720' },
  ppt43:       { name: 'PPT 4:3',        dimensions: '1024x768',  viewbox: '0 0 1024 768' },
  wechat:      { name: 'WeChat Header',  dimensions: '900x383',   viewbox: '0 0 900 383' },
  xiaohongshu: { name: 'XHS',            dimensions: '1242x1660', viewbox: '0 0 1242 1660' },
  moments:     { name: 'Moments',        dimensions: '1080x1080', viewbox: '0 0 1080 1080' },
  story:       { name: 'Story',          dimensions: '1080x1920', viewbox: '0 0 1080 1920' },
  banner:      { name: 'Banner',         dimensions: '1920x1080', viewbox: '0 0 1920 1080' },
  a4:          { name: 'A4 Print',       dimensions: '1240x1754', viewbox: '0 0 1240 1754' },
};

var FORMAT_ALIASES = { xhs: 'xiaohongshu', wechat_moment: 'moments', 'wechat-moment': 'moments' };
var SOURCE_DIRNAME = 'sources';
var TEXT_SUFFIXES = ['.md', '.markdown', '.txt'];
var PDF_SUFFIXES = ['.pdf'];
var PPT_SUFFIXES = ['.pptx', '.pptm', '.ppsx', '.ppsm', '.potx', '.potm'];
var DOC_SUFFIXES = ['.docx', '.doc', '.odt', '.rtf', '.epub', '.html', '.htm', '.tex', '.latex', '.rst', '.org', '.ipynb', '.typ'];

function normalizeFormat(key) {
  if (!key) return '';
  var k = key.trim().toLowerCase();
  return FORMAT_ALIASES[k] || k;
}

function sanitizeName(v) {
  var s = v.trim().replace(/[^a-zA-Z0-9_.\-]/g, '_').replace(/^[._]+|[._]+$/g, '');
  while (s.includes('__')) s = s.replace(/__/g, '_');
  return s.slice(0, 120) || 'source';
}

function isUrl(v) {
  try { var u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (_) { return false; }
}

function deriveUrlBasename(u) {
  try {
    var parsed = new URL(u);
    var parts = [sanitizeName(parsed.hostname)];
    if (parsed.pathname && parsed.pathname !== '/') parts.push(sanitizeName(parsed.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_')));
    return parts.filter(Boolean).join('_') || 'web_source';
  } catch (_) { return 'web_source'; }
}

function ensureUnique(p) {
  if (!fs.existsSync(p)) return p;
  var ext = path.extname(p), stem = path.basename(p, ext), dir = path.dirname(p), c = 2;
  while (fs.existsSync(path.join(dir, stem + '_' + c + ext))) c++;
  return path.join(dir, stem + '_' + c + ext);
}

function copyFileUnique(src, dst, move) {
  dst = ensureUnique(dst);
  if (move) fs.renameSync(src, dst); else fs.copyFileSync(src, dst);
  return dst;
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(function(item) {
    var s = path.join(src, item), d = path.join(dst, item);
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d); else fs.copyFileSync(s, d);
  });
}

function copyTreeUnique(src, dst, move) {
  dst = ensureUnique(dst);
  if (move) fs.renameSync(src, dst); else copyDirRecursive(src, dst);
  return dst;
}

function runTool(args) {
  try {
    var result = cp.execFileSync(args[0], args.slice(1), { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.trim()) console.log(result.trim());
  } catch (e) {
    var msg = (e.stderr || e.stdout || '').trim();
    throw new Error(msg || 'tool execution failed');
  }
}

// ========== Parse project name ==========

function parseProjectName(dirName) {
  var result = { name: dirName, format: 'unknown', formatName: 'Unknown format', date: 'unknown', dateFormatted: 'Unknown date' };
  var dm = dirName.match(/_(\d{8})$/);
  if (dm) {
    result.date = dm[1];
    var y = dm[1].slice(0,4), mo = dm[1].slice(4,6), d = dm[1].slice(6,8);
    result.dateFormatted = y + '-' + mo + '-' + d;
  }
  var lower = dirName.toLowerCase();
  var fm = lower.match(/^(.+)_([a-z0-9_-]+)_(\d{8})$/);
  if (fm) {
    var nf = normalizeFormat(fm[2]);
    if (CANVAS_FORMATS[nf]) {
      result.format = nf; result.formatName = CANVAS_FORMATS[nf].name;
      result.name = dirName.slice(0, fm[1].length);
      return result;
    }
  }
  var fmtKeys = Object.keys(CANVAS_FORMATS).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < fmtKeys.length; i++) {
    if (new RegExp('_' + fmtKeys[i] + '(?:_\\d{8})?$').test(lower)) {
      result.format = fmtKeys[i]; result.formatName = CANVAS_FORMATS[fmtKeys[i]].name; break;
    }
  }
  var name = dirName.replace(/_\d{8}$/, '');
  if (result.format !== 'unknown') name = name.replace(new RegExp('_' + result.format + '$', 'i'), '');
  result.name = name;
  return result;
}

// ========== Project Info ==========

function getProjectInfo(projectPath) {
  var parsed = parseProjectName(path.basename(projectPath));
  var info = {
    path: projectPath, name: parsed.name, format: parsed.format, formatName: parsed.formatName,
    date: parsed.date, dateFormatted: parsed.dateFormatted,
    exists: fs.existsSync(projectPath), svgCount: 0, hasSpec: false, hasSource: false, sourceCount: 0, svgFiles: [],
  };
  if (!info.exists) return info;
  var specFiles = ['design_spec.md', 'design_specification.md'];
  for (var i = 0; i < specFiles.length; i++) { if (fs.existsSync(path.join(projectPath, specFiles[i]))) { info.hasSpec = true; break; } }
  var srcDir = path.join(projectPath, 'sources');
  info.hasSource = fs.existsSync(srcDir);
  if (info.hasSource) { try { info.sourceCount = fs.readdirSync(srcDir).filter(function(f) { return fs.statSync(path.join(srcDir, f)).isFile(); }).length; } catch(_) {} }
  var svgOut = path.join(projectPath, 'svg_output');
  if (fs.existsSync(svgOut)) {
    info.svgFiles = fs.readdirSync(svgOut).filter(function(f) { return f.endsWith('.svg'); }).sort();
    info.svgCount = info.svgFiles.length;
  }
  return info;
}

// ========== Validate ==========

function validateProject(projectPath) {
  var errors = [], warnings = [];
  if (!fs.existsSync(projectPath)) { errors.push('Project directory does not exist: ' + projectPath); return { valid: false, errors: errors, warnings: warnings }; }
  if (!fs.statSync(projectPath).isDirectory()) { errors.push('Not a valid directory: ' + projectPath); return { valid: false, errors: errors, warnings: warnings }; }
  if (!fs.existsSync(path.join(projectPath, 'README.md'))) errors.push('Missing required file: README.md');
  var specFiles = ['design_spec.md', 'design_specification.md'];
  if (!specFiles.some(function(f) { return fs.existsSync(path.join(projectPath, f)); })) warnings.push('Missing design specification file (suggested: design_spec.md)');
  var svgOut = path.join(projectPath, 'svg_output');
  if (!fs.existsSync(svgOut)) errors.push('Missing svg_output directory');
  else {
    var svgs = fs.readdirSync(svgOut).filter(function(f) { return f.endsWith('.svg'); });
    if (!svgs.length) warnings.push('svg_output directory is empty');
  }
  if (!/_\d{8}$/.test(path.basename(projectPath))) warnings.push('Directory name missing date suffix (_YYYYMMDD)');
  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

// ========== Init ==========

function initProject(projectName, canvasFormat, baseDir) {
  var nf = normalizeFormat(canvasFormat);
  if (!CANVAS_FORMATS[nf]) throw new Error('Unsupported canvas format: ' + canvasFormat + ' (available: ' + Object.keys(CANVAS_FORMATS).join(', ') + ')');
  var dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
  var dirName = projectName + '_' + nf + '_' + dateStr;
  var projectPath = path.join(baseDir, dirName);
  if (fs.existsSync(projectPath)) throw new Error('Project directory already exists: ' + projectPath);
  ['svg_output','svg_final','images','notes','templates',SOURCE_DIRNAME,'exports'].forEach(function(d) { fs.mkdirSync(path.join(projectPath, d), { recursive: true }); });
  var info = CANVAS_FORMATS[nf];
  fs.writeFileSync(path.join(projectPath, 'README.md'),
    '# ' + projectName + '\n\n- Canvas format: ' + nf + '\n- Created: ' + dateStr + '\n\n## Directories\n\n' +
    '- `svg_output/`: raw SVG output\n- `svg_final/`: finalized SVG output\n- `images/`: presentation assets\n' +
    '- `notes/`: speaker notes\n- `templates/`: project templates\n- `sources/`: source materials\n- `exports/`: generated PPTX files\n',
    'utf-8');
  console.log('Project created: ' + projectPath);
  console.log('Canvas: ' + info.name + ' (' + info.dimensions + ')');
  return projectPath;
}

// ========== Import Sources ==========

function importSources(projectPath, sourceItems, move, copy) {
  if (!fs.existsSync(projectPath)) throw new Error('Project directory not found: ' + projectPath);
  if (!sourceItems.length) throw new Error('At least one source path or URL is required');
  var sourcesDir = path.join(projectPath, SOURCE_DIRNAME);
  fs.mkdirSync(sourcesDir, { recursive: true });
  var summary = { archived: [], markdown: [], assets: [], notes: [], skipped: [] };

  var explicitMdStems = {};
  sourceItems.forEach(function(item) {
    if (!isUrl(item) && fs.existsSync(item) && ['.md','.markdown'].includes(path.extname(item).toLowerCase())) {
      explicitMdStems[path.basename(item, path.extname(item))] = true;
    }
  });

  sourceItems.forEach(function(item) {
    if (isUrl(item)) {
      // Archive URL record
      var urlFile = ensureUnique(path.join(sourcesDir, deriveUrlBasename(item) + '.url.txt'));
      fs.writeFileSync(urlFile, 'URL: ' + item + '\nImported: ' + new Date().toISOString() + '\n', 'utf-8');
      var mdPath = ensureUnique(path.join(sourcesDir, deriveUrlBasename(item) + '.md'));
      try {
        // Prefer Node.js web_to_md.cjs
        var webCjs = path.join(TOOLS_DIR, 'source_to_md', 'web_to_md.cjs');
        var webPy = path.join(TOOLS_DIR, 'source_to_md', 'web_to_md.py');
        if (fs.existsSync(webCjs)) runTool(['node', webCjs, item, '-o', mdPath]);
        else runTool([process.platform === 'win32' ? 'python' : 'python3', webPy, item, '-o', mdPath]);
        summary.archived.push(urlFile);
        summary.markdown.push(mdPath);
      } catch (e) { summary.skipped.push(item + ': ' + e.message); }
      return;
    }

    if (!fs.existsSync(item)) { summary.skipped.push(item + ': path not found'); return; }
    if (fs.statSync(item).isDirectory()) { summary.skipped.push(item + ': directories not supported'); return; }

    var effectiveMove = copy ? false : (move ? true : false);
    var suffix = path.extname(item).toLowerCase();
    var stem = path.basename(item, path.extname(item));

    // Archive the file
    if (TEXT_SUFFIXES.includes(suffix) && ['.md','.markdown'].includes(suffix)) {
      var archived = copyFileUnique(item, path.join(sourcesDir, path.basename(item)), effectiveMove);
      summary.archived.push(archived);
      summary.markdown.push(archived);
      // Handle companion asset dir
      var assetDir = path.join(path.dirname(item), stem + '_files');
      if (fs.existsSync(assetDir) && fs.statSync(assetDir).isDirectory()) {
        var importedAssets = copyTreeUnique(assetDir, path.join(sourcesDir, path.basename(archived, path.extname(archived)) + '_files'), effectiveMove);
        summary.assets.push(importedAssets);
      }
      return;
    }

    var archivedPath = copyFileUnique(item, path.join(sourcesDir, path.basename(item)), effectiveMove);
    summary.archived.push(archivedPath);
    var archivedStem = path.basename(archivedPath, path.extname(archivedPath));
    var canonicalMd = path.join(sourcesDir, archivedStem + '.md');

    if (PDF_SUFFIXES.includes(suffix)) {
      if (explicitMdStems[stem]) { summary.notes.push(item + ': skipped PDF auto-conversion (same-stem MD provided)'); return; }
      if (fs.existsSync(canonicalMd)) { summary.markdown.push(canonicalMd); summary.notes.push(item + ': skipped (MD already exists)'); return; }
      try {
        runTool([process.platform === 'win32' ? 'python' : 'python3', path.join(TOOLS_DIR, 'source_to_md', 'pdf_to_md.py'), archivedPath, '-o', canonicalMd]);
        summary.markdown.push(canonicalMd);
      } catch (e) { summary.skipped.push(item + ': PDF conversion failed (' + e.message + ')'); }
    } else if (PPT_SUFFIXES.includes(suffix)) {
      if (explicitMdStems[stem]) { summary.notes.push(item + ': skipped PPT auto-conversion'); return; }
      if (fs.existsSync(canonicalMd)) { summary.markdown.push(canonicalMd); return; }
      try {
        runTool([process.platform === 'win32' ? 'python' : 'python3', path.join(TOOLS_DIR, 'source_to_md', 'ppt_to_md.py'), archivedPath, '-o', canonicalMd]);
        summary.markdown.push(canonicalMd);
      } catch (e) { summary.skipped.push(item + ': PPT conversion failed (' + e.message + ')'); }
    } else if (DOC_SUFFIXES.includes(suffix)) {
      if (explicitMdStems[stem]) { summary.notes.push(item + ': skipped doc auto-conversion'); return; }
      if (fs.existsSync(canonicalMd)) { summary.markdown.push(canonicalMd); return; }
      try {
        runTool([process.platform === 'win32' ? 'python' : 'python3', path.join(TOOLS_DIR, 'source_to_md', 'doc_to_md.py'), archivedPath, '-o', canonicalMd]);
        summary.markdown.push(canonicalMd);
      } catch (e) { summary.skipped.push(item + ': doc conversion failed (' + e.message + ')'); }
    } else if (suffix === '.txt') {
      var mdOut = ensureUnique(path.join(sourcesDir, archivedStem + '.md'));
      fs.writeFileSync(mdOut, fs.readFileSync(archivedPath, 'utf-8'), 'utf-8');
      summary.markdown.push(mdOut);
    } else {
      summary.notes.push(item + ': archived only, no automatic conversion');
    }
  });

  return summary;
}

// ========== CLI ==========

function main() {
  var args = process.argv.slice(2);
  if (!args.length) { console.log('Usage: node project_manager.cjs <command> [args]'); console.log('Commands: init, import-sources, validate, info'); process.exit(1); }
  var cmd = args[0];

  try {
    if (cmd === 'init') {
      var pname = args[1]; if (!pname) throw new Error('Project name is required');
      var fmt = 'ppt169', dir = 'projects';
      for (var i = 2; i < args.length; i++) {
        if (args[i] === '--format' && args[i+1]) { fmt = args[++i]; }
        else if (args[i] === '--dir' && args[i+1]) { dir = args[++i]; }
      }
      var pp = initProject(pname, fmt, dir);
      console.log('[OK] Project initialized: ' + pp);
    } else if (cmd === 'import-sources') {
      var projPath = args[1]; if (!projPath) throw new Error('Project path required');
      var mv = false, cp2 = false, sources = [];
      for (var j = 2; j < args.length; j++) {
        if (args[j] === '--move') mv = true;
        else if (args[j] === '--copy') cp2 = true;
        else sources.push(args[j]);
      }
      var sum = importSources(projPath, sources, mv, cp2);
      console.log('[OK] Imported sources into: ' + projPath);
      if (sum.archived.length) { console.log('\nArchived:'); sum.archived.forEach(function(s) { console.log('  - ' + s); }); }
      if (sum.markdown.length) { console.log('\nMarkdown:'); sum.markdown.forEach(function(s) { console.log('  - ' + s); }); }
      if (sum.notes.length) { console.log('\nNotes:'); sum.notes.forEach(function(s) { console.log('  - ' + s); }); }
      if (sum.skipped.length) { console.log('\nSkipped:'); sum.skipped.forEach(function(s) { console.log('  - ' + s); }); }
    } else if (cmd === 'validate') {
      var vp = args[1]; if (!vp) throw new Error('Project path required');
      var r = validateProject(vp);
      console.log('\nProject validation: ' + vp);
      console.log('='.repeat(60));
      if (r.errors.length) { console.log('\n[ERROR]'); r.errors.forEach(function(e) { console.log('  - ' + e); }); }
      if (r.warnings.length) { console.log('\n[WARN]'); r.warnings.forEach(function(w) { console.log('  - ' + w); }); }
      if (r.valid && !r.warnings.length) console.log('\n[OK] Project structure is complete.');
      else if (r.valid) console.log('\n[OK] Project structure is valid, with warnings.');
      else { console.log('\n[ERROR] Project structure is invalid.'); process.exit(1); }
    } else if (cmd === 'info') {
      var ip = args[1]; if (!ip) throw new Error('Project path required');
      var inf = getProjectInfo(ip);
      console.log('\nProject info: ' + inf.name);
      console.log('='.repeat(60));
      console.log('Path: ' + inf.path);
      console.log('Exists: ' + (inf.exists ? 'Yes' : 'No'));
      console.log('SVG files: ' + inf.svgCount);
      console.log('Design spec: ' + (inf.hasSpec ? 'Yes' : 'No'));
      console.log('Source materials: ' + (inf.hasSource ? 'Yes' : 'No'));
      console.log('Source count: ' + inf.sourceCount);
      console.log('Canvas format: ' + inf.formatName);
      console.log('Created: ' + inf.dateFormatted);
    } else { throw new Error('Unknown command: ' + cmd); }
  } catch (e) {
    console.log('[ERROR] ' + e.message);
    process.exit(1);
  }
}

main();
