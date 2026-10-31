/**
 * multifileCompiler.js — Multi-file compilation packager for Sidecode
 *
 * Implements active-file compilation by default while properly supporting
 * explicit multi-file projects:
 * 1. Default behaviour: Compiles only the active file as a single compilation unit.
 * 2. Unrelated .c / .cpp files in the workspace are NOT concatenated or linked by default.
 *    Multiple independent programs (e.g. fn.c, function.c, pointers.c) coexist cleanly.
 * 3. Headers (.h, .hpp, .hh, etc.) are provided in the companion files payload so
 *    #include "header.h" works seamlessly, but headers are NEVER compiled as source units.
 * 4. Explicit multi-file support: When requested via build config (sidecode.json / build.json)
 *    or file directives (e.g. // @sources: helper.c), companion translation units are passed
 *    as independent compilation units and linked together, WITHOUT virtual #include hacks.
 * 5. Unique executable naming: Computes unique output executable names based on source filename.
 */

import { collectAllWorkspaceFiles, isWorkspaceOpen } from './workspace.js';

export const HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx', '.inl', '.ipp']);
export const C_SOURCE_EXTENSIONS = new Set(['.c']);
export const CPP_SOURCE_EXTENSIONS = new Set(['.cpp', '.cc', '.cxx', '.c++', '.C']);

/**
 * Check if a filename represents a C/C++ header file
 */
export function isHeaderFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return HEADER_EXTENSIONS.has(ext);
}

/**
 * Check if a filename represents a C source file
 */
export function isCSourceFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return C_SOURCE_EXTENSIONS.has(ext);
}

/**
 * Check if a filename represents a C++ (or C) source file
 */
export function isCppSourceFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return CPP_SOURCE_EXTENSIONS.has(ext) || C_SOURCE_EXTENSIONS.has(ext);
}

/**
 * Returns a unique executable output name and run command for a source file.
 * Prevents multiple independent programs from overwriting or clashing over generic a.exe / a.out.
 * e.g. "fn.c" -> { baseName: "fn", outBinary: "fn.exe", runCmd: '"fn.exe"' } on Windows
 *             -> { baseName: "fn", outBinary: "fn.out", runCmd: './"fn.out"' } on Unix
 */
export function getExecutableName(sourceFilename, isWin = (typeof process !== 'undefined' && process.platform === 'win32')) {
  const cleanName = String(sourceFilename || 'main').replace(/^.*[\\/]/, '');
  const baseName = cleanName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-\.]/g, '_') || 'app';
  const outBinary = isWin ? `${baseName}.exe` : `${baseName}.out`;
  const runCmd = isWin ? `"${outBinary}"` : `./"${outBinary}"`;
  return { baseName, outBinary, runCmd };
}

/**
 * Detect explicit compilation companion files specified in source comments.
 * e.g. // @sources: helper.c, utils.c
 *      // @build: helper.c
 *      // @link: helper.c
 *      // @compile: helper.c
 *      /* @sources: helper.c * /
 */
export function parseCommentDirectives(sourceCode) {
  if (!sourceCode || typeof sourceCode !== 'string') return [];
  const found = [];
  const regex = /(?:\/\/|\/\*)\s*@(?:sources|build|link|compile|files)[:=\s]+([^\r\n*]+)/gi;
  let match;
  while ((match = regex.exec(sourceCode)) !== null) {
    const rawList = match[1].replace(/\*\//g, '').trim();
    const parts = rawList.split(/[,\s]+/).map(p => p.trim()).filter(Boolean);
    found.push(...parts);
  }
  return found;
}

/**
 * Check if workspace has a sidecode.json or build.json configuration file
 */
export function parseWorkspaceBuildConfig(allFiles, language = 'c') {
  if (!Array.isArray(allFiles)) return null;
  const configFile = allFiles.find(f => {
    const name = String(f.filename || f.path || '').replace(/^.*[\\/]/, '').toLowerCase();
    return name === 'sidecode.json' || name === 'build.json';
  });

  if (!configFile || !configFile.contents) return null;

  try {
    const config = JSON.parse(configFile.contents);
    const langKey = language === 'cpp' ? 'cpp' : (language === 'c' ? 'c' : language);
    let sources = [];

    if (Array.isArray(config.sources)) {
      sources.push(...config.sources);
    }
    if (config[langKey] && Array.isArray(config[langKey].sources)) {
      sources.push(...config[langKey].sources);
    }
    if (typeof config.build === 'string') {
      // Parse source files from build command, e.g. "gcc main.c helper.c -o prog"
      const tokens = config.build.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        if (!tok.startsWith('-') && (tok.endsWith('.c') || tok.endsWith('.cpp') || tok.endsWith('.cc'))) {
          sources.push(tok);
        }
      }
    }

    return {
      sources: [...new Set(sources)],
      output: config.output || (config[langKey] && config[langKey].output) || null,
      args: config.args || (config[langKey] && config[langKey].args) || ''
    };
  } catch (err) {
    console.warn('Failed to parse workspace build config JSON:', err);
    return null;
  }
}

/**
 * Detect explicit companion sources requested for compilation.
 * Note: Header files (.h, .hpp) are NEVER compiled as translation units.
 */
export function detectExplicitSources(mainCode, language, mainFilename, allFiles = []) {
  if (language !== 'c' && language !== 'cpp') {
    return { companionSources: [], compilerArgs: '', configFound: false };
  }

  const explicitSet = new Set();
  let extraArgs = '';
  let configFound = false;

  // 1. Check comment directives in active source code
  const directives = parseCommentDirectives(mainCode);
  for (const item of directives) {
    explicitSet.add(item);
    configFound = true;
  }

  // 2. Check workspace build config
  const buildConfig = parseWorkspaceBuildConfig(allFiles, language);
  if (buildConfig) {
    configFound = true;
    for (const src of buildConfig.sources) {
      explicitSet.add(src);
    }
    if (buildConfig.args) {
      extraArgs = buildConfig.args;
    }
  }

  // Filter out:
  // - Headers (.h, .hpp, etc.) - NEVER compiled as independent compilation units!
  // - The main active file itself (already primary source)
  // - Non-C/C++ files
  const cleanMainName = String(mainFilename || '').replace(/^.*[\\/]/, '').toLowerCase();
  const validCompanionSources = [];

  for (const item of explicitSet) {
    const cleanItem = String(item).replace(/^.*[\\/]/, '');
    const cleanLower = cleanItem.toLowerCase();

    // Skip main file
    if (cleanLower === cleanMainName) continue;

    // Skip headers!
    if (isHeaderFile(cleanItem)) continue;

    // Must be valid C/C++ source file
    if (!isCppSourceFile(cleanItem)) continue;

    validCompanionSources.push(cleanItem);
  }

  // Build compilerArgs string for Godbolt/local compiler
  const sourceArgs = validCompanionSources.map(s => (s.includes(' ') ? `"${s}"` : s)).join(' ');
  const compilerArgs = [sourceArgs, extraArgs].filter(Boolean).join(' ').trim();

  return {
    companionSources: validCompanionSources,
    compilerArgs,
    configFound
  };
}

/**
 * Build multi-file compilation payload for Godbolt and local runners.
 * Active-file compilation is the default:
 * - Active file source code is preserved without string modifications or virtual #include.
 * - Unrelated workspace .c / .cpp files are NOT compiled into the active unit.
 * - Companion headers are provided in files payload for #include resolution.
 * - Explicit companion files (via build config or directive) are passed as separate translation units.
 *
 * @param {string} mainCode - The code of the active editor tab
 * @param {string} mainLanguage - Language of the active file
 * @param {string} mainFilename - Filename of the active file (e.g. "fn.c")
 * @param {Array} [filesOverride] - Optional override array of workspace files (e.g. for testing)
 * @returns {Promise<{ source: string, files: Array<{ filename: string, contents: string }>, compilerArgs: string, companionSources: string[] }>}
 */
export async function prepareMultiFilePayload(mainCode, mainLanguage, mainFilename = 'main.cpp', filesOverride = null) {
  let allFiles = [];
  if (filesOverride && Array.isArray(filesOverride)) {
    allFiles = filesOverride;
  } else if (isWorkspaceOpen()) {
    allFiles = await collectAllWorkspaceFiles();
  }

  if (allFiles.length === 0) {
    return { source: mainCode, files: [], compilerArgs: '', companionSources: [] };
  }

  const cleanMain = String(mainFilename || '').replace(/^.*[\\/]/, '').toLowerCase();
  const filesPayload = [];

  for (const item of allFiles) {
    const itemFilename = String(item.filename || item.path || '').replace(/^.*[\\/]/, '');
    const itemPath = String(item.path || item.filename || '');

    // Skip the primary active file itself from companion files
    if (itemFilename.toLowerCase() === cleanMain || itemPath.toLowerCase() === String(mainFilename).toLowerCase()) {
      continue;
    }

    filesPayload.push({
      path: item.path || item.filename,
      filename: itemFilename,
      contents: item.contents || ''
    });
  }

  let finalSource = mainCode;
  let compilerArgs = '';
  let companionSources = [];

  // For C/C++:
  if (mainLanguage === 'cpp' || mainLanguage === 'c') {
    // Preserve original source code! NEVER append #include "other.c"
    finalSource = mainCode;

    // Check if explicit multi-file compilation is configured
    const explicit = detectExplicitSources(mainCode, mainLanguage, mainFilename, allFiles);
    compilerArgs = explicit.compilerArgs;
    companionSources = explicit.companionSources;
  }

  // For JavaScript / TypeScript projects: Virtual CommonJS bundle
  const isJs = mainLanguage === 'javascript' || mainLanguage === 'js' || mainLanguage === 'typescript' || mainLanguage === 'ts';
  if (isJs && filesPayload.length > 0) {
    const filesObj = {};
    for (const f of filesPayload) {
      if (f.path) filesObj[f.path.replace(/\\/g, '/')] = f.contents;
      filesObj[f.filename] = f.contents;
    }
    const cleanMainPath = String(mainFilename || '').replace(/\\/g, '/');
    const mainDir = cleanMainPath.includes('/') ? cleanMainPath.substring(0, cleanMainPath.lastIndexOf('/')) : '';

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
    files: filesPayload,
    compilerArgs,
    companionSources
  };
}
