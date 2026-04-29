#!/usr/bin/env node
/**
 * PPT Master - Image Size Analysis Tool (Node.js)
 *
 * Reports width, height, aspect ratio, category for all images in a folder.
 * Drop-in replacement for analyze_images.py — zero external dependencies.
 *
 * Usage:
 *   node scripts/analyze_images.cjs <images_folder_path>
 *   node scripts/analyze_images.cjs projects/xxx/images --canvas ppt169
 */

'use strict';

var fs = require('fs');
var path = require('path');

var IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
var TITLE_HEIGHT = 60;
var LAYOUT_GAP = 20;
var MIN_TEXT_HEIGHT = 150;
var MIN_TEXT_WIDTH = 280;

var CANVAS_FORMATS = {
  ppt169:      { name: 'PPT 16:9',  w: 1280, h: 720 },
  ppt43:       { name: 'PPT 4:3',   w: 1024, h: 768 },
  wechat:      { name: 'WeChat',    w: 900,  h: 383 },
  xiaohongshu: { name: 'XHS',       w: 1242, h: 1660 },
  moments:     { name: 'Moments',   w: 1080, h: 1080 },
  story:       { name: 'Story',     w: 1080, h: 1920 },
  banner:      { name: 'Banner',    w: 1920, h: 1080 },
  a4:          { name: 'A4 Print',  w: 1240, h: 1754 },
};

var LAYOUT_MARGINS = {
  ppt169: { top: 60, right: 60, bottom: 60, left: 60, cw: 1160, ch: 600 },
  ppt43:  { top: 50, right: 50, bottom: 50, left: 50, cw: 924,  ch: 668 },
};

function getImageDimensions(filePath) {
  try {
    var buf = fs.readFileSync(filePath);
    // PNG
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      var pos = 2;
      while (pos < buf.length - 1) {
        if (buf[pos] !== 0xff) break;
        var marker = buf[pos + 1];
        if (marker === 0xc0 || marker === 0xc2) return { w: buf.readUInt16BE(pos + 7), h: buf.readUInt16BE(pos + 5) };
        if (marker === 0xd9) break;
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
        pos += 2 + buf.readUInt16BE(pos + 2);
      }
    }
    // GIF
    if (buf.slice(0, 3).toString() === 'GIF') {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    // BMP
    if (buf.slice(0, 2).toString() === 'BM') {
      return { w: buf.readInt32LE(18), h: Math.abs(buf.readInt32LE(22)) };
    }
    // WebP
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      if (buf.slice(12, 16).toString() === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      if (buf.slice(12, 16).toString() === 'VP8L') {
        var bits = buf.readUInt32LE(21);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch (_) {}
  return null;
}

function classifyRatio(r) {
  if (r > 2.0) return 'Ultra-wide';
  if (r > 1.5) return 'Wide landscape';
  if (r > 1.2) return 'Standard landscape';
  if (r > 0.8) return 'Near square';
  return 'Portrait';
}

function computeLayout(ratio, cw, ch) {
  function tryTopBottom() {
    var iw = cw, ih = Math.round(cw / ratio), th = ch - ih - LAYOUT_GAP;
    if (th >= MIN_TEXT_HEIGHT) return { type: 'top-bottom', iw: iw, ih: ih, tw: cw, th: th };
    return null;
  }
  function tryLRHeight() {
    var ih = ch, iw = Math.round(ch * ratio), tw = cw - iw - LAYOUT_GAP;
    if (tw >= MIN_TEXT_WIDTH) return { type: 'left-right', iw: iw, ih: ih, tw: tw, th: ch };
    return null;
  }
  function tryLRWidth() {
    var iw = Math.round(cw * 0.7), ih = Math.round(iw / ratio), tw = cw - iw - LAYOUT_GAP;
    return { type: 'left-right', iw: iw, ih: Math.min(ih, ch), tw: Math.max(tw, MIN_TEXT_WIDTH), th: ch };
  }
  if (ratio > 1.5) return tryTopBottom() || tryLRWidth();
  return tryLRHeight() || tryLRWidth();
}

function analyzeImages(imagesDir) {
  var results = [];
  fs.readdirSync(imagesDir).sort().forEach(function(filename) {
    var fp = path.join(imagesDir, filename);
    if (!fs.statSync(fp).isFile()) return;
    if (!IMAGE_EXTS.includes(path.extname(filename).toLowerCase())) return;
    var dims = getImageDimensions(fp);
    if (!dims) { console.log('[WARN] Cannot read ' + filename); return; }
    var ratio = dims.w / dims.h;
    results.push({
      filename: filename, width: dims.w, height: dims.h,
      ratio: ratio, hint: classifyRatio(ratio),
      sizeKb: fs.statSync(fp).size / 1024,
    });
  });
  return results;
}

function printResults(results, hasLayout) {
  console.log('\n' + '='.repeat(100));
  console.log('Image Size Analysis Report');
  console.log('='.repeat(100));
  if (hasLayout) {
    console.log('\n' + pad('No.', 4) + pad('Width', 7) + pad('Height', 7) + pad('Ratio', 7) + pad('Size', 10) + pad('Category', 20) + pad('Img (SxS)', 14) + 'Filename');
  } else {
    console.log('\n' + pad('No.', 4) + pad('Width', 7) + pad('Height', 7) + pad('Ratio', 7) + pad('Size', 10) + pad('Category', 20) + 'Filename');
  }
  console.log('-'.repeat(100));
  results.forEach(function(img, i) {
    var base = pad(String(i + 1), 4) + pad(String(img.width), 7) + pad(String(img.height), 7) + pad(img.ratio.toFixed(2), 7) + pad(img.sizeKb.toFixed(1) + 'KB', 10) + pad(img.hint, 20);
    if (hasLayout && img.iw) {
      console.log(base + pad(img.iw + 'x' + img.ih, 14) + img.filename.slice(0, 35));
    } else {
      console.log(base + img.filename.slice(0, 40));
    }
  });
  console.log('-'.repeat(100));
  console.log('Total: ' + results.length + ' images\n');
}

function pad(s, n) { while (s.length < n) s += ' '; return s; }

function saveCsv(results, csvPath, hasLayout) {
  var lines = [];
  if (hasLayout) {
    lines.push('No,Filename,Width,Height,AspectRatio,SizeKB,Category,ImageArea_SxS,TextArea_SxS');
    results.forEach(function(img, i) {
      lines.push([i + 1, img.filename, img.width, img.height, img.ratio.toFixed(2), img.sizeKb.toFixed(1), img.hint, img.iw + 'x' + img.ih, img.tw + 'x' + img.th].join(','));
    });
  } else {
    lines.push('No,Filename,Width,Height,AspectRatio,SizeKB,Category');
    results.forEach(function(img, i) {
      lines.push([i + 1, img.filename, img.width, img.height, img.ratio.toFixed(2), img.sizeKb.toFixed(1), img.hint].join(','));
    });
  }
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf-8');
  console.log('\nCSV saved to: ' + csvPath);
}

function main() {
  var args = process.argv.slice(2);
  var imagesDir = null, canvasKey = 'ppt169';
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--canvas' && args[i + 1]) canvasKey = args[++i];
    else if (!imagesDir) imagesDir = args[i];
  }
  if (!imagesDir) { console.log('Usage: node analyze_images.cjs <images_dir> [--canvas ppt169]'); process.exit(1); }
  imagesDir = path.resolve(imagesDir);
  if (!fs.existsSync(imagesDir) || !fs.statSync(imagesDir).isDirectory()) { console.log('Error: Not a directory: ' + imagesDir); process.exit(1); }
  if (!CANVAS_FORMATS[canvasKey]) { console.log('Error: Unknown canvas: ' + canvasKey); process.exit(1); }

  var fmt = CANVAS_FORMATS[canvasKey];
  console.log('Analyzing: ' + imagesDir);
  console.log('Canvas: ' + fmt.name + ' (' + fmt.w + 'x' + fmt.h + ')');

  var results = analyzeImages(imagesDir);
  if (!results.length) { console.log('No image files found.'); return; }

  var margins = LAYOUT_MARGINS[canvasKey];
  var hasLayout = !!margins;
  if (margins) {
    results.forEach(function(img) {
      var l = computeLayout(img.ratio, margins.cw, margins.ch);
      img.iw = l.iw; img.ih = l.ih; img.tw = l.tw; img.th = l.th;
    });
  }

  printResults(results, hasLayout);
  var csvPath = path.join(path.dirname(imagesDir), 'image_analysis.csv');
  saveCsv(results, csvPath, hasLayout);
}

main();
