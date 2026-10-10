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
  javascript: '',
  typescript: '',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n',
  python: 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
  html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n',
  css: '/* Styles */\nbody {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n',
  json: '{\n  \n}\n',
  sql: '',
  shell: '#!/bin/bash\n\n',
  markdown: '',
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
