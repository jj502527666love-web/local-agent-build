#!/usr/bin/env node
/**
 * PPT Master - SVG to PPTX Tool (Node.js)
 *
 * Creates PPTX files from SVG slides with speaker notes support.
 * Drop-in replacement for svg_to_pptx.py (legacy SVG-as-image mode).
 *
 * Usage:
 *   node scripts/svg_to_pptx.cjs <project_path> -s final
 *   node scripts/svg_to_pptx.cjs <project_path> -s final -o output.pptx
 *   node scripts/svg_to_pptx.cjs <project_path> -s final --no-notes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ========== Minimal ZIP Writer ==========

function createZip(files) {
  // files: [{name: string, data: Buffer}]
  var localHeaders = [];
  var centralEntries = [];
  var offset = 0;

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var nameB = Buffer.from(f.name, 'utf-8');
    var raw = f.data;
    var compressed = zlib.deflateRawSync(raw);
    var useDeflate = compressed.length < raw.length;
    var storedData = useDeflate ? compressed : raw;
    var method = useDeflate ? 8 : 0;

    var crc = crc32(raw);

    // Local file header (30 + nameLen + dataLen)
    var lh = Buffer.alloc(30 + nameB.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);  // version needed
    lh.writeUInt16LE(0, 6);   // flags
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);  // mod time
    lh.writeUInt16LE(0, 12);  // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(storedData.length, 18); // compressed size
    lh.writeUInt32LE(raw.length, 22);        // uncompressed size
    lh.writeUInt16LE(nameB.length, 26);
    lh.writeUInt16LE(0, 28); // extra field length
    nameB.copy(lh, 30);

    localHeaders.push({ header: lh, data: storedData, offset: offset });

    // Central directory entry
    var ce = Buffer.alloc(46 + nameB.length);
    ce.writeUInt32LE(0x02014b50, 0);
    ce.writeUInt16LE(20, 4);  // version made by
    ce.writeUInt16LE(20, 6);  // version needed
    ce.writeUInt16LE(0, 8);   // flags
    ce.writeUInt16LE(method, 10);
    ce.writeUInt16LE(0, 12);  // mod time
    ce.writeUInt16LE(0, 14);  // mod date
    ce.writeUInt32LE(crc, 16);
    ce.writeUInt32LE(storedData.length, 20);
    ce.writeUInt32LE(raw.length, 24);
    ce.writeUInt16LE(nameB.length, 28);
    ce.writeUInt16LE(0, 30);  // extra length
    ce.writeUInt16LE(0, 32);  // comment length
    ce.writeUInt16LE(0, 34);  // disk start
    ce.writeUInt16LE(0, 36);  // internal attrs
    ce.writeUInt32LE(0, 38);  // external attrs
    ce.writeUInt32LE(offset, 42); // local header offset
    nameB.copy(ce, 46);
    centralEntries.push(ce);

    offset += lh.length + storedData.length;
  }

  var centralDirOffset = offset;
  var centralDirSize = 0;
  centralEntries.forEach(function(ce) { centralDirSize += ce.length; });

  // End of central directory
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);  // disk number
  eocd.writeUInt16LE(0, 6);  // disk with central dir
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  var parts = [];
  localHeaders.forEach(function(lh) { parts.push(lh.header); parts.push(lh.data); });
  centralEntries.forEach(function(ce) { parts.push(ce); });
  parts.push(eocd);
  return Buffer.concat(parts);
}

// CRC-32 implementation
var crcTable = null;
function makeCrcTable() {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
}
function crc32(buf) {
  if (!crcTable) crcTable = makeCrcTable();
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ========== PPTX Template XML ==========

var EMU_PER_PIXEL = 914400 / 96; // 9525

var CANVAS_FORMATS = {
  ppt169:     { name: 'PPT 16:9',       w: 1280, h: 720,  viewbox: '0 0 1280 720' },
  ppt43:      { name: 'PPT 4:3',        w: 1024, h: 768,  viewbox: '0 0 1024 768' },
  wechat:     { name: 'WeChat Header',  w: 900,  h: 383,  viewbox: '0 0 900 383' },
  xiaohongshu:{ name: 'XHS',            w: 1242, h: 1660, viewbox: '0 0 1242 1660' },
  moments:    { name: 'Moments',        w: 1080, h: 1080, viewbox: '0 0 1080 1080' },
  story:      { name: 'Story',          w: 1080, h: 1920, viewbox: '0 0 1080 1920' },
  banner:     { name: 'Banner',         w: 1920, h: 1080, viewbox: '0 0 1920 1080' },
  a4:         { name: 'A4 Print',       w: 1240, h: 1754, viewbox: '0 0 1240 1754' },
};

function detectFormatFromSvg(svgPath) {
  try {
    var head = fs.readFileSync(svgPath, 'utf-8').slice(0, 2000);
    var m = head.match(/viewBox="([^"]+)"/);
    if (m) {
      for (var key in CANVAS_FORMATS) {
        if (CANVAS_FORMATS[key].viewbox === m[1]) return key;
      }
    }
  } catch(_) {}
  return null;
}

function getViewboxDims(svgPath) {
  try {
    var head = fs.readFileSync(svgPath, 'utf-8').slice(0, 2000);
    var m = head.match(/viewBox="([^"]+)"/);
    if (!m) return null;
    var p = m[1].trim().split(/[\s,]+/);
    if (p.length < 4) return null;
    var w = parseFloat(p[2]), h = parseFloat(p[3]);
    return (w > 0 && h > 0) ? { w: Math.round(w), h: Math.round(h) } : null;
  } catch(_) { return null; }
}

function contentTypesXml(slideCount, noteSlides, hasImages) {
  var overrides = '';
  for (var i = 1; i <= slideCount; i++) {
    overrides += '\n  <Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
  }
  for (var j = 0; j < noteSlides.length; j++) {
    overrides += '\n  <Override PartName="/ppt/notesSlides/notesSlide' + noteSlides[j] + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>';
  }
  var imgTypes = '\n  <Default Extension="svg" ContentType="image/svg+xml"/>';
  if (hasImages) imgTypes += '\n  <Default Extension="png" ContentType="image/png"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n  <Default Extension="xml" ContentType="application/xml"/>' + imgTypes + '\n  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>\n  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>\n  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + (noteSlides.length ? '\n  <Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>' : '') + overrides + '\n</Types>';
}

function rootRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n</Relationships>';
}

function presentationXml(slideCount, wEmu, hEmu) {
  var slideRefs = '';
  for (var i = 1; i <= slideCount; i++) {
    slideRefs += '\n    <p:sldId id="' + (255 + i) + '" r:id="rId' + (i + 1) + '"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n  <p:sldMasterIdLst>\n    <p:sldMasterId id="2147483648" r:id="rId1"/>\n  </p:sldMasterIdLst>\n  <p:sldIdLst>' + slideRefs + '\n  </p:sldIdLst>\n  <p:sldSz cx="' + wEmu + '" cy="' + hEmu + '"/>\n  <p:notesSz cx="6858000" cy="9144000"/>\n</p:presentation>';
}

function presentationRelsXml(slideCount, hasNotes) {
  var rels = '\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
  for (var i = 1; i <= slideCount; i++) {
    rels += '\n  <Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + i + '.xml"/>';
  }
  var nextId = slideCount + 2;
  rels += '\n  <Relationship Id="rId' + nextId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>';
  if (hasNotes) {
    nextId++;
    rels += '\n  <Relationship Id="rId' + nextId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '\n</Relationships>';
}

function slideMasterXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>\n</p:sldMaster>';
}

function slideMasterRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>\n</Relationships>';
}

function slideLayoutXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">\n  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n</p:sldLayout>';
}

function slideLayoutRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>\n</Relationships>';
}

function themeXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">\n  <a:themeElements>\n    <a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>\n    <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>\n    <a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>\n  </a:themeElements>\n</a:theme>';
}

function notesMasterXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n</p:notesMaster>';
}

function notesMasterRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>\n</Relationships>';
}

// ========== Slide & Notes XML ==========

function slideXml(slideNum, svgRid, wEmu, hEmu) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n  <p:cSld>\n    <p:spTree>\n      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n      <p:pic>\n        <p:nvPicPr><p:cNvPr id="2" name="SVG Image ' + slideNum + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>\n        <p:blipFill><a:blip r:embed="' + svgRid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>\n        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + wEmu + '" cy="' + hEmu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>\n      </p:pic>\n    </p:spTree>\n  </p:cSld>\n  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n</p:sld>';
}

function slideRelsXml(svgFilename, hasNotes, slideNum) {
  var rels = '\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';
  rels += '\n  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + svgFilename + '"/>';
  if (hasNotes) {
    rels += '\n  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide' + slideNum + '.xml"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '\n</Relationships>';
}

function mdToPlainText(md) {
  var lines = [], result = [];
  md.split('\n').forEach(function(line) {
    if (line.startsWith('#')) {
      var t = line.replace(/^#+\s*/, '').trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
      if (t) { lines.push(t); lines.push(''); }
    } else if (line.trim().startsWith('- ')) {
      lines.push('* ' + line.trim().slice(2).replace(/\*\*(.+?)\*\*/g, '$1'));
    } else if (line.trim()) {
      lines.push(line.trim().replace(/\*\*(.+?)\*\*/g, '$1'));
    } else { lines.push(''); }
  });
  var prevEmpty = false;
  lines.forEach(function(l) {
    if (l === '') { if (!prevEmpty) result.push(l); prevEmpty = true; }
    else { result.push(l); prevEmpty = false; }
  });
  return result.join('\n').trim();
}

function xmlEsc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function notesSlideXml(slideNum, notesText) {
  var paras = '';
  notesText.split('\n').forEach(function(p) {
    if (p.trim()) {
      paras += '<a:p><a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>' + xmlEsc(p) + '</a:t></a:r></a:p>\n';
    } else {
      paras += '<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>\n';
    }
  });
  if (!paras) paras = '<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n  <p:cSld><p:spTree>\n    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>\n    <p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>\n      <p:txBody><a:bodyPr/><a:lstStyle/>' + paras + '</p:txBody>\n    </p:sp>\n  </p:spTree></p:cSld>\n  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n</p:notes>';
}

function notesSlideRelsXml(slideNum) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>\n  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide' + slideNum + '.xml"/>\n</Relationships>';
}

// ========== File Discovery ==========

function findSvgFiles(projectPath, source) {
  var dirMap = { output: 'svg_output', final: 'svg_final' };
  var dirName = dirMap[source] || source;
  var svgDir = path.join(projectPath, dirName);
  if (!fs.existsSync(svgDir)) {
    console.log('  Warning: ' + dirName + ' not found, trying svg_output');
    dirName = 'svg_output';
    svgDir = path.join(projectPath, dirName);
  }
  if (!fs.existsSync(svgDir)) return { files: [], dirName: '' };
  var files = fs.readdirSync(svgDir).filter(function(f) { return f.endsWith('.svg'); }).sort().map(function(f) { return path.join(svgDir, f); });
  return { files: files, dirName: dirName };
}

function findNotesFiles(projectPath, svgFiles) {
  var notesDir = path.join(projectPath, 'notes');
  var notes = {};
  if (!fs.existsSync(notesDir)) return notes;
  var stemMap = {}, idxMap = {};
  svgFiles.forEach(function(f, i) {
    var stem = path.basename(f, '.svg');
    stemMap[stem] = i + 1;
    idxMap[i + 1] = stem;
  });
  fs.readdirSync(notesDir).filter(function(f) { return f.endsWith('.md'); }).forEach(function(f) {
    try {
      var content = fs.readFileSync(path.join(notesDir, f), 'utf-8').trim();
      if (!content) return;
      var stem = path.basename(f, '.md');
      var m = stem.match(/slide[_]?(\d+)/);
      if (m) { var idx = parseInt(m[1], 10); if (idxMap[idx]) notes[idxMap[idx]] = content; }
      if (stemMap[stem]) notes[stem] = content;
    } catch(_) {}
  });
  return notes;
}

// ========== Project Info ==========

function getProjectInfo(projectPath) {
  var specPath = path.join(projectPath, 'spec_lock.md');
  var name = path.basename(projectPath);
  var format = null;
  if (fs.existsSync(specPath)) {
    try {
      var spec = fs.readFileSync(specPath, 'utf-8').slice(0, 1000);
      var fm = spec.match(/format[:\s]+(\w+)/i);
      if (fm) format = fm[1];
      var nm = spec.match(/project_name[:\s]+(.+)/i);
      if (nm) name = nm[1].trim();
    } catch(_) {}
  }
  return { name: name, format: format };
}

// ========== Main Build ==========

function buildPptx(svgFiles, outputPath, opts) {
  var verbose = opts.verbose;
  var enableNotes = opts.enableNotes;
  var canvasFormat = opts.canvasFormat;
  var customPixels = null;

  if (!canvasFormat) {
    canvasFormat = detectFormatFromSvg(svgFiles[0]);
    if (canvasFormat && verbose) console.log('  Detected canvas format: ' + CANVAS_FORMATS[canvasFormat].name);
  }
  if (!canvasFormat) {
    var vb = getViewboxDims(svgFiles[0]);
    if (vb) { customPixels = vb; if (verbose) console.log('  Using SVG viewBox dimensions: ' + vb.w + ' x ' + vb.h + ' px'); }
  }
  if (!canvasFormat && !customPixels) { canvasFormat = 'ppt169'; if (verbose) console.log('  Using default format: PPT 16:9'); }

  var pw, ph;
  if (customPixels) { pw = customPixels.w; ph = customPixels.h; }
  else { var fmt = CANVAS_FORMATS[canvasFormat] || CANVAS_FORMATS.ppt169; pw = fmt.w; ph = fmt.h; }
  var wEmu = Math.round(pw * EMU_PER_PIXEL);
  var hEmu = Math.round(ph * EMU_PER_PIXEL);

  // Find notes
  var notes = {};
  if (enableNotes) {
    notes = findNotesFiles(path.dirname(svgFiles[0]).replace(/[/\\]svg_(output|final)$/, ''), svgFiles);
  }

  if (verbose) {
    console.log('  Slide dimensions: ' + pw + ' x ' + ph + ' px');
    console.log('  SVG file count: ' + svgFiles.length);
    console.log('  Mode: SVG image (pure SVG)');
    if (enableNotes && Object.keys(notes).length) console.log('  Speaker notes: ' + Object.keys(notes).length + ' page(s)');
    console.log();
  }

  var zipFiles = [];
  var noteSlides = [];

  var B = function(s) { return Buffer.from(s, 'utf-8'); };

  // Add template structure
  zipFiles.push({ name: '_rels/.rels', data: B(rootRelsXml()) });
  zipFiles.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: B(slideMasterXml()) });
  zipFiles.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: B(slideMasterRelsXml()) });
  zipFiles.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: B(slideLayoutXml()) });
  zipFiles.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: B(slideLayoutRelsXml()) });
  zipFiles.push({ name: 'ppt/theme/theme1.xml', data: B(themeXml()) });

  // Process slides
  for (var i = 0; i < svgFiles.length; i++) {
    var slideNum = i + 1;
    var svgPath = svgFiles[i];
    var svgBaseName = path.basename(svgPath);
    var svgStem = path.basename(svgPath, '.svg');
    var mediaName = 'image' + slideNum + '.svg';

    // Copy SVG to media
    zipFiles.push({ name: 'ppt/media/' + mediaName, data: fs.readFileSync(svgPath) });

    // Notes
    var notesMd = notes[svgStem] || '';
    var hasNotes = false;
    if (enableNotes && notesMd) {
      var notesTxt = mdToPlainText(notesMd);
      if (notesTxt) {
        hasNotes = true;
        noteSlides.push(slideNum);
        zipFiles.push({ name: 'ppt/notesSlides/notesSlide' + slideNum + '.xml', data: B(notesSlideXml(slideNum, notesTxt)) });
        zipFiles.push({ name: 'ppt/notesSlides/_rels/notesSlide' + slideNum + '.xml.rels', data: B(notesSlideRelsXml(slideNum)) });
      }
    }

    // Slide XML
    zipFiles.push({ name: 'ppt/slides/slide' + slideNum + '.xml', data: B(slideXml(slideNum, 'rId2', wEmu, hEmu)) });
    zipFiles.push({ name: 'ppt/slides/_rels/slide' + slideNum + '.xml.rels', data: B(slideRelsXml(mediaName, hasNotes, slideNum)) });

    if (verbose) {
      var notesStr = hasNotes ? ' +notes' : '';
      console.log('  [' + slideNum + '/' + svgFiles.length + '] ' + svgBaseName + ' (SVG)' + notesStr);
    }
  }

  // Add notesMaster if needed
  if (noteSlides.length) {
    zipFiles.push({ name: 'ppt/notesMasters/notesMaster1.xml', data: B(notesMasterXml()) });
    zipFiles.push({ name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: B(notesMasterRelsXml()) });
  }

  // Add presentation and content types (must be last to know noteSlides)
  zipFiles.push({ name: 'ppt/presentation.xml', data: B(presentationXml(svgFiles.length, wEmu, hEmu)) });
  zipFiles.push({ name: 'ppt/_rels/presentation.xml.rels', data: B(presentationRelsXml(svgFiles.length, noteSlides.length > 0)) });
  zipFiles.push({ name: '[Content_Types].xml', data: B(contentTypesXml(svgFiles.length, noteSlides, false)) });

  // Write ZIP
  var zipBuf = createZip(zipFiles);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, zipBuf);

  if (verbose) {
    console.log();
    console.log('[Done] Saved: ' + outputPath);
    console.log('  Slides: ' + svgFiles.length + ', Notes: ' + noteSlides.length);
  }
  return true;
}

// ========== CLI ==========

function main() {
  var args = process.argv.slice(2);
  var projectPath = null, outputPath = null, source = 'output', quiet = false, noNotes = false, canvasFormat = null;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '-s' || args[i] === '--source') source = args[++i];
    else if (args[i] === '-o' || args[i] === '--output') outputPath = args[++i];
    else if (args[i] === '-f' || args[i] === '--format') canvasFormat = args[++i];
    else if (args[i] === '-q' || args[i] === '--quiet') quiet = true;
    else if (args[i] === '--no-notes') noNotes = true;
    else if (args[i] === '--only' || args[i] === '--native' || args[i] === '--no-compat' || args[i] === '-t' || args[i] === '--transition' || args[i] === '--transition-duration' || args[i] === '--auto-advance') {
      if (args[i] === '-t' || args[i] === '--transition' || args[i] === '--transition-duration' || args[i] === '--auto-advance' || args[i] === '--only') i++;
    }
    else if (!projectPath) projectPath = args[i];
  }

  if (!projectPath) {
    console.log('Usage: node svg_to_pptx.cjs <project_path> -s final [-o output.pptx] [--no-notes]');
    process.exit(1);
  }
  if (!fs.existsSync(projectPath)) {
    console.log('Error: Path does not exist: ' + projectPath);
    process.exit(1);
  }

  var verbose = !quiet;
  var info = getProjectInfo(projectPath);
  if (!canvasFormat && info.format && CANVAS_FORMATS[info.format]) canvasFormat = info.format;

  var disc = findSvgFiles(projectPath, source);
  if (!disc.files.length) { console.log('Error: No SVG files found'); process.exit(1); }

  if (!outputPath) {
    var exportsDir = path.join(projectPath, 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    var ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
    outputPath = path.join(exportsDir, info.name + '_' + ts + '.pptx');
  }

  if (verbose) {
    console.log('PPT Master - SVG to PPTX Tool');
    console.log('='.repeat(50));
    console.log('  Project path: ' + projectPath);
    console.log('  SVG directory: ' + disc.dirName);
    console.log('  Output file: ' + outputPath);
    console.log();
  }

  var ok = buildPptx(disc.files, outputPath, {
    verbose: verbose,
    enableNotes: !noNotes,
    canvasFormat: canvasFormat,
  });
  process.exit(ok ? 0 : 1);
}

main();
