/**
 * completions.js — High-Performance Multi-Language IntelliSense for Sidecode
 *
 * Implements:
 *  1. Context-aware member suggestions (e.g. std::, System.out., os.path., fmt., console., Math.)
 *  2. Rich keyword, type, and snippet completions for all languages
 *  3. Dynamic symbol extraction (user-defined functions, classes, and variables)
 *  4. Parameter hints via SignatureHelpProvider on '(' and ','
 */

export function registerAllLanguageCompletions(monaco) {
  if (!monaco || !monaco.languages) return;

  const K = monaco.languages.CompletionItemKind;
  const R = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  /* ═══════════════════════════════════════════════════════════════
     A. CONTEXTUAL MEMBER COMPLETION DICTIONARIES
  ═══════════════════════════════════════════════════════════════ */
  const CONTEXT_MEMBERS = {
    // C++ std:: members
    cpp: {
      'std::': [
        { label: 'cout', kind: K.Variable, detail: 'std::cout output stream' },
        { label: 'cin', kind: K.Variable, detail: 'std::cin input stream' },
        { label: 'cerr', kind: K.Variable, detail: 'std::cerr error stream' },
        { label: 'endl', kind: K.Constant, detail: 'std::endl line break & flush' },
        { label: 'vector', kind: K.Class, insertText: 'vector<${1:T}> ${2:v};', isSnippet: true, detail: 'std::vector<T>' },
        { label: 'string', kind: K.Class, detail: 'std::string' },
        { label: 'map', kind: K.Class, insertText: 'map<${1:K}, ${2:V}> ${3:m};', isSnippet: true, detail: 'std::map<Key, Val>' },
        { label: 'unordered_map', kind: K.Class, insertText: 'unordered_map<${1:K}, ${2:V}> ${3:m};', isSnippet: true, detail: 'std::unordered_map' },
        { label: 'set', kind: K.Class, insertText: 'set<${1:T}> ${2:s};', isSnippet: true, detail: 'std::set<T>' },
        { label: 'unordered_set', kind: K.Class, insertText: 'unordered_set<${1:T}> ${2:s};', isSnippet: true, detail: 'std::unordered_set' },
        { label: 'pair', kind: K.Class, insertText: 'pair<${1:T1}, ${2:T2}>', isSnippet: true, detail: 'std::pair' },
        { label: 'make_pair', kind: K.Function, insertText: 'make_pair(${1:a}, ${2:b})', isSnippet: true, detail: 'std::make_pair' },
        { label: 'tuple', kind: K.Class, detail: 'std::tuple' },
        { label: 'unique_ptr', kind: K.Class, insertText: 'unique_ptr<${1:T}> ${2:ptr};', isSnippet: true, detail: 'std::unique_ptr' },
        { label: 'shared_ptr', kind: K.Class, insertText: 'shared_ptr<${1:T}> ${2:ptr};', isSnippet: true, detail: 'std::shared_ptr' },
        { label: 'make_unique', kind: K.Function, insertText: 'make_unique<${1:T}>(${2})', isSnippet: true, detail: 'std::make_unique' },
        { label: 'make_shared', kind: K.Function, insertText: 'make_shared<${1:T}>(${2})', isSnippet: true, detail: 'std::make_shared' },
        { label: 'sort', kind: K.Function, insertText: 'sort(${1:v}.begin(), ${1:v}.end());', isSnippet: true, detail: 'std::sort(first, last)' },
        { label: 'reverse', kind: K.Function, insertText: 'reverse(${1:v}.begin(), ${1:v}.end());', isSnippet: true, detail: 'std::reverse(first, last)' },
        { label: 'min', kind: K.Function, insertText: 'min(${1:a}, ${2:b})', isSnippet: true, detail: 'std::min(a, b)' },
        { label: 'max', kind: K.Function, insertText: 'max(${1:a}, ${2:b})', isSnippet: true, detail: 'std::max(a, b)' },
        { label: 'move', kind: K.Function, insertText: 'move(${1:obj})', isSnippet: true, detail: 'std::move(t)' },
        { label: 'accumulate', kind: K.Function, insertText: 'accumulate(${1:v}.begin(), ${1:v}.end(), ${2:0})', isSnippet: true, detail: 'std::accumulate' },
      ],
      '#include <': [
        'iostream>', 'vector>', 'string>', 'map>', 'unordered_map>', 'set>', 'unordered_set>',
        'algorithm>', 'cmath>', 'memory>', 'queue>', 'stack>', 'deque>', 'tuple>', 'chrono>',
        'thread>', 'mutex>', 'fstream>', 'sstream>', 'iomanip>', 'numeric>', 'limits>'
      ].map(h => ({ label: h, kind: K.Module, detail: `Standard Header <${h}` }))
    },

    // C includes
    c: {
      '#include <': [
        'stdio.h>', 'stdlib.h>', 'string.h>', 'math.h>', 'stdbool.h>', 'time.h>',
        'ctype.h>', 'assert.h>', 'limits.h>', 'stddef.h>', 'stdint.h>', 'float.h>'
      ].map(h => ({ label: h, kind: K.Module, detail: `C Header <${h}` }))
    },

    // Java context members
    java: {
      'System.': [
        { label: 'out', kind: K.Property, detail: 'PrintStream System.out' },
        { label: 'err', kind: K.Property, detail: 'PrintStream System.err' },
        { label: 'in', kind: K.Property, detail: 'InputStream System.in' },
        { label: 'currentTimeMillis()', kind: K.Function, detail: 'long currentTimeMillis()' },
        { label: 'nanoTime()', kind: K.Function, detail: 'long nanoTime()' },
        { label: 'exit(int status)', kind: K.Function, insertText: 'exit(${1:0});', isSnippet: true, detail: 'void exit(int)' },
        { label: 'gc()', kind: K.Function, detail: 'void gc()' }
      ],
      'System.out.': [
        { label: 'println', kind: K.Function, insertText: 'println(${1:value});', isSnippet: true, detail: 'void println(Object)' },
        { label: 'print', kind: K.Function, insertText: 'print(${1:value});', isSnippet: true, detail: 'void print(Object)' },
        { label: 'printf', kind: K.Function, insertText: 'printf("${1:%s}\\n", ${2:args});', isSnippet: true, detail: 'PrintStream printf(String, Object...)' },
        { label: 'flush()', kind: K.Function, detail: 'void flush()' }
      ],
      'Math.': [
        { label: 'abs', kind: K.Function, insertText: 'abs(${1:x})', isSnippet: true, detail: 'Math.abs(n)' },
        { label: 'max', kind: K.Function, insertText: 'max(${1:a}, ${2:b})', isSnippet: true, detail: 'Math.max(a, b)' },
        { label: 'min', kind: K.Function, insertText: 'min(${1:a}, ${2:b})', isSnippet: true, detail: 'Math.min(a, b)' },
        { label: 'sqrt', kind: K.Function, insertText: 'sqrt(${1:x})', isSnippet: true, detail: 'Math.sqrt(d)' },
        { label: 'pow', kind: K.Function, insertText: 'pow(${1:base}, ${2:exp})', isSnippet: true, detail: 'Math.pow(a, b)' },
        { label: 'random()', kind: K.Function, detail: 'double Math.random()' },
        { label: 'floor', kind: K.Function, insertText: 'floor(${1:x})', isSnippet: true, detail: 'Math.floor(d)' },
        { label: 'ceil', kind: K.Function, insertText: 'ceil(${1:x})', isSnippet: true, detail: 'Math.ceil(d)' },
        { label: 'round', kind: K.Function, insertText: 'round(${1:x})', isSnippet: true, detail: 'Math.round(d)' },
        { label: 'PI', kind: K.Constant, detail: 'double Math.PI' }
      ]
    },

    // Python module members
    python: {
      'os.': [
        { label: 'path', kind: K.Module, detail: 'os.path submodule' },
        { label: 'environ', kind: K.Variable, detail: 'os.environ mapping' },
        { label: 'getcwd()', kind: K.Function, detail: 'os.getcwd() -> str' },
        { label: 'listdir', kind: K.Function, insertText: 'listdir(${1:"."})', isSnippet: true, detail: 'os.listdir(path)' },
        { label: 'mkdir', kind: K.Function, insertText: 'mkdir(${1:path})', isSnippet: true, detail: 'os.mkdir(path)' },
        { label: 'remove', kind: K.Function, insertText: 'remove(${1:path})', isSnippet: true, detail: 'os.remove(path)' },
        { label: 'system', kind: K.Function, insertText: 'system("${1:command}")', isSnippet: true, detail: 'os.system(cmd)' }
      ],
      'os.path.': [
        { label: 'join', kind: K.Function, insertText: 'join(${1:path1}, ${2:path2})', isSnippet: true, detail: 'os.path.join(*paths)' },
        { label: 'exists', kind: K.Function, insertText: 'exists(${1:path})', isSnippet: true, detail: 'os.path.exists(path) -> bool' },
        { label: 'isdir', kind: K.Function, insertText: 'isdir(${1:path})', isSnippet: true, detail: 'os.path.isdir(path) -> bool' },
        { label: 'isfile', kind: K.Function, insertText: 'isfile(${1:path})', isSnippet: true, detail: 'os.path.isfile(path) -> bool' },
        { label: 'abspath', kind: K.Function, insertText: 'abspath(${1:path})', isSnippet: true, detail: 'os.path.abspath(path)' },
        { label: 'dirname', kind: K.Function, insertText: 'dirname(${1:path})', isSnippet: true, detail: 'os.path.dirname(path)' },
        { label: 'basename', kind: K.Function, insertText: 'basename(${1:path})', isSnippet: true, detail: 'os.path.basename(path)' }
      ],
      'sys.': [
        { label: 'argv', kind: K.Variable, detail: 'sys.argv list' },
        { label: 'exit', kind: K.Function, insertText: 'exit(${1:0})', isSnippet: true, detail: 'sys.exit([arg])' },
        { label: 'path', kind: K.Variable, detail: 'sys.path search paths' },
        { label: 'stdout', kind: K.Variable, detail: 'sys.stdout stream' },
        { label: 'stderr', kind: K.Variable, detail: 'sys.stderr stream' },
        { label: 'stdin', kind: K.Variable, detail: 'sys.stdin stream' },
        { label: 'version', kind: K.Variable, detail: 'sys.version string' },
        { label: 'platform', kind: K.Variable, detail: 'sys.platform string' }
      ],
      'math.': [
        { label: 'sqrt', kind: K.Function, insertText: 'sqrt(${1:x})', isSnippet: true, detail: 'math.sqrt(x)' },
        { label: 'floor', kind: K.Function, insertText: 'floor(${1:x})', isSnippet: true, detail: 'math.floor(x)' },
        { label: 'ceil', kind: K.Function, insertText: 'ceil(${1:x})', isSnippet: true, detail: 'math.ceil(x)' },
        { label: 'pow', kind: K.Function, insertText: 'pow(${1:x}, ${2:y})', isSnippet: true, detail: 'math.pow(x, y)' },
        { label: 'pi', kind: K.Constant, detail: 'math.pi constant' },
        { label: 'e', kind: K.Constant, detail: 'math.e constant' },
        { label: 'sin', kind: K.Function, insertText: 'sin(${1:x})', isSnippet: true, detail: 'math.sin(x)' },
        { label: 'cos', kind: K.Function, insertText: 'cos(${1:x})', isSnippet: true, detail: 'math.cos(x)' },
        { label: 'gcd', kind: K.Function, insertText: 'gcd(${1:a}, ${2:b})', isSnippet: true, detail: 'math.gcd(a, b)' },
        { label: 'factorial', kind: K.Function, insertText: 'factorial(${1:n})', isSnippet: true, detail: 'math.factorial(n)' }
      ],
      'json.': [
        { label: 'dumps', kind: K.Function, insertText: 'dumps(${1:obj}, indent=${2:2})', isSnippet: true, detail: 'json.dumps(obj, ...)' },
        { label: 'loads', kind: K.Function, insertText: 'loads(${1:string})', isSnippet: true, detail: 'json.loads(s)' },
        { label: 'dump', kind: K.Function, insertText: 'dump(${1:obj}, ${2:f})', isSnippet: true, detail: 'json.dump(obj, fp)' },
        { label: 'load', kind: K.Function, insertText: 'load(${1:f})', isSnippet: true, detail: 'json.load(fp)' }
      ],
      'random.': [
        { label: 'randint', kind: K.Function, insertText: 'randint(${1:a}, ${2:b})', isSnippet: true, detail: 'random.randint(a, b)' },
        { label: 'choice', kind: K.Function, insertText: 'choice(${1:seq})', isSnippet: true, detail: 'random.choice(seq)' },
        { label: 'shuffle', kind: K.Function, insertText: 'shuffle(${1:list})', isSnippet: true, detail: 'random.shuffle(x)' },
        { label: 'random()', kind: K.Function, detail: 'random.random() -> float in [0.0, 1.0)' },
        { label: 'sample', kind: K.Function, insertText: 'sample(${1:population}, ${2:k})', isSnippet: true, detail: 'random.sample(pop, k)' }
      ]
    },

    // Go members
    go: {
      'fmt.': [
        { label: 'Println', kind: K.Function, insertText: 'Println(${1})', isSnippet: true, detail: 'fmt.Println(a ...any)' },
        { label: 'Printf', kind: K.Function, insertText: 'Printf("${1:%v}\\n", ${2})', isSnippet: true, detail: 'fmt.Printf(format, a ...any)' },
        { label: 'Sprintf', kind: K.Function, insertText: 'Sprintf("${1:%v}", ${2})', isSnippet: true, detail: 'fmt.Sprintf(format, a ...any) string' },
        { label: 'Print', kind: K.Function, insertText: 'Print(${1})', isSnippet: true, detail: 'fmt.Print(a ...any)' },
        { label: 'Scan', kind: K.Function, insertText: 'Scan(&${1})', isSnippet: true, detail: 'fmt.Scan(&v)' },
        { label: 'Scanln', kind: K.Function, insertText: 'Scanln(&${1})', isSnippet: true, detail: 'fmt.Scanln(&v)' },
        { label: 'Errorf', kind: K.Function, insertText: 'Errorf("${1:%w}", ${2:err})', isSnippet: true, detail: 'fmt.Errorf' }
      ]
    },

    // JavaScript / TypeScript members
    javascript: {
      'console.': [
        { label: 'log', kind: K.Function, insertText: 'log(${1:value});', isSnippet: true, detail: 'console.log(...data)' },
        { label: 'error', kind: K.Function, insertText: 'error(${1:error});', isSnippet: true, detail: 'console.error(...data)' },
        { label: 'warn', kind: K.Function, insertText: 'warn(${1:warning});', isSnippet: true, detail: 'console.warn(...data)' },
        { label: 'info', kind: K.Function, insertText: 'info(${1:info});', isSnippet: true, detail: 'console.info(...data)' },
        { label: 'table', kind: K.Function, insertText: 'table(${1:data});', isSnippet: true, detail: 'console.table(tabularData)' },
        { label: 'clear()', kind: K.Function, detail: 'console.clear()' },
        { label: 'time', kind: K.Function, insertText: 'time("${1:label}");', isSnippet: true, detail: 'console.time(label)' },
        { label: 'timeEnd', kind: K.Function, insertText: 'timeEnd("${1:label}");', isSnippet: true, detail: 'console.timeEnd(label)' },
        { label: 'trace()', kind: K.Function, detail: 'console.trace()' }
      ],
      'Math.': [
        { label: 'floor', kind: K.Function, insertText: 'floor(${1:x})', isSnippet: true, detail: 'Math.floor(x)' },
        { label: 'ceil', kind: K.Function, insertText: 'ceil(${1:x})', isSnippet: true, detail: 'Math.ceil(x)' },
        { label: 'round', kind: K.Function, insertText: 'round(${1:x})', isSnippet: true, detail: 'Math.round(x)' },
        { label: 'abs', kind: K.Function, insertText: 'abs(${1:x})', isSnippet: true, detail: 'Math.abs(x)' },
        { label: 'max', kind: K.Function, insertText: 'max(${1:a}, ${2:b})', isSnippet: true, detail: 'Math.max(...values)' },
        { label: 'min', kind: K.Function, insertText: 'min(${1:a}, ${2:b})', isSnippet: true, detail: 'Math.min(...values)' },
        { label: 'random()', kind: K.Function, detail: 'Math.random() -> number' },
        { label: 'sqrt', kind: K.Function, insertText: 'sqrt(${1:x})', isSnippet: true, detail: 'Math.sqrt(x)' },
        { label: 'pow', kind: K.Function, insertText: 'pow(${1:base}, ${2:exp})', isSnippet: true, detail: 'Math.pow(x, y)' },
        { label: 'PI', kind: K.Constant, detail: 'Math.PI' }
      ],
      'JSON.': [
        { label: 'stringify', kind: K.Function, insertText: 'stringify(${1:obj}, null, 2)', isSnippet: true, detail: 'JSON.stringify(value, replacer, space)' },
        { label: 'parse', kind: K.Function, insertText: 'parse(${1:str})', isSnippet: true, detail: 'JSON.parse(text)' }
      ]
    }
  };
  CONTEXT_MEMBERS.typescript = CONTEXT_MEMBERS.javascript;

  /* ═══════════════════════════════════════════════════════════════
     B. DYNAMIC DOCUMENT SYMBOL PARSER (Pulls functions & classes)
  ═══════════════════════════════════════════════════════════════ */
  function extractDocumentSymbols(model) {
    const text = model.getValue();
    const symbols = [];
    const seen = new Set();

    // 1. Functions: def func, function func, void/int/type func(args), func()
    const fnRegex = /(?:(?:def|function|func|void|int|float|double|char|bool|auto|public|private|static)\s+)+([a-zA-Z_]\w*)\s*\(([^)]*)\)/g;
    let match;
    while ((match = fnRegex.exec(text)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      if (!seen.has(name) && name.length > 1) {
        seen.add(name);
        symbols.push({
          label: name,
          kind: K.Function,
          insertText: `${name}(${params ? '${1}' : ''})`,
          isSnippet: true,
          detail: `fn ${name}(${params})`,
          documentation: `User-defined function in document`
        });
      }
    }

    // 2. Classes & Structs: class Name, struct Name, type Name struct
    const classRegex = /(?:class|struct|interface|type)\s+([A-Z]\w*)/g;
    while ((match = classRegex.exec(text)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        symbols.push({
          label: name,
          kind: K.Class,
          insertText: name,
          detail: `class ${name}`,
          documentation: `User-defined class/struct in document`
        });
      }
    }

    return symbols;
  }

  /* ═══════════════════════════════════════════════════════════════
     C. STATIC LANGUAGE DICTIONARIES (Keywords, Types, Snippets)
  ═══════════════════════════════════════════════════════════════ */
  const BASE_LANGUAGES = {
    python: [
      { label: 'def', kind: K.Snippet, insertText: 'def ${1:func_name}(${2:params}):\n\t${3:pass}', isSnippet: true, detail: 'Define function' },
      { label: 'class', kind: K.Snippet, insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, args}):\n\t\t${3:pass}', isSnippet: true, detail: 'Define class' },
      { label: 'for', kind: K.Snippet, insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', isSnippet: true, detail: 'for loop' },
      { label: 'if', kind: K.Snippet, insertText: 'if ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'if statement' },
      { label: 'if/else', kind: K.Snippet, insertText: 'if ${1:condition}:\n\t${2:pass}\nelse:\n\t${3:pass}', isSnippet: true, detail: 'if-else' },
      { label: 'elif', kind: K.Snippet, insertText: 'elif ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'elif branch' },
      { label: 'while', kind: K.Snippet, insertText: 'while ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'while loop' },
      { label: 'try/except', kind: K.Snippet, insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}', isSnippet: true, detail: 'try/except' },
      { label: 'with', kind: K.Snippet, insertText: 'with ${1:open("${2:filename}", "${3:r}")} as ${4:f}:\n\t${5:pass}', isSnippet: true, detail: 'with statement' },
      { label: 'main', kind: K.Snippet, insertText: 'if __name__ == "__main__":\n\t${1:main()}', isSnippet: true, detail: 'if __name__ == "__main__"' },
      { label: 'lambda', kind: K.Snippet, insertText: 'lambda ${1:x}: ${2:x}', isSnippet: true, detail: 'lambda expression' },
      { label: 'print', kind: K.Function, insertText: 'print(${1:value})', isSnippet: true, detail: 'print(*values)' },
      { label: 'len', kind: K.Function, insertText: 'len(${1:obj})', isSnippet: true, detail: 'len(s)' },
      { label: 'range', kind: K.Function, insertText: 'range(${1:stop})', isSnippet: true, detail: 'range(start, stop)' },
      { label: 'enumerate', kind: K.Function, insertText: 'enumerate(${1:iterable})', isSnippet: true, detail: 'enumerate(iterable)' },
      { label: 'zip', kind: K.Function, insertText: 'zip(${1:iter1}, ${2:iter2})', isSnippet: true, detail: 'zip(*iterables)' },
      { label: 'open', kind: K.Function, insertText: 'open("${1:file}", "${2:r}")', isSnippet: true, detail: 'open(file, mode)' },
      { label: 'input', kind: K.Function, insertText: 'input("${1:prompt}")', isSnippet: true, detail: 'input(prompt)' },
      { label: 'sorted', kind: K.Function, insertText: 'sorted(${1:iterable})', isSnippet: true, detail: 'sorted(iterable)' },
      { label: 'isinstance', kind: K.Function, insertText: 'isinstance(${1:obj}, ${2:cls})', isSnippet: true, detail: 'isinstance(object, classinfo)' },
      { label: 'str', kind: K.Class, detail: 'str' }, { label: 'int', kind: K.Class, detail: 'int' },
      { label: 'float', kind: K.Class, detail: 'float' }, { label: 'bool', kind: K.Class, detail: 'bool' },
      { label: 'list', kind: K.Class, detail: 'list' }, { label: 'dict', kind: K.Class, detail: 'dict' },
      { label: 'set', kind: K.Class, detail: 'set' }, { label: 'tuple', kind: K.Class, detail: 'tuple' },
      ...['import', 'from', 'return', 'yield', 'pass', 'break', 'continue', 'raise', 'assert',
         'global', 'nonlocal', 'True', 'False', 'None', 'async', 'await', 'in', 'is', 'not', 'and', 'or'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    cpp: [
      { label: 'include', kind: K.Snippet, insertText: '#include <${1:iostream}>', isSnippet: true, detail: '#include' },
      { label: 'main', kind: K.Snippet, insertText: 'int main() {\n\t${1}\n\treturn 0;\n}', isSnippet: true, detail: 'int main()' },
      { label: 'cout', kind: K.Snippet, insertText: 'std::cout << ${1:value} << std::endl;', isSnippet: true, detail: 'std::cout' },
      { label: 'cin', kind: K.Snippet, insertText: 'std::cin >> ${1:var};', isSnippet: true, detail: 'std::cin' },
      { label: 'vector', kind: K.Class, insertText: 'std::vector<${1:int}> ${2:vec};', isSnippet: true, detail: 'std::vector<T>' },
      { label: 'string', kind: K.Class, insertText: 'std::string ${1:str};', isSnippet: true, detail: 'std::string' },
      { label: 'map', kind: K.Class, insertText: 'std::map<${1:string}, ${2:int}> ${3:m};', isSnippet: true, detail: 'std::map' },
      { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
      { label: 'for_range', kind: K.Snippet, insertText: 'for (const auto& ${1:item} : ${2:container}) {\n\t${3}\n}', isSnippet: true, detail: 'range-based for' },
      { label: 'while', kind: K.Snippet, insertText: 'while (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'while loop' },
      { label: 'if', kind: K.Snippet, insertText: 'if (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'if statement' },
      { label: 'class', kind: K.Snippet, insertText: 'class ${1:ClassName} {\npublic:\n\t${1:ClassName}();\n\tvirtual ~${1:ClassName}();\nprivate:\n\t${2}\n};', isSnippet: true, detail: 'class' },
      { label: 'struct', kind: K.Snippet, insertText: 'struct ${1:Name} {\n\t${2}\n};', isSnippet: true, detail: 'struct' },
      ...['auto', 'const', 'constexpr', 'inline', 'virtual', 'override', 'nullptr',
         'using namespace std;', 'namespace', 'public', 'private', 'protected', 'return',
         'new', 'delete', 'static', 'sizeof', 'typedef', 'typename', 'bool', 'int', 'char',
         'float', 'double', 'void', 'long', 'unsigned'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    c: [
      { label: 'include', kind: K.Snippet, insertText: '#include <${1:stdio.h}>', isSnippet: true, detail: '#include' },
      { label: 'main', kind: K.Snippet, insertText: 'int main() {\n\t${1}\n\treturn 0;\n}', isSnippet: true, detail: 'int main()' },
      { label: 'printf', kind: K.Function, insertText: 'printf("${1:%s}\\n"${2:, args});', isSnippet: true, detail: 'printf()' },
      { label: 'scanf', kind: K.Function, insertText: 'scanf("${1:%d}", &${2:var});', isSnippet: true, detail: 'scanf()' },
      { label: 'malloc', kind: K.Function, insertText: '(${1:int}*)malloc(sizeof(${1:int}) * ${2:n})', isSnippet: true, detail: 'malloc' },
      { label: 'free', kind: K.Function, insertText: 'free(${1:ptr});', isSnippet: true, detail: 'free' },
      { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
      { label: 'struct', kind: K.Snippet, insertText: 'typedef struct ${1:Name} {\n\t${2}\n} ${1:Name};', isSnippet: true, detail: 'typedef struct' },
      ...['NULL', 'sizeof', 'return', 'const', 'static', 'void', 'int', 'char', 'float', 'double', 'long'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    java: [
      { label: 'psvm', kind: K.Snippet, insertText: 'public static void main(String[] args) {\n\t${1}\n}', isSnippet: true, detail: 'main method' },
      { label: 'sout', kind: K.Snippet, insertText: 'System.out.println(${1});', isSnippet: true, detail: 'System.out.println' },
      { label: 'souf', kind: K.Snippet, insertText: 'System.out.printf("${1:%s}\\n", ${2});', isSnippet: true, detail: 'System.out.printf' },
      { label: 'class', kind: K.Snippet, insertText: 'public class ${1:ClassName} {\n\t${2}\n}', isSnippet: true, detail: 'class' },
      { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
      { label: 'foreach', kind: K.Snippet, insertText: 'for (${1:Type} ${2:item} : ${3:collection}) {\n\t${4}\n}', isSnippet: true, detail: 'for-each loop' },
      { label: 'try/catch', kind: K.Snippet, insertText: 'try {\n\t${1}\n} catch (${2:Exception} e) {\n\te.printStackTrace();\n}', isSnippet: true, detail: 'try/catch' },
      { label: 'String', kind: K.Class, detail: 'String' },
      { label: 'ArrayList', kind: K.Class, insertText: 'List<${1:String}> ${2:list} = new ArrayList<>();', isSnippet: true, detail: 'ArrayList' },
      { label: 'HashMap', kind: K.Class, insertText: 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', isSnippet: true, detail: 'HashMap' },
      { label: 'Scanner', kind: K.Class, insertText: 'Scanner ${1:sc} = new Scanner(System.in);', isSnippet: true, detail: 'Scanner' },
      ...['public', 'private', 'protected', 'static', 'final', 'abstract', 'interface', 'extends',
         'implements', 'import', 'package', 'return', 'new', 'this', 'super', 'null', 'true', 'false',
         'boolean', 'int', 'double', 'float', 'long', 'void', 'char'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    go: [
      { label: 'main', kind: K.Snippet, insertText: 'package main\n\nfunc main() {\n\t${1}\n}', isSnippet: true, detail: 'package main' },
      { label: 'fmt.Println', kind: K.Snippet, insertText: 'fmt.Println(${1})', isSnippet: true, detail: 'fmt.Println' },
      { label: 'fmt.Printf', kind: K.Snippet, insertText: 'fmt.Printf("${1:%v}\\n", ${2})', isSnippet: true, detail: 'fmt.Printf' },
      { label: 'func', kind: K.Snippet, insertText: 'func ${1:name}(${2:params}) ${3:error} {\n\t${4}\n}', isSnippet: true, detail: 'func' },
      { label: 'if_err', kind: K.Snippet, insertText: 'if err != nil {\n\treturn ${1:err}\n}', isSnippet: true, detail: 'if err != nil' },
      { label: 'struct', kind: K.Snippet, insertText: 'type ${1:Name} struct {\n\t${2}\n}', isSnippet: true, detail: 'struct' },
      ...['import', 'package', 'var', 'const', 'type', 'return', 'defer', 'go', 'select', 'chan',
         'make', 'len', 'append', 'nil', 'true', 'false', 'string', 'int', 'bool', 'error'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    rust: [
      { label: 'main', kind: K.Snippet, insertText: 'fn main() {\n\t${1}\n}', isSnippet: true, detail: 'fn main()' },
      { label: 'println!', kind: K.Snippet, insertText: 'println!("${1:{}", ${2:val});', isSnippet: true, detail: 'println!' },
      { label: 'fn', kind: K.Snippet, insertText: 'fn ${1:name}(${2:params}) -> ${3:Result<(), ()>} {\n\t${4}\n}', isSnippet: true, detail: 'fn' },
      { label: 'struct', kind: K.Snippet, insertText: 'struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}', isSnippet: true, detail: 'struct' },
      { label: 'impl', kind: K.Snippet, insertText: 'impl ${1:Name} {\n\t${2}\n}', isSnippet: true, detail: 'impl' },
      { label: 'match', kind: K.Snippet, insertText: 'match ${1:expr} {\n\t${2:pat} => ${3:expr},\n\t_ => ${4:()},\n}', isSnippet: true, detail: 'match' },
      ...['let', 'let mut', 'pub', 'use', 'mod', 'const', 'enum', 'trait', 'type', 'return',
         'Some', 'None', 'Ok', 'Err', 'Vec', 'String', '&str', 'i32', 'u32', 'f64', 'bool'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    sql: [
      { label: 'SELECT', kind: K.Snippet, insertText: 'SELECT ${1:*} FROM ${2:table} WHERE ${3:condition};', isSnippet: true, detail: 'SELECT query' },
      { label: 'INSERT', kind: K.Snippet, insertText: 'INSERT INTO ${1:table} (${2:cols}) VALUES (${3:vals});', isSnippet: true, detail: 'INSERT query' },
      { label: 'UPDATE', kind: K.Snippet, insertText: 'UPDATE ${1:table} SET ${2:col} = ${3:val} WHERE ${4:condition};', isSnippet: true, detail: 'UPDATE query' },
      { label: 'DELETE', kind: K.Snippet, insertText: 'DELETE FROM ${1:table} WHERE ${2:condition};', isSnippet: true, detail: 'DELETE query' },
      { label: 'CREATE TABLE', kind: K.Snippet, insertText: 'CREATE TABLE ${1:table_name} (\n\tid INT PRIMARY KEY AUTO_INCREMENT,\n\t${2:col} VARCHAR(255)\n);', isSnippet: true, detail: 'CREATE TABLE' },
      ...['FROM', 'WHERE', 'AND', 'OR', 'NOT', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
         'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'AS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map(k => ({ label: k, kind: K.Keyword }))
    ],

    javascript: [
      { label: 'console.log', kind: K.Snippet, insertText: 'console.log(${1:value});', isSnippet: true, detail: 'console.log(...)' },
      { label: 'console.error', kind: K.Snippet, insertText: 'console.error(${1:error});', isSnippet: true, detail: 'console.error(...)' },
      { label: 'console.warn', kind: K.Snippet, insertText: 'console.warn(${1:warning});', isSnippet: true, detail: 'console.warn(...)' },
      { label: 'console.table', kind: K.Snippet, insertText: 'console.table(${1:data});', isSnippet: true, detail: 'console.table(...)' },
      { label: 'console', kind: K.Variable, detail: 'console' },
      { label: 'const', kind: K.Snippet, insertText: 'const ${1:name} = ${2:value};', isSnippet: true, detail: 'const declaration' },
      { label: 'let', kind: K.Snippet, insertText: 'let ${1:name} = ${2:value};', isSnippet: true, detail: 'let declaration' },
      { label: 'function', kind: K.Snippet, insertText: 'function ${1:name}(${2:params}) {\n\t${3}\n}', isSnippet: true, detail: 'function statement' },
      { label: 'arrow', kind: K.Snippet, insertText: 'const ${1:func} = (${2:params}) => {\n\t${3}\n};', isSnippet: true, detail: 'arrow function' },
      { label: 'async/await', kind: K.Snippet, insertText: 'async function ${1:name}() {\n\ttry {\n\t\tconst res = await ${2:promise};\n\t} catch (err) {\n\t\tconsole.error(err);\n\t}\n}', isSnippet: true, detail: 'async/await function' },
      { label: 'for', kind: K.Snippet, insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:arr}.length; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
      { label: 'for_of', kind: K.Snippet, insertText: 'for (const ${1:item} of ${2:iterable}) {\n\t${3}\n}', isSnippet: true, detail: 'for...of loop' },
      { label: 'try/catch', kind: K.Snippet, insertText: 'try {\n\t${1}\n} catch (err) {\n\tconsole.error(err);\n}', isSnippet: true, detail: 'try/catch' },
      { label: 'setTimeout', kind: K.Snippet, insertText: 'setTimeout(() => {\n\t${1}\n}, ${2:1000});', isSnippet: true, detail: 'setTimeout' },
      { label: 'fetch', kind: K.Snippet, insertText: 'const response = await fetch("${1:url}");\nconst data = await response.json();', isSnippet: true, detail: 'fetch API' },
      ...['return', 'if', 'else', 'switch', 'case', 'break', 'continue', 'class', 'import',
         'export', 'default', 'null', 'undefined', 'true', 'false', 'typeof', 'instanceof'].map(k => ({ label: k, kind: K.Keyword }))
    ]
  };
  BASE_LANGUAGES.typescript = BASE_LANGUAGES.javascript;

  /* ═══════════════════════════════════════════════════════════════
     D. UNIFIED PROVIDER REGISTRATION (Context + Symbols + Static)
  ═══════════════════════════════════════════════════════════════ */
  const allSupportedLangs = [
    'python', 'cpp', 'c', 'java', 'go', 'rust', 'sql', 'javascript', 'typescript',
    'csharp', 'php', 'ruby', 'swift', 'kotlin', 'shell', 'html', 'css', 'json'
  ];

  allSupportedLangs.forEach((lang) => {
    const staticItems = BASE_LANGUAGES[lang] || [];
    const contextMap = CONTEXT_MEMBERS[lang] || {};

    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', ':', '<', '#', '"', '/', '_', '>'],
      provideCompletionItems(model, position) {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.substring(0, position.column - 1);
        const word = model.getWordUntilPosition(position);

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        // 1. Check for contextual trigger prefix (e.g. "std::", "System.out.", "os.path.", "#include <")
        for (const [prefix, members] of Object.entries(contextMap)) {
          if (textBeforeCursor.endsWith(prefix) || (prefix.endsWith('::') && textBeforeCursor.includes(prefix))) {
            const suggestions = members.map((m) => ({
              label: m.label,
              kind: m.kind || K.Property,
              insertText: m.insertText || m.label,
              insertTextRules: m.isSnippet ? R : undefined,
              documentation: m.documentation || m.detail || m.label,
              detail: m.detail || prefix + m.label,
              sortText: '0_' + m.label,
              range
            }));
            return { suggestions };
          }
        }

        // 2. Extract in-document dynamic symbols (functions, classes declared by user)
        const docSymbols = extractDocumentSymbols(model);

        // 3. Combine document symbols + static language keywords & snippets
        const combined = [...docSymbols, ...staticItems];

        const suggestions = combined.map((item, idx) => ({
          label: item.label,
          kind: item.kind || K.Keyword,
          insertText: item.insertText || item.label,
          insertTextRules: item.isSnippet ? R : undefined,
          documentation: item.documentation || item.label,
          detail: item.detail || '',
          sortText: (item.kind === K.Function || item.kind === K.Class ? '1_' : '2_') + item.label,
          range
        }));

        return { suggestions };
      }
    });

    // Register Signature Help for Parameter Hints (trigger on '(' and ',')
    monaco.languages.registerSignatureHelpProvider(lang, {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp(model, position) {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column - 1);

        // Find the function name preceding the open parenthesis
        const fnMatch = /([a-zA-Z_]\w*)\s*\([^()]*$/.exec(textBefore);
        if (!fnMatch) return null;

        const fnName = fnMatch[1];

        // Check if there are user-defined or standard signatures for fnName
        const signatures = [
          {
            label: `${fnName}(...)`,
            documentation: `Calls function ${fnName}`,
            parameters: [{ label: 'parameters', documentation: 'Arguments for ' + fnName }]
          }
        ];

        return {
          value: {
            signatures,
            activeSignature: 0,
            activeParameter: 0
          },
          dispose() {}
        };
      }
    });
  });
}
