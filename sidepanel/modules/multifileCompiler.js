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
    if (item.filename === mainFilename) {
      continue;
    }

    filesPayload.push({
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
  // Godbolt compiles `source` as the primary translation unit and places `files` on disk.
  // To link secondary translation units without linker errors, we append virtual unity inclusions
  // if they are not already manually included in the main source.
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
  // For JavaScript / TypeScript projects:
  // If companion files exist in workspace, inject virtual require module bundle for Cloud V8
  const isJs = mainLanguage === 'javascript' || mainLanguage === 'js' || mainLanguage === 'typescript' || mainLanguage === 'ts';
  if (isJs && filesPayload.length > 0) {
    const filesObj = {};
    for (const f of filesPayload) {
      filesObj[f.filename] = f.contents;
    }
    const virtualBundle = `/* Sidecode Virtual CommonJS Bundle */
if (typeof require === 'undefined') {
  var _vFiles = ${JSON.stringify(filesObj)};
  var _vCache = {};
  var require = function(p) {
    var clean = String(p).replace(/^(\\.\\/|\\/)/, '');
    for (var k in _vFiles) {
      var normK = k.replace(/\\\\/g, '/');
      if (normK === clean || normK.endsWith('/' + clean) || normK === clean + '.js' || normK.endsWith('/' + clean + '.js')) {
        if (_vCache[normK]) return _vCache[normK].exports;
        var m = { exports: {} };
        _vCache[normK] = m;
        var fn = new Function('module', 'exports', 'require', _vFiles[k]);
        fn(m, m.exports, require);
        return m.exports;
      }
    }
    throw new Error("Cannot find module '" + p + "' in workspace");
  };
}\n`;
    finalSource = virtualBundle + finalSource;
  }

  return {
    source: finalSource,
    files: filesPayload
  };
}
