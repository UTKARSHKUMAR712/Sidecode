/**
 * multifileCompiler.js — Multi-file compilation packager for Sidecode
 *
 * Prepares Godbolt Compiler Explorer payloads for multi-file projects:
 * 1. Collects all companion files in the project.
 * 2. Structures root-level `files: [{ filename, contents }]` array.
 * 3. Handles language-specific translation unit linking:
 *    - C/C++: Virtual Unity Build aggregation / header companion linking.
 *    - Rust: Module discovery (mod <name>;).
 *    - Python / JS / Go: Companion module inclusion.
 */

import { collectAllWorkspaceFiles, isWorkspaceOpen } from './workspace.js';

/**
 * Build multi-file compilation payload for Godbolt
 * @param {string} mainCode - The code of the active editor tab
 * @param {string} mainLanguage - Language of the active file
 * @param {string} mainFilename - Filename of the active file (e.g. "main.cpp")
 * @returns {Promise<{ source: string, files: Array<{ filename: string, contents: string }> }>}
 */
export async function prepareMultiFilePayload(mainCode, mainLanguage, mainFilename = 'main.cpp') {
  if (!isWorkspaceOpen()) {
    return { source: mainCode, files: [] };
  }

  const allFiles = await collectAllWorkspaceFiles();
  if (allFiles.length === 0) {
    return { source: mainCode, files: [] };
  }

  const filesPayload = [];
  const secondaryCppFiles = [];

  for (const item of allFiles) {
    // Skip the primary file itself from companion files
    if (item.filename === mainFilename || item.path === mainFilename) {
      continue;
    }

    filesPayload.push({
      path: item.path,
      filename: item.filename,
      contents: item.contents
    });

    // Track secondary C/C++ translation units
    if (
      (mainLanguage === 'cpp' || mainLanguage === 'c') &&
      (item.filename.endsWith('.cpp') || item.filename.endsWith('.cc') || item.filename.endsWith('.c'))
    ) {
      secondaryCppFiles.push(item.filename);
    }
  }

  let finalSource = mainCode;

  // For C/C++ projects with multiple .cpp/.c files:
  if ((mainLanguage === 'cpp' || mainLanguage === 'c') && secondaryCppFiles.length > 0) {
    const virtualIncludes = [];
    for (const secFile of secondaryCppFiles) {
      if (!mainCode.includes(`"${secFile}"`)) {
        virtualIncludes.push(`\n// [Sidecode Virtual Unity Build] Auto-linking companion translation unit:\n#include "${secFile}"`);
      }
    }
    if (virtualIncludes.length > 0) {
      finalSource = mainCode + '\n' + virtualIncludes.join('\n');
    }
  }

  // For JavaScript / TypeScript projects:
  const isJs = mainLanguage === 'javascript' || mainLanguage === 'js' || mainLanguage === 'typescript' || mainLanguage === 'ts';
  if (isJs && filesPayload.length > 0) {
    const filesObj = {};
    for (const f of filesPayload) {
      if (f.path) filesObj[f.path.replace(/\\/g, '/')] = f.contents;
      filesObj[f.filename] = f.contents;
    }
    const cleanMain = String(mainFilename || '').replace(/\\/g, '/');
    const mainDir = cleanMain.includes('/') ? cleanMain.substring(0, cleanMain.lastIndexOf('/')) : '';

    const virtualBundle = `/* Sidecode Virtual CommonJS Bundle */
if (typeof require === 'undefined') {
  var _vFiles = ${JSON.stringify(filesObj)};
  var _vCache = {};
  var _resolveRel = function(base, req) {
    var clean = String(req).replace(/\\\\/g, '/');
    if (!clean.startsWith('./') && !clean.startsWith('../')) return clean;
    var b = base ? base.split('/').filter(Boolean) : [];
    var parts = clean.split('/').filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.') continue;
      if (parts[i] === '..') { if (b.length > 0) b.pop(); }
      else b.push(parts[i]);
    }
    return b.join('/');
  };
  var _createRequire = function(dir) {
    return function(p) {
      var target = _resolveRel(dir, p);
      var clean = target.replace(/^(\\.\\/|\\/)/, '');
      var base = clean.split('/').pop();
      var cands = [clean, clean + '.js', clean + '/index.js', String(p).replace(/^(\\.\\/|\\/)/, ''), String(p).replace(/^(\\.\\/|\\/)/, '') + '.js', base, base + '.js'];
      for (var ci = 0; ci < cands.length; ci++) {
        var c = cands[ci];
        for (var k in _vFiles) {
          var normK = k.replace(/\\\\/g, '/');
          if (normK === c || normK.endsWith('/' + c)) {
            if (_vCache[normK]) return _vCache[normK].exports;
            var m = { exports: {} };
            _vCache[normK] = m;
            var subDir = normK.includes('/') ? normK.substring(0, normK.lastIndexOf('/')) : '';
            var fn = new Function('module', 'exports', 'require', '__dirname', '__filename', _vFiles[k]);
            fn(m, m.exports, _createRequire(subDir), subDir, normK);
            return m.exports;
          }
        }
      }
      throw new Error("Cannot find module '" + p + "' in workspace");
    };
  };
  var require = _createRequire(${JSON.stringify(mainDir)});
}\n`;
    finalSource = virtualBundle + finalSource;
  }

  return {
    source: finalSource,
    files: filesPayload
  };
}
