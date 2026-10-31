import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareMultiFilePayload,
  detectExplicitSources,
  getExecutableName,
  isHeaderFile,
  isCSourceFile,
  isCppSourceFile,
  parseCommentDirectives,
  parseWorkspaceBuildConfig
} from '../sidepanel/modules/multifileCompiler.js';

test('1. Multiple independent C files with main() - Active file compilation (Duplicate main bug fix)', async () => {
  const fnCode = '#include <stdio.h>\nint main() { printf("fn.c main\\n"); return 0; }';
  const functionCode = '#include <stdio.h>\nint main() { printf("function.c main\\n"); return 0; }';
  const pointersCode = '#include <stdio.h>\nint main() { printf("pointers.c main\\n"); return 0; }';

  const workspaceFiles = [
    { path: 'fn.c', filename: 'fn.c', contents: fnCode },
    { path: 'function.c', filename: 'function.c', contents: functionCode },
    { path: 'pointers.c', filename: 'pointers.c', contents: pointersCode }
  ];

  // Prepare payload when fn.c is active
  const payload = await prepareMultiFilePayload(fnCode, 'c', 'fn.c', workspaceFiles);

  // 1. Source MUST be the exact original code of fn.c - NO virtual #include appended!
  assert.equal(payload.source, fnCode, 'Source code of active file must remain unmodified without injected #includes');
  assert.ok(!payload.source.includes('#include "function.c"'), 'Must not concatenate function.c');
  assert.ok(!payload.source.includes('#include "pointers.c"'), 'Must not concatenate pointers.c');

  // 2. Compiler args must be empty (fn.c compiles as a single independent translation unit)
  assert.equal(payload.compilerArgs, '', 'Default compilerArgs must be empty for independent programs');
  assert.deepEqual(payload.companionSources, [], 'No companion sources should be auto-linked');

  // 3. Companion files should contain function.c and pointers.c, but NOT fn.c
  assert.equal(payload.files.length, 2);
  assert.ok(payload.files.some(f => f.filename === 'function.c'));
  assert.ok(payload.files.some(f => f.filename === 'pointers.c'));
  assert.ok(!payload.files.some(f => f.filename === 'fn.c'));
});

test('2. Switching active file from fn.c to function.c compiles function.c independently', async () => {
  const fnCode = '#include <stdio.h>\nint main() { printf("fn.c\\n"); return 0; }';
  const functionCode = '#include <stdio.h>\nint main() { printf("function.c\\n"); return 0; }';

  const workspaceFiles = [
    { path: 'fn.c', filename: 'fn.c', contents: fnCode },
    { path: 'function.c', filename: 'function.c', contents: functionCode }
  ];

  const payload = await prepareMultiFilePayload(functionCode, 'c', 'function.c', workspaceFiles);

  assert.equal(payload.source, functionCode);
  assert.ok(!payload.source.includes('#include "fn.c"'));
  assert.equal(payload.compilerArgs, '');
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].filename, 'fn.c');
});

test('3. C program with companion header file (.h) - Headers never compiled as translation units', async () => {
  const mainCode = '#include <stdio.h>\n#include "helper.h"\nint main() { printf("%s\\n", GREETING); return 0; }';
  const headerCode = '#ifndef HELPER_H\n#define HELPER_H\n#define GREETING "Hello World"\n#endif';

  const workspaceFiles = [
    { path: 'main.c', filename: 'main.c', contents: mainCode },
    { path: 'helper.h', filename: 'helper.h', contents: headerCode }
  ];

  const payload = await prepareMultiFilePayload(mainCode, 'c', 'main.c', workspaceFiles);

  // Header must be in files payload so GCC finds it
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].filename, 'helper.h');
  assert.equal(payload.files[0].contents, headerCode);

  // Header must NOT be in compilerArgs or companionSources
  assert.equal(payload.compilerArgs, '');
  assert.deepEqual(payload.companionSources, []);
  assert.ok(isHeaderFile('helper.h'));
  assert.ok(isHeaderFile('utils.hpp'));
  assert.ok(!isHeaderFile('main.c'));
});

test('4. Legitimate multi-file C project via comment directive // @sources', async () => {
  const mainCode = '// @sources: helper.c, utils.c\n#include <stdio.h>\nint get_answer(void);\nint get_multiplier(void);\nint main() { printf("%d\\n", get_answer() * get_multiplier()); return 0; }';
  const helperCode = 'int get_answer(void) { return 21; }';
  const utilsCode = 'int get_multiplier(void) { return 2; }';

  const workspaceFiles = [
    { path: 'main.c', filename: 'main.c', contents: mainCode },
    { path: 'helper.c', filename: 'helper.c', contents: helperCode },
    { path: 'utils.c', filename: 'utils.c', contents: utilsCode }
  ];

  const payload = await prepareMultiFilePayload(mainCode, 'c', 'main.c', workspaceFiles);

  // Source code is preserved intact (no #include "helper.c" or #include "utils.c")
  assert.equal(payload.source, mainCode);
  assert.ok(!payload.source.includes('#include "helper.c"'));
  assert.ok(!payload.source.includes('#include "utils.c"'));

  // helper.c and utils.c are passed as separate translation units via compilerArgs
  assert.equal(payload.compilerArgs, 'helper.c utils.c');
  assert.deepEqual(payload.companionSources, ['helper.c', 'utils.c']);
});

test('5. Legitimate multi-file C project via sidecode.json build config', async () => {
  const mainCode = '#include <stdio.h>\nint compute(void);\nint main() { return compute(); }';
  const helperCode = 'int compute(void) { return 100; }';
  const headerCode = '#pragma once\nint compute(void);';
  const configCode = JSON.stringify({
    sources: ['helper.c', 'header.h'],
    args: '-Wall -O2'
  });

  const workspaceFiles = [
    { path: 'main.c', filename: 'main.c', contents: mainCode },
    { path: 'helper.c', filename: 'helper.c', contents: helperCode },
    { path: 'header.h', filename: 'header.h', contents: headerCode },
    { path: 'sidecode.json', filename: 'sidecode.json', contents: configCode }
  ];

  const payload = await prepareMultiFilePayload(mainCode, 'c', 'main.c', workspaceFiles);

  // helper.c must be included in companionSources, but header.h MUST be filtered out!
  assert.deepEqual(payload.companionSources, ['helper.c']);
  assert.ok(payload.compilerArgs.includes('helper.c'));
  assert.ok(payload.compilerArgs.includes('-Wall -O2'));
  assert.ok(!payload.compilerArgs.includes('header.h'), 'Header files must never be passed to compilerArgs');
});

test('6. Multiple independent C++ source files (.cpp)', async () => {
  const mainCpp = '#include <iostream>\nint main() { std::cout << "Main App\\n"; return 0; }';
  const testCpp = '#include <iostream>\nint main() { std::cout << "Test App\\n"; return 0; }';

  const workspaceFiles = [
    { path: 'app.cpp', filename: 'app.cpp', contents: mainCpp },
    { path: 'test.cpp', filename: 'test.cpp', contents: testCpp }
  ];

  const payload = await prepareMultiFilePayload(mainCpp, 'cpp', 'app.cpp', workspaceFiles);

  assert.equal(payload.source, mainCpp);
  assert.ok(!payload.source.includes('#include "test.cpp"'));
  assert.equal(payload.compilerArgs, '');
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].filename, 'test.cpp');
});

test('7. Unique executable output naming prevents binary collisions', () => {
  // Windows platform
  const winFn = getExecutableName('fn.c', true);
  assert.equal(winFn.baseName, 'fn');
  assert.equal(winFn.outBinary, 'fn.exe');
  assert.equal(winFn.runCmd, '"fn.exe"');

  const winFunction = getExecutableName('function.c', true);
  assert.equal(winFunction.baseName, 'function');
  assert.equal(winFunction.outBinary, 'function.exe');
  assert.equal(winFunction.runCmd, '"function.exe"');

  // Verify fn.exe != function.exe != a.exe
  assert.notEqual(winFn.outBinary, winFunction.outBinary);
  assert.notEqual(winFn.outBinary, 'a.exe');

  // Unix/Linux platform
  const unixFn = getExecutableName('fn.c', false);
  assert.equal(unixFn.baseName, 'fn');
  assert.equal(unixFn.outBinary, 'fn.out');
  assert.equal(unixFn.runCmd, './"fn.out"');

  // File paths with directories
  const subPath = getExecutableName('src/dsa/trees.cpp', true);
  assert.equal(subPath.baseName, 'trees');
  assert.equal(subPath.outBinary, 'trees.exe');
});

test('8. Regression check: JavaScript CommonJS bundling still supported', async () => {
  const mainJs = 'const { add } = require("./math"); console.log(add(2, 3));';
  const mathJs = 'exports.add = (a, b) => a + b;';

  const workspaceFiles = [
    { path: 'index.js', filename: 'index.js', contents: mainJs },
    { path: 'math.js', filename: 'math.js', contents: mathJs }
  ];

  const payload = await prepareMultiFilePayload(mainJs, 'javascript', 'index.js', workspaceFiles);

  assert.ok(payload.source.includes('/* Sidecode Virtual CommonJS Bundle */'));
  assert.ok(payload.source.includes('const { add } = require("./math");'));
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].filename, 'math.js');
});

test('9. Live Godbolt compilation verification with independent C files', async () => {
  const fnCode = '#include <stdio.h>\nint main() { printf("fn.c executed successfully\\n"); return 0; }';
  const functionCode = '#include <stdio.h>\nint main() { printf("function.c should not run\\n"); return 0; }';
  const pointersCode = '#include <stdio.h>\nint main() { printf("pointers.c should not run\\n"); return 0; }';

  const workspaceFiles = [
    { path: 'fn.c', filename: 'fn.c', contents: fnCode },
    { path: 'function.c', filename: 'function.c', contents: functionCode },
    { path: 'pointers.c', filename: 'pointers.c', contents: pointersCode }
  ];

  const multi = await prepareMultiFilePayload(fnCode, 'c', 'fn.c', workspaceFiles);

  const payload = {
    source: multi.source,
    compiler: 'g141',
    options: {
      userArguments: multi.compilerArgs || '',
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
      executeParameters: { args: [], stdin: '' }
    },
    files: multi.files,
    lang: 'c'
  };

  const res = await fetch('https://godbolt.org/api/compiler/g141/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.code, 0, 'Exit code should be 0');

  // Verify stdout is from fn.c
  const stdoutText = (data.stdout || []).map(l => l.text).join('\n');
  assert.ok(stdoutText.includes('fn.c executed successfully'));
  assert.ok(!stdoutText.includes('function.c'));
  assert.ok(!stdoutText.includes('pointers.c'));

  // Verify no stderr duplicate main error
  const stderrText = (data.buildResult?.stderr || []).map(l => l.text || l).join('\n');
  assert.ok(!stderrText.includes("redefinition of 'int main()'"));
});

test('10. Live Godbolt compilation: Explicit multi-file linking with helper function', async () => {
  const mainCode = '// @sources: helper.c\n#include <stdio.h>\nint get_multiplier(void);\nint main() { printf("Result: %d\\n", get_multiplier() * 10); return 0; }';
  const helperCode = 'int get_multiplier(void) { return 7; }';

  const workspaceFiles = [
    { path: 'main.c', filename: 'main.c', contents: mainCode },
    { path: 'helper.c', filename: 'helper.c', contents: helperCode }
  ];

  const multi = await prepareMultiFilePayload(mainCode, 'c', 'main.c', workspaceFiles);

  const payload = {
    source: multi.source,
    compiler: 'g141',
    options: {
      userArguments: multi.compilerArgs,
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
      executeParameters: { args: [], stdin: '' }
    },
    files: multi.files,
    lang: 'c'
  };

  const res = await fetch('https://godbolt.org/api/compiler/g141/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.code, 0);

  const stdoutText = (data.stdout || []).map(l => l.text).join('\n');
  assert.ok(stdoutText.includes('Result: 70'));
});

test('11. Live Godbolt compilation: C++ multi-file with separate header and implementation', async () => {
  const mainCpp = '#include <iostream>\n#include "calc.h"\nint main() { std::cout << "Calc: " << Calc::add(15, 25) << std::endl; return 0; }';
  const calcH = '#pragma once\nclass Calc { public: static int add(int a, int b); };';
  const calcCpp = '#include "calc.h"\nint Calc::add(int a, int b) { return a + b; }';

  const workspaceFiles = [
    { path: 'main.cpp', filename: 'main.cpp', contents: mainCpp },
    { path: 'calc.h', filename: 'calc.h', contents: calcH },
    { path: 'calc.cpp', filename: 'calc.cpp', contents: calcCpp },
    { path: 'sidecode.json', filename: 'sidecode.json', contents: JSON.stringify({ sources: ['calc.cpp', 'calc.h'] }) }
  ];

  const multi = await prepareMultiFilePayload(mainCpp, 'cpp', 'main.cpp', workspaceFiles);

  // calc.h must NOT be in compilerArgs, but calc.cpp must be
  assert.ok(multi.compilerArgs.includes('calc.cpp'));
  assert.ok(!multi.compilerArgs.includes('calc.h'));

  const payload = {
    source: multi.source,
    compiler: 'g141',
    options: {
      userArguments: multi.compilerArgs,
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
      executeParameters: { args: [], stdin: '' }
    },
    files: multi.files,
    lang: 'c++'
  };

  const res = await fetch('https://godbolt.org/api/compiler/g141/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.code, 0);

  const stdoutText = (data.stdout || []).map(l => l.text).join('\n');
  assert.ok(stdoutText.includes('Calc: 40'));
});
