#!/usr/bin/env node
/**
 * PPT Master - Preflight Environment Check (Node.js)
 *
 * Validates that the runtime environment has the tools needed
 * for the requested pipeline steps.
 *
 * Usage:
 *   node scripts/preflight.cjs                 # full check
 *   node scripts/preflight.cjs --core-only     # skip Python checks
 */

'use strict';

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

var OK = '[OK]';
var WARN = '[WARN]';
var FAIL = '[FAIL]';
var errors = 0;
var warnings = 0;

function check(label, fn) {
  try {
    var result = fn();
    if (result === true) {
      console.log(OK + ' ' + label);
    } else if (result === 'warn') {
      warnings++;
      console.log(WARN + ' ' + label);
    } else {
      errors++;
      console.log(FAIL + ' ' + label + (typeof result === 'string' ? ' - ' + result : ''));
    }
  } catch (e) {
    errors++;
    console.log(FAIL + ' ' + label + ' - ' + e.message);
  }
}

function which(cmd) {
  try {
    var r = child_process.execSync(process.platform === 'win32' ? 'where ' + cmd : 'which ' + cmd, { stdio: 'pipe' });
    return r.toString().trim().split(/\r?\n/)[0];
  } catch (_) {
    return null;
  }
}

function nodeVersion() {
  var v = process.versions.node;
  var major = parseInt(v.split('.')[0], 10);
  return major;
}

// --- Core checks (always run) ---

console.log('\n=== PPT Master Preflight Check ===\n');
console.log('--- Core (Node.js) ---');

check('Node.js >= 16', function () {
  var v = nodeVersion();
  if (v >= 16) return true;
  return 'found v' + process.versions.node;
});

var SKILL_DIR = path.resolve(__dirname, '..');
var scriptsDir = path.join(SKILL_DIR, 'scripts');

var coreScripts = [
  'project_manager.cjs',
  'total_md_split.cjs',
  'finalize_svg.cjs',
  'svg_to_pptx.cjs',
  'svg_quality_checker.cjs',
  'analyze_images.cjs'
];

coreScripts.forEach(function (name) {
  check('Script: ' + name, function () {
    return fs.existsSync(path.join(scriptsDir, name)) ? true : 'not found';
  });
});

// --- Python checks (skip with --core-only) ---

var coreOnly = process.argv.includes('--core-only');

if (!coreOnly) {
  console.log('\n--- Optional (Python, for PDF/DOCX/PPTX conversion) ---');

  check('Python 3', function () {
    var p = which('python3') || which('python');
    if (!p) { console.log('       Tip: Python is only needed for PDF/DOCX/PPTX source conversion'); return 'warn'; }
    return true;
  });

  var optionalPkgs = [
    { mod: 'fitz', pip: 'PyMuPDF', purpose: 'PDF conversion' },
    { mod: 'docx', pip: 'python-docx', purpose: 'DOCX conversion' },
    { mod: 'pptx', pip: 'python-pptx', purpose: 'PPTX reading' }
  ];

  var pyCmd = which('python3') || which('python');
  if (pyCmd) {
    optionalPkgs.forEach(function (pkg) {
      check('Python pkg: ' + pkg.pip + ' (' + pkg.purpose + ')', function () {
        try {
          child_process.execSync('"' + pyCmd + '" -c "import ' + pkg.mod + '"', { stdio: 'pipe' });
          return true;
        } catch (_) {
          return 'warn';
        }
      });
    });
  }
}

// --- Summary ---

console.log('\n--- Summary ---');
if (errors === 0 && warnings === 0) {
  console.log('All checks passed.');
} else {
  if (errors > 0) console.log(errors + ' error(s) - these must be fixed.');
  if (warnings > 0) console.log(warnings + ' warning(s) - optional, pipeline can run without these.');
}
console.log('');

process.exit(errors > 0 ? 1 : 0);
