#!/usr/bin/env node
/**
 * PPT Master - SVG Post-processing Tool (Node.js)
 *
 * Processes SVG files from svg_output/ and outputs them to svg_final/.
 * Drop-in replacement for finalize_svg.py with zero external dependencies.
 *
 * Usage:
 *   node scripts/finalize_svg.cjs <project_directory>
 *   node scripts/finalize_svg.cjs <project_directory> --only embed-icons fix-rounded
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ========== Helpers ==========

function safePrint(text) {
  try { console.log(text); } catch (_) { console.log(text.replace(/[^\x20-\x7E\n]/g, '?')); }
}

function globSvg(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort().map(f => path.join(dir, f));
}

function fileSizeStr(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getMimeType(filename, buf) {
  if (buf) {
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  }
  var ext = filename.split('.').pop().toLowerCase();
  var map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  return map[ext] || 'application/octet-stream';
}

function getImageDimensions(filePath) {
  try {
    var buf = fs.readFileSync(filePath);
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      var pos = 2;
      while (pos < buf.length - 1) {
        if (buf[pos] !== 0xff) break;
        var marker = buf[pos + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          return { w: buf.readUInt16BE(pos + 7), h: buf.readUInt16BE(pos + 5) };
        }
        if (marker === 0xd9) break;
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
        pos += 2 + buf.readUInt16BE(pos + 2);
      }
    }
  } catch (_) {}
  return null;
}

function getImageDimsFromDataUri(dataUri) {
  var m = dataUri.match(/^data:image\/\w+;base64,(.+)/);
  if (!m) return null;
  var buf = Buffer.from(m[1], 'base64');
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    var pos = 2;
    while (pos < buf.length - 1) {
      if (buf[pos] !== 0xff) break;
      var mk = buf[pos + 1];
      if (mk === 0xc0 || mk === 0xc2) return { w: buf.readUInt16BE(pos + 7), h: buf.readUInt16BE(pos + 5) };
      if (mk === 0xd9) break;
      if (mk === 0xd8 || (mk >= 0xd0 && mk <= 0xd7)) { pos += 2; continue; }
      pos += 2 + buf.readUInt16BE(pos + 2);
    }
  }
  return null;
}

function htmlUnescape(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseFirstNum(val) {
  if (!val) return null;
  var m = val.match(/^[\s,]*([+-]?(?:\d+\.?\d*|\d*\.\d+))/);
  return m ? parseFloat(m[1]) : null;
}

function fmtNum(n) {
  if (n == null) return '0';
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function copyDir(src, dst) {
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  for (var item of fs.readdirSync(src)) {
    var s = path.join(src, item), d = path.join(dst, item);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ========== Step 1: Embed Icons ==========

var ICON_BASE_SIZES = { chunk: 16, 'tabler-filled': 24, 'tabler-outline': 24 };

function resolveIconPath(iconName, iconsDir) {
  var iconPath, baseSize;
  if (iconName.includes('/')) {
    var parts = iconName.split('/');
    iconPath = path.join(iconsDir, parts[0], parts[1] + '.svg');
    baseSize = ICON_BASE_SIZES[parts[0]] || 24;
  } else {
    iconPath = path.join(iconsDir, 'chunk', iconName + '.svg');
    baseSize = 16;
    if (!fs.existsSync(iconPath)) iconPath = path.join(iconsDir, iconName + '.svg');
  }
  return { iconPath: iconPath, baseSize: baseSize };
}

function extractShapeElements(content) {
  var re = /<(path|circle|rect|line|polyline|polygon|ellipse)(\s[^>]*)?(?:\/?>|><\/\1>)/gs;
  var elems = [], m;
  while ((m = re.exec(content)) !== null) {
    var attrs = (m[2] || '').replace(/\s*fill="(?:currentColor|#[0-9a-fA-F]{3,6}|none)"/g, '');
    attrs = attrs.replace(/\s*stroke="(?:currentColor|#[0-9a-fA-F]{3,6}|none)"/g, '');
    elems.push('<' + m[1] + attrs + '/>');
  }
  return elems;
}

function embedIconsInFile(svgPath, iconsDir) {
  var content = fs.readFileSync(svgPath, 'utf-8');
  var useRe = /<use\s+[^>]*data-icon="[^"]*"[^>]*\/>/g;
  var matches = Array.from(content.matchAll(useRe));
  if (!matches.length) return 0;
  var count = 0;
  for (var i = matches.length - 1; i >= 0; i--) {
    var match = matches[i];
    var useStr = match[0];
    var iconM = useStr.match(/data-icon="([^"]+)"/);
    if (!iconM) continue;
    var info = resolveIconPath(iconM[1], iconsDir);
    if (!fs.existsSync(info.iconPath)) continue;
    var iconContent = fs.readFileSync(info.iconPath, 'utf-8');
    var style = (iconContent.includes('stroke="currentColor"') && iconContent.includes('fill="none"')) ? 'stroke' : 'fill';
    var vbM = iconContent.match(/viewBox=["']0 0 ([\d.]+)/);
    var baseSize = vbM ? parseFloat(vbM[1]) : info.baseSize;
    var elems = extractShapeElements(iconContent);
    if (!elems.length) continue;
    var x = parseFloat((useStr.match(/\bx="([^"]+)"/) || [])[1] || '0');
    var y = parseFloat((useStr.match(/\by="([^"]+)"/) || [])[1] || '0');
    var w = parseFloat((useStr.match(/\bwidth="([^"]+)"/) || [])[1] || String(baseSize));
    var h = parseFloat((useStr.match(/\bheight="([^"]+)"/) || [])[1] || String(baseSize));
    var fill = (useStr.match(/\bfill="([^"]+)"/) || [])[1] || '#000000';
    var sx = w / baseSize, sy = h / baseSize;
    var tf;
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) tf = 'translate(' + x + ', ' + y + ')';
    else if (Math.abs(sx - sy) < 1e-6) tf = 'translate(' + x + ', ' + y + ') scale(' + sx + ')';
    else tf = 'translate(' + x + ', ' + y + ') scale(' + sx + ', ' + sy + ')';
    var colorAttr = style === 'stroke' ? 'fill="none" stroke="' + fill + '"' : 'fill="' + fill + '"';
    var repl = '<!-- icon: ' + iconM[1] + ' -->\n  <g transform="' + tf + '" ' + colorAttr + '>\n    ' + elems.join('\n    ') + '\n  </g>';
    content = content.slice(0, match.index) + repl + content.slice(match.index + useStr.length);
    count++;
  }
  if (count > 0) fs.writeFileSync(svgPath, content, 'utf-8');
  return count;
}

// ========== Step 2: Crop Images (skip without sharp) ==========

function cropImagesInSvg() { return { count: 0, errors: 0 }; }

// ========== Step 3: Fix Image Aspect ==========

function calcFitted(imgW, imgH, boxW, boxH, mode) {
  var imgR = imgW / imgH, boxR = boxW / boxH, nw, nh;
  if (mode === 'slice') {
    if (imgR > boxR) { nh = boxH; nw = boxH * imgR; } else { nw = boxW; nh = boxW / imgR; }
  } else {
    if (imgR > boxR) { nw = boxW; nh = boxW / imgR; } else { nh = boxH; nw = boxH * imgR; }
  }
  return { nw: nw, nh: nh, ox: (boxW - nw) / 2, oy: (boxH - nh) / 2 };
}

function fixImageAspectInSvg(svgPath) {
  var content = fs.readFileSync(svgPath, 'utf-8');
  var svgDir = path.dirname(path.resolve(svgPath));
  var modified = false, count = 0;
  content = content.replace(/<image\s([^>]*?)\/?>(?:<\/image>)?/gs, function(full, attrsStr) {
    var href = (attrsStr.match(/xlink:href="([^"]*)"/) || attrsStr.match(/\bhref="([^"]*)"/) || [])[1];
    if (!href) return full;
    var xv = parseFloat((attrsStr.match(/\bx="([^"]*)"/) || [])[1] || '0');
    var yv = parseFloat((attrsStr.match(/\by="([^"]*)"/) || [])[1] || '0');
    var wv = parseFloat((attrsStr.match(/\bwidth="([^"]*)"/) || [])[1] || '0');
    var hv = parseFloat((attrsStr.match(/\bheight="([^"]*)"/) || [])[1] || '0');
    if (wv <= 0 || hv <= 0) return full;
    var par = (attrsStr.match(/preserveAspectRatio="([^"]*)"/) || [])[1] || 'xMidYMid meet';
    var pp = par.split(/\s+/);
    if (pp[0] === 'none') return full;
    var dims;
    if (href.startsWith('data:')) dims = getImageDimsFromDataUri(href);
    else {
      var fp = path.isAbsolute(href) ? href : path.join(svgDir, href);
      if (!fs.existsSync(fp)) return full;
      dims = getImageDimensions(fp);
    }
    if (!dims) return full;
    var mode = (pp[1] === 'slice') ? 'slice' : 'meet';
    var f = calcFitted(dims.w, dims.h, wv, hv, mode);
    if (Math.abs(f.nw - wv) < 0.5 && Math.abs(f.nh - hv) < 0.5) return full;
    var r = full;
    r = r.replace(/\bx="[^"]*"/, 'x="' + (xv + f.ox).toFixed(1) + '"');
    r = r.replace(/\by="[^"]*"/, 'y="' + (yv + f.oy).toFixed(1) + '"');
    r = r.replace(/\bwidth="[^"]*"/, 'width="' + f.nw.toFixed(1) + '"');
    r = r.replace(/\bheight="[^"]*"/, 'height="' + f.nh.toFixed(1) + '"');
    r = r.replace(/\s*preserveAspectRatio="[^"]*"/, '');
    modified = true; count++;
    return r;
  });
  if (modified) fs.writeFileSync(svgPath, content, 'utf-8');
  return count;
}

// ========== Step 4: Embed Images ==========

function embedImagesInSvg(svgPath) {
  var svgDir = path.dirname(path.resolve(svgPath));
  var content = fs.readFileSync(svgPath, 'utf-8');
  var count = 0;
  content = content.replace(/href="(?!data:)([^"]+\.(png|jpg|jpeg|gif|webp))"/g, function(full, imgPath) {
    var decoded = htmlUnescape(imgPath);
    var fp = path.isAbsolute(decoded) ? decoded : path.join(svgDir, decoded);
    if (!fs.existsSync(fp)) return full;
    var imgBytes = fs.readFileSync(fp);
    var mime = getMimeType(imgPath, imgBytes);
    count++;
    return 'href="data:' + mime + ';base64,' + imgBytes.toString('base64') + '"';
  });
  if (count > 0) fs.writeFileSync(svgPath, content, 'utf-8');
  return count;
}

// ========== Step 5: Flatten Tspan ==========

var TEXT_STYLE_ATTRS = [
  'font-family','font-size','font-weight','font-style','font-variant',
  'font-stretch','letter-spacing','word-spacing','kerning','text-anchor',
  'text-decoration','dominant-baseline','writing-mode','direction',
  'fill','fill-opacity','stroke','stroke-width','stroke-opacity',
  'opacity','paint-order','transform','clip-path','filter'
];

function mergeStyles(pStyle, cStyle) {
  var p = {}, c = {};
  if (pStyle) pStyle.split(';').forEach(function(s) { var i = s.indexOf(':'); if (i > 0) p[s.slice(0,i).trim()] = s.slice(i+1).trim(); });
  if (cStyle) cStyle.split(';').forEach(function(s) { var i = s.indexOf(':'); if (i > 0) c[s.slice(0,i).trim()] = s.slice(i+1).trim(); });
  Object.assign(p, c);
  return Object.entries(p).map(function(e) { return e[0] + ':' + e[1]; }).join(';');
}

function flattenTspanInSvg(svgPath) {
  var content = fs.readFileSync(svgPath, 'utf-8');
  var changed = false;

  // Find all <text>...</text> blocks using stack-based matching
  var textBlocks = [];
  var openRe = /<text\b/g, m;
  while ((m = openRe.exec(content)) !== null) {
    var startIdx = m.index, depth = 0, endIdx = -1;
    var tagRe2 = /<\/?text\b[^>]*\/?>/g;
    tagRe2.lastIndex = startIdx;
    var tm;
    while ((tm = tagRe2.exec(content)) !== null) {
      if (tm[0].startsWith('</text')) { depth--; if (depth === 0) { endIdx = tm.index + tm[0].length; break; } }
      else if (!tm[0].endsWith('/>')) depth++;
      else if (depth === 0) { endIdx = tm.index + tm[0].length; break; }
    }
    if (endIdx > startIdx) textBlocks.push({ start: startIdx, end: endIdx, text: content.slice(startIdx, endIdx) });
  }
  if (!textBlocks.length) return false;

  for (var i = textBlocks.length - 1; i >= 0; i--) {
    var block = textBlocks[i];
    var textStr = block.text;
    if (!/<tspan\b/.test(textStr)) continue;

    var textAttrM = textStr.match(/^<text\b([^>]*)>/);
    if (!textAttrM) continue;
    var textAttrsStr = textAttrM[1];

    var tspanRe = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g;
    var tspans = [], tsm2;
    while ((tsm2 = tspanRe.exec(textStr)) !== null) {
      tspans.push({ attrsStr: tsm2[1], content: tsm2[2] });
    }
    if (!tspans.length) continue;

    var needsFlatten = tspans.some(function(ts) {
      if (/\by="/.test(ts.attrsStr)) return true;
      if (/\bx="/.test(ts.attrsStr)) return true;
      if (/\bdy="/.test(ts.attrsStr)) {
        var dv = parseFirstNum((ts.attrsStr.match(/\bdy="([^"]*)"/) || [])[1]);
        if (dv !== null && dv !== 0) return true;
      }
      return false;
    });
    if (!needsFlatten) continue;

    var baseX = parseFirstNum((textAttrsStr.match(/\bx="([^"]*)"/) || [])[1]) || 0;
    var baseY = parseFirstNum((textAttrsStr.match(/\by="([^"]*)"/) || [])[1]) || 0;
    var textStyle = (textAttrsStr.match(/\bstyle="([^"]*)"/) || [])[1] || '';
    var parentAttrs = textAttrsStr.replace(/\bx="[^"]*"/, '').replace(/\by="[^"]*"/, '').trim();

    var lines = [], curX = baseX, curY = baseY, curLine = [];
    for (var j = 0; j < tspans.length; j++) {
      var ts = tspans[j];
      var tsHasY = /\by="/.test(ts.attrsStr);
      var tsHasDy = /\bdy="/.test(ts.attrsStr);
      var tsHasX = /\bx="/.test(ts.attrsStr);
      var isNew = tsHasY || tsHasX || (tsHasDy && parseFirstNum((ts.attrsStr.match(/\bdy="([^"]*)"/) || [])[1]) !== 0);
      if (isNew) {
        if (curLine.length) { lines.push({ x: curX, y: curY, items: curLine.slice() }); curLine = []; }
        if (tsHasY) { var yv2 = parseFirstNum((ts.attrsStr.match(/\by="([^"]*)"/) || [])[1]); if (yv2 !== null) curY = yv2; }
        else if (tsHasDy) { var dv2 = parseFirstNum((ts.attrsStr.match(/\bdy="([^"]*)"/) || [])[1]); if (dv2 !== null) curY += dv2; }
        if (tsHasX) { var xv2 = parseFirstNum((ts.attrsStr.match(/\bx="([^"]*)"/) || [])[1]); if (xv2 !== null) curX = xv2; }
      }
      if (ts.content.trim()) curLine.push(ts);
    }
    if (curLine.length) lines.push({ x: curX, y: curY, items: curLine.slice() });

    var newElems = [];
    for (var k = 0; k < lines.length; k++) {
      var ln = lines[k];
      if (ln.items.length === 1) {
        var t = ln.items[0];
        var attrs = parentAttrs;
        var ms = mergeStyles(textStyle, (t.attrsStr.match(/\bstyle="([^"]*)"/) || [])[1] || '');
        if (ms) { attrs = attrs.replace(/\bstyle="[^"]*"/, '').trim(); attrs += ' style="' + ms + '"'; }
        for (var ai = 0; ai < TEXT_STYLE_ATTRS.length; ai++) {
          var aRe = new RegExp('\\b' + TEXT_STYLE_ATTRS[ai] + '="([^"]*)"');
          var am = t.attrsStr.match(aRe);
          if (am) { attrs = attrs.replace(aRe, '').trim(); attrs += ' ' + TEXT_STYLE_ATTRS[ai] + '="' + am[1] + '"'; }
        }
        newElems.push('<text x="' + fmtNum(ln.x) + '" y="' + fmtNum(ln.y) + '" ' + attrs.trim() + '>' + t.content + '</text>');
      } else {
        var parts = ln.items.map(function(t2) {
          var ca = t2.attrsStr.replace(/\bx="[^"]*"/g,'').replace(/\by="[^"]*"/g,'').replace(/\bdx="[^"]*"/g,'').replace(/\bdy="[^"]*"/g,'').trim();
          return '<tspan' + (ca ? ' ' + ca : '') + '>' + t2.content + '</tspan>';
        });
        newElems.push('<text x="' + fmtNum(ln.x) + '" y="' + fmtNum(ln.y) + '" ' + parentAttrs.trim() + '>' + parts.join('') + '</text>');
      }
    }
    var replacement = newElems.join('\n');
    content = content.slice(0, block.start) + replacement + content.slice(block.end);
    changed = true;
  }
  if (changed) fs.writeFileSync(svgPath, content, 'utf-8');
  return changed;
}

// ========== Step 6: Rect to Path ==========

function rectToRoundedPath(x, y, w, h, rx, ry) {
  rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
  var x1 = x + rx, x2 = x + w - rx, y1 = y + ry, y2 = y + h - ry;
  var d = 'M' + x1.toFixed(2) + ',' + y.toFixed(2)
    + ' H' + x2.toFixed(2)
    + ' A' + rx.toFixed(2) + ',' + ry.toFixed(2) + ' 0 0 1 ' + (x+w).toFixed(2) + ',' + y1.toFixed(2)
    + ' V' + y2.toFixed(2)
    + ' A' + rx.toFixed(2) + ',' + ry.toFixed(2) + ' 0 0 1 ' + x2.toFixed(2) + ',' + (y+h).toFixed(2)
    + ' H' + x1.toFixed(2)
    + ' A' + rx.toFixed(2) + ',' + ry.toFixed(2) + ' 0 0 1 ' + x.toFixed(2) + ',' + y2.toFixed(2)
    + ' V' + y1.toFixed(2)
    + ' A' + rx.toFixed(2) + ',' + ry.toFixed(2) + ' 0 0 1 ' + x1.toFixed(2) + ',' + y.toFixed(2)
    + ' Z';
  return d.replace(/\.00(?=\s|,|[A-Za-z]|$)/g, '');
}

function processRoundedRects(svgPath) {
  var content = fs.readFileSync(svgPath, 'utf-8');
  var count = 0;
  // Match <rect ... /> or <rect ...></rect>
  content = content.replace(/<rect\b([^>]*?)(?:\/>|><\/rect>)/g, function(full, attrsStr) {
    var pf = function(n) { var v = (attrsStr.match(new RegExp('\\b' + n + '="([^"]*)"')) || [])[1]; return v ? parseFloat(v.replace(/px|pt|em|%|rem$/,'')) : 0; };
    var rx = pf('rx'), ry = pf('ry');
    if (rx === 0 && ry > 0) rx = ry;
    if (ry === 0 && rx > 0) ry = rx;
    if (rx <= 0 && ry <= 0) return full;
    var xv = pf('x'), yv = pf('y'), wv = pf('width'), hv = pf('height');
    if (wv <= 0 || hv <= 0) return full;
    var pathD = rectToRoundedPath(xv, yv, wv, hv, rx, ry);
    // Remove rect-specific attrs, keep style/fill/stroke/class etc.
    var keepAttrs = attrsStr
      .replace(/\bx="[^"]*"/g, '').replace(/\by="[^"]*"/g, '')
      .replace(/\bwidth="[^"]*"/g, '').replace(/\bheight="[^"]*"/g, '')
      .replace(/\brx="[^"]*"/g, '').replace(/\bry="[^"]*"/g, '')
      .trim();
    count++;
    return '<path d="' + pathD + '"' + (keepAttrs ? ' ' + keepAttrs : '') + '/>';
  });
  if (count > 0) fs.writeFileSync(svgPath, content, 'utf-8');
  return count;
}

// ========== Main Orchestration ==========

function finalizeProject(projectDir, options, quiet) {
  var svgOutput = path.join(projectDir, 'svg_output');
  var svgFinal = path.join(projectDir, 'svg_final');
  var iconsDir = path.join(path.dirname(__filename), '..', 'templates', 'icons');

  if (!fs.existsSync(svgOutput)) { safePrint('[ERROR] svg_output directory not found: ' + svgOutput); return false; }
  var svgFiles = globSvg(svgOutput);
  if (!svgFiles.length) { safePrint('[ERROR] No SVG files in svg_output'); return false; }

  if (!quiet) {
    console.log();
    safePrint('[DIR] Project: ' + path.basename(projectDir));
    safePrint('[FILE] ' + svgFiles.length + ' SVG file(s)');
    console.log();
  }

  // Step 1: Copy svg_output -> svg_final
  copyDir(svgOutput, svgFinal);
  var finalFiles = globSvg(svgFinal);

  // Step 2: Embed icons
  if (options.embed_icons) {
    if (!quiet) safePrint('[1/6] Embedding icons...');
    var ic = 0;
    finalFiles.forEach(function(f) { ic += embedIconsInFile(f, iconsDir); });
    if (!quiet) safePrint('      ' + (ic > 0 ? ic + ' icon(s) embedded' : 'No icons'));
  }

  // Step 3: Crop images
  if (options.crop_images) {
    if (!quiet) safePrint('[2/6] Smart cropping images...');
    if (!quiet) safePrint('      Skipped (image cropping requires Pillow/sharp)');
  }

  // Step 4: Fix aspect
  if (options.fix_aspect) {
    if (!quiet) safePrint('[3/6] Fixing image aspect ratios...');
    var ac = 0;
    finalFiles.forEach(function(f) { ac += fixImageAspectInSvg(f); });
    if (!quiet) safePrint('      ' + (ac > 0 ? ac + ' image(s) fixed' : 'No images'));
  }

  // Step 5: Embed images
  if (options.embed_images) {
    if (!quiet) safePrint('[4/6] Embedding images...');
    var ec = 0;
    finalFiles.forEach(function(f) { ec += embedImagesInSvg(f); });
    if (!quiet) safePrint('      ' + (ec > 0 ? ec + ' image(s) embedded' : 'No images'));
  }

  // Step 6: Flatten text
  if (options.flatten_text) {
    if (!quiet) safePrint('[5/6] Flattening text...');
    var fc = 0;
    finalFiles.forEach(function(f) { if (flattenTspanInSvg(f)) fc++; });
    if (!quiet) safePrint('      ' + (fc > 0 ? fc + ' file(s) processed' : 'No processing needed'));
  }

  // Step 7: Fix rounded rects
  if (options.fix_rounded) {
    if (!quiet) safePrint('[6/6] Converting rounded rects to Path...');
    var rc = 0;
    finalFiles.forEach(function(f) { rc += processRoundedRects(f); });
    if (!quiet) safePrint('      ' + (rc > 0 ? rc + ' rounded rectangle(s) converted' : 'No rounded rectangles'));
  }

  if (!quiet) {
    console.log();
    safePrint('[OK] Done!');
    console.log();
    console.log('Next steps:');
    console.log('  node scripts/svg_to_pptx.cjs "' + projectDir + '" -s final');
  }
  return true;
}

// ========== CLI ==========

function main() {
  var args = process.argv.slice(2);
  var projectDir = null, only = [], quiet = false;
  var compress = false, maxDim = null;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--only') {
      i++;
      while (i < args.length && !args[i].startsWith('--')) { only.push(args[i]); i++; }
      i--;
    } else if (args[i] === '-q' || args[i] === '--quiet') quiet = true;
    else if (args[i] === '--compress') compress = true;
    else if (args[i] === '--max-dimension') maxDim = parseInt(args[++i], 10);
    else if (!projectDir) projectDir = args[i];
  }

  if (!projectDir) {
    console.log('Usage: node finalize_svg.cjs <project_directory> [--only step1 step2] [-q]');
    process.exit(1);
  }
  if (!fs.existsSync(projectDir)) {
    safePrint('[ERROR] Project directory does not exist: ' + projectDir);
    process.exit(1);
  }

  var ALL_STEPS = ['embed-icons','crop-images','fix-aspect','embed-images','flatten-text','fix-rounded'];
  var opts;
  if (only.length) {
    opts = {};
    ALL_STEPS.forEach(function(s) { opts[s.replace(/-/g,'_')] = only.includes(s); });
  } else {
    opts = { embed_icons: true, crop_images: true, fix_aspect: true, embed_images: true, flatten_text: true, fix_rounded: true };
  }

  var ok = finalizeProject(projectDir, opts, quiet);
  process.exit(ok ? 0 : 1);
}

main();
