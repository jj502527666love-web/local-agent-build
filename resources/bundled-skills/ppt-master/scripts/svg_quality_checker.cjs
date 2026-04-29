#!/usr/bin/env node
/**
 * PPT Master - SVG Quality Check Tool (Node.js)
 *
 * Checks whether SVG files comply with project technical specifications.
 * Drop-in replacement for svg_quality_checker.py — zero external dependencies.
 *
 * Usage:
 *   node scripts/svg_quality_checker.cjs <svg_file>
 *   node scripts/svg_quality_checker.cjs <directory>
 *   node scripts/svg_quality_checker.cjs <directory> --format ppt169
 */

'use strict';

var fs = require('fs');
var path = require('path');

var CANVAS_FORMATS = {
  ppt169:      { name: 'PPT 16:9',  viewbox: '0 0 1280 720' },
  ppt43:       { name: 'PPT 4:3',   viewbox: '0 0 1024 768' },
  wechat:      { name: 'WeChat',    viewbox: '0 0 900 383' },
  xiaohongshu: { name: 'XHS',       viewbox: '0 0 1242 1660' },
  moments:     { name: 'Moments',   viewbox: '0 0 1080 1080' },
  story:       { name: 'Story',     viewbox: '0 0 1080 1920' },
  banner:      { name: 'Banner',    viewbox: '0 0 1920 1080' },
  a4:          { name: 'A4 Print',  viewbox: '0 0 1240 1754' },
};

var PPT_SAFE_FONTS = [
  'microsoft yahei','simhei','simsun','kaiti','fangsong',
  'pingfang sc','heiti sc','songti sc','stsong',
  'arial','arial black','calibri','segoe ui','verdana',
  'helvetica','helvetica neue','tahoma','trebuchet ms',
  'times new roman','times','georgia','cambria','palatino',
  'consolas','courier new','menlo','monaco','impact',
];

var RAMP_MIN_RATIO = 0.5, RAMP_MAX_RATIO = 5.0;

function normalizeSize(v) {
  var s = v.trim().toLowerCase();
  if (s.endsWith('px')) s = s.slice(0, -2).trim();
  return s;
}

// ========== Checker ==========

function createChecker() {
  return {
    results: [],
    summary: { total: 0, passed: 0, warnings: 0, errors: 0 },
    issueTypes: {},
  };
}

function checkFile(checker, svgFile, expectedFormat) {
  var svgPath = path.resolve(svgFile);
  if (!fs.existsSync(svgPath)) {
    var r = { file: path.basename(svgFile), path: svgPath, errors: ['File does not exist'], warnings: [], info: {}, passed: false };
    checker.results.push(r);
    checker.summary.total++; checker.summary.errors++;
    return r;
  }
  var result = { file: path.basename(svgPath), path: svgPath, errors: [], warnings: [], info: {}, passed: true };
  try {
    var content = fs.readFileSync(svgPath, 'utf-8');
    checkViewbox(content, result, expectedFormat);
    checkForbidden(content, result);
    checkFonts(content, result);
    checkDimensions(content, result);
    checkTextElements(content, result);
    checkImageRefs(content, svgPath, result);
    result.passed = result.errors.length === 0;
  } catch (e) {
    result.errors.push('Failed to read file: ' + e.message);
    result.passed = false;
  }
  checker.summary.total++;
  if (result.passed) { if (result.warnings.length) checker.summary.warnings++; else checker.summary.passed++; }
  else checker.summary.errors++;
  result.errors.forEach(function(e) {
    var cat = /viewBox/i.test(e) ? 'viewBox issues' : /font/i.test(e) ? 'Font issues' : /foreignObject/i.test(e) ? 'foreignObject' : 'Other';
    checker.issueTypes[cat] = (checker.issueTypes[cat] || 0) + 1;
  });
  checker.results.push(result);
  return result;
}

function checkViewbox(content, result, expectedFormat) {
  var m = content.match(/viewBox="([^"]+)"/);
  if (!m) { result.errors.push('Missing viewBox attribute'); return; }
  result.info.viewbox = m[1];
  if (!/^0 0 \d+ \d+$/.test(m[1])) result.warnings.push('Unusual viewBox format: ' + m[1]);
  if (expectedFormat && CANVAS_FORMATS[expectedFormat]) {
    var ev = CANVAS_FORMATS[expectedFormat].viewbox;
    if (m[1] !== ev) result.errors.push("viewBox mismatch: expected '" + ev + "', got '" + m[1] + "'");
  }
}

function checkForbidden(content, result) {
  var cl = content.toLowerCase();
  // clipPath on non-image
  if (cl.includes('<clippath')) {
    if (/< (?!image\b)\w+[^>]*\bclip-path\s*=/i.test(content))
      result.errors.push('clip-path is only allowed on <image> elements');
  }
  if (cl.includes('<mask')) result.errors.push('Detected forbidden <mask> element (PPT does not support SVG masks)');
  if (cl.includes('<style')) result.errors.push('Detected forbidden <style> element (use inline attributes instead)');
  if (/\bclass\s*=/.test(content)) result.errors.push('Detected forbidden class attribute (use inline styles instead)');
  if (cl.includes('<style') && /\bid\s*=/.test(content)) result.errors.push('Detected id attribute used with <style>');
  if (/<\?xml-stylesheet\b/.test(cl)) result.errors.push('Detected forbidden xml-stylesheet');
  if (/<link[^>]*rel\s*=\s*["']stylesheet["']/.test(cl)) result.errors.push('Detected forbidden <link rel="stylesheet">');
  if (/@import\s+/.test(cl)) result.errors.push('Detected forbidden @import');
  if (cl.includes('<foreignobject')) result.errors.push('Detected forbidden <foreignObject> element (use <tspan> for manual line breaks)');
  if (cl.includes('<symbol') && /<use\b/.test(cl)) result.errors.push('Detected forbidden <symbol> + <use> complex usage');
  if (/\bmarker-(?:start|end)\s*=\s*["']url\(#/.test(cl) && !cl.includes('<marker')) result.errors.push('Detected marker reference without <marker> definition');
  if (cl.includes('<textpath')) result.errors.push('Detected forbidden <textPath> element');
  if (cl.includes('@font-face')) result.errors.push('Detected forbidden @font-face');
  if (/<animate/.test(cl)) result.errors.push('Detected forbidden SMIL animation element');
  if (/<set\b/.test(cl)) result.errors.push('Detected forbidden SMIL <set> element');
  if (cl.includes('<script')) result.errors.push('Detected forbidden <script> element');
  if (/\bon\w+\s*=/.test(content)) result.errors.push('Detected forbidden event attributes (e.g., onclick)');
  if (cl.includes('<iframe')) result.errors.push('Detected <iframe> element');
  if (/rgba\s*\(/.test(cl)) result.errors.push('Detected forbidden rgba() color (use fill-opacity/stroke-opacity instead)');
  if (/<g[^>]*\sopacity\s*=/.test(cl)) result.errors.push('Detected forbidden <g opacity>');
  if (/<image[^>]*\sopacity\s*=/.test(cl)) result.errors.push('Detected forbidden <image opacity>');
}

function checkFonts(content, result) {
  var matches = content.match(/font-family[:\s]*["']([^"']+)["']/gi);
  if (!matches) return;
  var fonts = [];
  matches.forEach(function(m) { var v = m.match(/["']([^"']+)["']/); if (v) fonts.push(v[1]); });
  result.info.fonts = Array.from(new Set(fonts));
  var warned = false;
  fonts.forEach(function(ff) {
    if (warned) return;
    var parts = ff.split(',').map(function(p) { return p.trim().replace(/^["']|["']$/g, '').toLowerCase(); });
    parts = parts.filter(function(p) { return p && !['sans-serif','serif','monospace','cursive','fantasy','system-ui'].includes(p); });
    if (!parts.length) return;
    var tail = parts[parts.length - 1];
    if (!PPT_SAFE_FONTS.includes(tail)) {
      result.warnings.push('Font stack does not end on a PPT-safe family: ' + ff);
      warned = true;
    }
  });
}

function checkDimensions(content, result) {
  var wm = content.match(/\bwidth="(\d+)"/), hm = content.match(/\bheight="(\d+)"/);
  if (wm && hm) {
    result.info.dimensions = wm[1] + 'x' + hm[1];
    if (result.info.viewbox) {
      var vp = result.info.viewbox.split(/\s+/);
      if (vp.length === 4 && (wm[1] !== vp[2] || hm[1] !== vp[3]))
        result.warnings.push('width/height (' + wm[1] + 'x' + hm[1] + ') does not match viewBox (' + vp[2] + 'x' + vp[3] + ')');
    }
  }
}

function checkTextElements(content, result) {
  result.info.text_elements = (content.match(/<text/g) || []).length;
  result.info.tspan_elements = (content.match(/<tspan/g) || []).length;
  var longTexts = content.match(/<text[^>]*>([^<]{100,})<\/text>/g);
  if (longTexts) result.warnings.push('Detected ' + longTexts.length + ' potentially overly long single-line text(s)');
}

function checkImageRefs(content, svgPath, result) {
  var svgDir = path.dirname(svgPath);
  var re = /<image\b([^>]*)?\/?>/gi, m;
  var checked = {};
  while ((m = re.exec(content)) !== null) {
    var attrs = m[1] || '';
    var href = (attrs.match(/\bhref="(?!data:)([^"]+)"/) || attrs.match(/\bxlink:href="(?!data:)([^"]+)"/) || [])[1];
    if (!href || checked[href]) continue;
    checked[href] = true;
    var imgPath = path.resolve(svgDir, href);
    if (!fs.existsSync(imgPath)) result.errors.push('Image file not found: ' + href);
  }
}

// ========== Output ==========

function printResult(result) {
  var icon, status;
  if (result.passed) { icon = result.warnings.length ? '[WARN]' : '[OK]'; status = result.warnings.length ? 'Passed (with warnings)' : 'Passed'; }
  else { icon = '[ERROR]'; status = 'Failed'; }
  console.log(icon + ' ' + result.file + ' - ' + status);
  if (result.info.viewbox) console.log('   viewBox: ' + result.info.viewbox);
  result.errors.forEach(function(e) { console.log('   [ERROR] ' + e); });
  result.warnings.slice(0, 2).forEach(function(w) { console.log('   [WARN] ' + w); });
  if (result.warnings.length > 2) console.log('   ... and ' + (result.warnings.length - 2) + ' more warning(s)');
  console.log();
}

function printSummary(checker) {
  var s = checker.summary;
  var pct = function(n) { return s.total ? Math.round(n / s.total * 100) : 0; };
  console.log('='.repeat(80));
  console.log('[SUMMARY] Check Summary');
  console.log('='.repeat(80));
  console.log('\nTotal files: ' + s.total);
  console.log('  [OK] Fully passed: ' + s.passed + ' (' + pct(s.passed) + '%)');
  console.log('  [WARN] With warnings: ' + s.warnings + ' (' + pct(s.warnings) + '%)');
  console.log('  [ERROR] With errors: ' + s.errors + ' (' + pct(s.errors) + '%)');
  var types = Object.entries(checker.issueTypes).sort(function(a, b) { return b[1] - a[1]; });
  if (types.length) {
    console.log('\nIssue categories:');
    types.forEach(function(t) { console.log('  ' + t[0] + ': ' + t[1]); });
  }
  if (s.errors > 0 || s.warnings > 0) {
    console.log('\n[TIP] Common fixes:');
    console.log('  1. viewBox issues: Ensure consistency with canvas format');
    console.log('  2. foreignObject: Use <text> + <tspan> for manual line breaks');
    console.log('  3. Font issues: end every font-family stack with a PPT-safe family');
  }
}

function checkDirectory(checker, directory, expectedFormat) {
  var dirPath = path.resolve(directory);
  if (!fs.existsSync(dirPath)) { console.log('[ERROR] Directory does not exist: ' + directory); return; }
  var svgFiles;
  if (fs.statSync(dirPath).isFile()) {
    svgFiles = [dirPath];
  } else {
    var svgOut = path.join(dirPath, 'svg_output');
    var searchDir = fs.existsSync(svgOut) ? svgOut : dirPath;
    svgFiles = fs.readdirSync(searchDir).filter(function(f) { return f.endsWith('.svg'); }).sort().map(function(f) { return path.join(searchDir, f); });
  }
  if (!svgFiles.length) { console.log('[WARN] No SVG files found'); return; }
  console.log('\n[SCAN] Checking ' + svgFiles.length + ' SVG file(s)...\n');
  svgFiles.forEach(function(f) { printResult(checkFile(checker, f, expectedFormat)); });
}

// ========== CLI ==========

function main() {
  var args = process.argv.slice(2);
  if (!args.length) {
    console.log('Usage: node svg_quality_checker.cjs <svg_file|directory> [--format ppt169]');
    process.exit(0);
  }
  var target = args[0], expectedFormat = null;
  var fi = args.indexOf('--format');
  if (fi >= 0 && args[fi + 1]) expectedFormat = args[fi + 1];

  var checker = createChecker();
  checkDirectory(checker, target, expectedFormat);
  printSummary(checker);
  process.exit(checker.summary.errors > 0 ? 1 : 0);
}

main();
