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
  javascript: '// JavaScript\nconsole.log("Hello, World!");\n',
  typescript: '// TypeScript\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("World"));\n',
  html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n',
  css: '/* Styles */\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #1e1e1e;\n  color: #fff;\n}\n',
  python: '# Python\nprint("Hello, World!")\n',
  json: '{\n  "name": "sidecode",\n  "version": "1.0.0"\n}\n',
  sql: '-- SQL Query\nSELECT *\nFROM users\nWHERE active = 1;\n',
  shell: '#!/bin/bash\necho "Hello, World!"\n',
  markdown: '# Sidecode\n\nA lightweight Monaco-powered code editor in your sidebar.\n\n- Multi-tab\n- Persistent storage\n- JS/TS runner\n',
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
