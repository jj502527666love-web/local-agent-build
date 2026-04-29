#!/usr/bin/env node
/**
 * PPT Master - Speaker Notes Splitting Tool (Node.js)
 *
 * Splits the total.md speaker notes file into multiple individual notes files,
 * each corresponding to one SVG page.
 *
 * Usage:
 *   node scripts/total_md_split.cjs <project_path>
 *   node scripts/total_md_split.cjs <project_path> -o output_dir
 *
 * Dependencies: None (only uses Node.js built-ins)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HEADING_RE = /^(#{1,6})\s*(.+?)\s*$/;
const HR_RE = /^\s*[-*]{3,}\s*$/;

function normalizeTitle(title) {
  if (!title) return '';
  let text = title.trim();
  text = text.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '_');
  text = text.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return text.toLowerCase();
}

function extractLeadingNumber(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // Try 1: Start with digits
  let m = trimmed.match(/^(\d{1,3})/);
  if (m) return parseInt(m[1], 10);

  const lower = trimmed.toLowerCase();

  // Slide/Page X
  m = lower.match(/^(?:slide|page|p)\s*[-_:]?\s*(\d{1,3})/);
  if (m) return parseInt(m[1], 10);

  // 第X页/张
  m = lower.match(/^第\s*(\d{1,3})\s*[页张]/);
  if (m) return parseInt(m[1], 10);

  return null;
}

function buildMatchMaps(svgStems) {
  const exact = new Set(svgStems);
  const normMap = {};
  const numMap = {};
  for (const stem of svgStems) {
    const norm = normalizeTitle(stem);
    if (norm) {
      if (!normMap[norm]) normMap[norm] = [];
      normMap[norm].push(stem);
    }
    const num = extractLeadingNumber(stem);
    if (num !== null) {
      if (!numMap[num]) numMap[num] = [];
      numMap[num].push(stem);
    }
  }
  return { exact, normMap, numMap };
}

function matchTitle(rawTitle, exact, normMap, numMap, svgStems) {
  if (exact.has(rawTitle)) return rawTitle;
  const norm = normalizeTitle(rawTitle);
  if (normMap[norm] && normMap[norm].length === 1) return normMap[norm][0];
  const num = extractLeadingNumber(rawTitle);
  if (num !== null && numMap[num] && numMap[num].length === 1) return numMap[num][0];
  if (norm && svgStems) {
    const candidates = svgStems.filter(s => normalizeTitle(s).includes(norm));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

function findSvgFiles(projectPath) {
  const svgDir = path.join(projectPath, 'svg_output');
  if (!fs.existsSync(svgDir)) {
    console.log(`Error: ${svgDir} directory does not exist`);
    return [];
  }
  return fs.readdirSync(svgDir)
    .filter(f => f.endsWith('.svg'))
    .sort()
    .map(f => path.join(svgDir, f));
}

function parseTotalMd(mdPath, svgStems, verbose) {
  if (!fs.existsSync(mdPath)) {
    console.log(`Error: ${mdPath} file does not exist`);
    return {};
  }

  let content;
  try {
    content = fs.readFileSync(mdPath, 'utf-8');
  } catch (e) {
    console.log(`Error: Unable to read file ${mdPath}: ${e.message}`);
    return {};
  }

  svgStems = svgStems || [];
  const { exact, normMap, numMap } = buildMatchMaps(svgStems);

  const notes = {};
  let currentKey = null;
  let currentLines = [];
  const unmatchedHeadings = [];

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      const rawTitle = m[2].trim();
      const matched = matchTitle(rawTitle, exact, normMap, numMap, svgStems);
      if (matched) {
        if (currentKey !== null) {
          const text = currentLines.join('\n').trim();
          if (currentKey in notes && text) {
            notes[currentKey] = (notes[currentKey].trimEnd() + '\n\n' + text).trim();
          } else if (!(currentKey in notes)) {
            notes[currentKey] = text;
          }
        }
        currentKey = matched;
        currentLines = [];
        continue;
      }
      unmatchedHeadings.push(rawTitle);
    }

    if (HR_RE.test(line)) continue;
    if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    const text = currentLines.join('\n').trim();
    if (currentKey in notes && text) {
      notes[currentKey] = (notes[currentKey].trimEnd() + '\n\n' + text).trim();
    } else if (!(currentKey in notes)) {
      notes[currentKey] = text;
    }
  }

  if (verbose && unmatchedHeadings.length > 0) {
    console.log('\n[Notice] Found unmatched headings (ignored):');
    for (const t of unmatchedHeadings.slice(0, 10)) {
      console.log(`  - ${t}`);
    }
    if (unmatchedHeadings.length > 10) {
      console.log(`  ... and ${unmatchedHeadings.length - 10} more`);
    }
  }

  return notes;
}

function checkSvgNoteMapping(svgFiles, notes) {
  const missingNotes = [];
  for (const svgPath of svgFiles) {
    const stem = path.basename(svgPath, '.svg');
    if (!(stem in notes)) {
      missingNotes.push(stem);
    }
  }
  return { allMatch: missingNotes.length === 0, missingNotes };
}

function splitNotes(notes, outputDir, verbose) {
  if (Object.keys(notes).length === 0) {
    console.log('Error: No notes content found');
    return false;
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let successCount = 0;
  for (const [title, content] of Object.entries(notes)) {
    const outputPath = path.join(outputDir, `${title}.md`);
    try {
      fs.writeFileSync(outputPath, content, 'utf-8');
      if (verbose) console.log(`  Generated: ${path.basename(outputPath)}`);
      successCount++;
    } catch (e) {
      if (verbose) console.log(`  Error: Unable to write file ${outputPath}: ${e.message}`);
    }
  }

  if (verbose) {
    console.log(`\n[Done] Successfully generated ${successCount}/${Object.keys(notes).length} file(s)`);
  }
  return successCount === Object.keys(notes).length;
}

function main() {
  const args = process.argv.slice(2);
  let projectPath = null;
  let outputArg = null;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      outputArg = args[++i];
    } else if (args[i] === '-q' || args[i] === '--quiet') {
      quiet = true;
    } else if (!projectPath) {
      projectPath = args[i];
    }
  }

  if (!projectPath) {
    console.log('Usage: node total_md_split.cjs <project_path> [-o output_dir] [-q]');
    process.exit(1);
  }

  if (!fs.existsSync(projectPath)) {
    console.log(`Error: Path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const outputDir = outputArg || path.join(projectPath, 'notes');
  const verbose = !quiet;

  if (verbose) {
    console.log('PPT Master - Speaker Notes Splitting Tool');
    console.log('='.repeat(50));
    console.log(`  Project path: ${projectPath}`);
    console.log(`  Output directory: ${outputDir}`);
    console.log();
  }

  const svgFiles = findSvgFiles(projectPath);
  if (svgFiles.length === 0) {
    console.log('Error: No SVG files found');
    process.exit(1);
  }

  if (verbose) console.log(`  Found ${svgFiles.length} SVG file(s)`);

  const svgStems = svgFiles.map(f => path.basename(f, '.svg'));
  const totalMdPath = path.join(projectPath, 'notes', 'total.md');
  const notes = parseTotalMd(totalMdPath, svgStems, verbose);

  if (Object.keys(notes).length === 0) {
    console.log('Error: No notes content found');
    process.exit(1);
  }

  if (verbose) {
    console.log(`  Found ${Object.keys(notes).length} notes section(s)`);
    console.log();
  }

  const { allMatch, missingNotes } = checkSvgNoteMapping(svgFiles, notes);
  if (!allMatch) {
    console.log('Error: SVG files and notes do not match');
    console.log(`  Missing notes: ${missingNotes.join(', ')}`);
    console.log('\nPlease regenerate the notes file to ensure every SVG has corresponding notes.');
    process.exit(1);
  }

  if (verbose) {
    console.log('[OK] SVG files and notes have one-to-one correspondence');
    console.log();
  }

  const success = splitNotes(notes, outputDir, verbose);
  if (success) {
    if (verbose) console.log('\n[Done] Notes splitting complete');
    process.exit(0);
  } else {
    console.log('\n[Failed] Notes splitting failed');
    process.exit(1);
  }
}

main();
