/**
 * constants.js — Shared constants and language configurations for Sidecode
 */

export const RUNNABLE_LANGUAGES = new Set(['javascript', 'typescript']);

export const LANG_BADGE = {
  plaintext: 'TXT',
  javascript: 'JS',
  typescript: 'TS',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  python: 'PY',
  java: 'JAVA',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  go: 'GO',
  rust: 'RS',
  php: 'PHP',
  ruby: 'RB',
  swift: 'SW',
  kotlin: 'KT',
  sql: 'SQL',
  shell: 'SH',
  yaml: 'YML',
  markdown: 'MD',
  xml: 'XML',
};

export const DEFAULT_TEMPLATES = {
  // Scripting / Top-level languages: NO boilerplate (runs directly top-level)
  javascript: '',
  typescript: '',
  python: '',
  ruby: '',
  swift: '',
  sql: '',
  markdown: '',
  plaintext: '',

  // Compiled / Strictly structured languages: Mandatory scaffolding only (no print statements)
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n',
  csharp: 'using System;\n\nclass Program {\n    static void Main(string[] args) {\n        \n    }\n}\n',
  go: 'package main\n\nfunc main() {\n    \n}\n',
  rust: 'fn main() {\n    \n}\n',
  kotlin: 'fun main() {\n    \n}\n',

  // Markup & Config
  html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n',
  css: '',
  json: '{\n  \n}\n',
  shell: '#!/bin/bash\n\n',
  yaml: '',
  xml: '',
};

export function getDefaultContent(lang) {
  return DEFAULT_TEMPLATES[lang] || '';
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
