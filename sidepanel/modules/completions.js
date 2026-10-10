/**
 * completions.js — Multi-Language IntelliSense and Snippets for Sidecode
 *
 * Provides keywords, standard library APIs, types, and rich snippets
 * for Python, C, C++, Java, Go, Rust, SQL, JavaScript, TypeScript, and more.
 */

export function registerAllLanguageCompletions(monaco) {
  if (!monaco || !monaco.languages) return;

  const K = monaco.languages.CompletionItemKind;
  const R = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  function register(lang, items, triggerChars = ['.', '_', ':', '#', '<']) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: triggerChars,
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const suggestions = items.map((item) => {
          const entry = {
            label: item.label,
            kind: item.kind || K.Keyword,
            insertText: item.insertText || item.label,
            documentation: item.documentation || item.label,
            detail: item.detail || '',
            range
          };
          if (item.isSnippet) {
            entry.insertTextRules = R;
          }
          return entry;
        });

        return { suggestions };
      }
    });
  }

  /* ─────────────────────────────────────────────
     1. PYTHON
  ───────────────────────────────────────────── */
  const pythonItems = [
    // Snippets
    { label: 'def', kind: K.Snippet, insertText: 'def ${1:func_name}(${2:params}):\n\t${3:pass}', isSnippet: true, detail: 'Define function' },
    { label: 'class', kind: K.Snippet, insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, args}):\n\t\t${3:pass}', isSnippet: true, detail: 'Define class' },
    { label: 'for', kind: K.Snippet, insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', isSnippet: true, detail: 'For loop' },
    { label: 'if', kind: K.Snippet, insertText: 'if ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'If statement' },
    { label: 'if/else', kind: K.Snippet, insertText: 'if ${1:condition}:\n\t${2:pass}\nelse:\n\t${3:pass}', isSnippet: true, detail: 'If-else' },
    { label: 'elif', kind: K.Snippet, insertText: 'elif ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'Elif branch' },
    { label: 'while', kind: K.Snippet, insertText: 'while ${1:condition}:\n\t${2:pass}', isSnippet: true, detail: 'While loop' },
    { label: 'try/except', kind: K.Snippet, insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}', isSnippet: true, detail: 'Try-except block' },
    { label: 'with', kind: K.Snippet, insertText: 'with ${1:open("${2:filename}", "${3:r}")} as ${4:f}:\n\t${5:pass}', isSnippet: true, detail: 'With context manager' },
    { label: 'main', kind: K.Snippet, insertText: 'if __name__ == "__main__":\n\t${1:main()}', isSnippet: true, detail: 'if __name__ == "__main__"' },
    { label: 'lambda', kind: K.Snippet, insertText: 'lambda ${1:x}: ${2:x}', isSnippet: true, detail: 'Lambda expression' },
    { label: 'list_comp', kind: K.Snippet, insertText: '[${1:x} for ${1:x} in ${2:iterable} if ${3:condition}]', isSnippet: true, detail: 'List comprehension' },

    // Builtin functions
    { label: 'print', kind: K.Function, insertText: 'print(${1:value})', isSnippet: true, detail: 'print(*values)' },
    { label: 'len', kind: K.Function, insertText: 'len(${1:obj})', isSnippet: true, detail: 'len(s) -> int' },
    { label: 'range', kind: K.Function, insertText: 'range(${1:stop})', isSnippet: true, detail: 'range(start, stop[, step])' },
    { label: 'enumerate', kind: K.Function, insertText: 'enumerate(${1:iterable})', isSnippet: true, detail: 'enumerate(iterable)' },
    { label: 'zip', kind: K.Function, insertText: 'zip(${1:iter1}, ${2:iter2})', isSnippet: true, detail: 'zip(*iterables)' },
    { label: 'open', kind: K.Function, insertText: 'open("${1:file}", "${2:r}")', isSnippet: true, detail: 'open(file, mode)' },
    { label: 'input', kind: K.Function, insertText: 'input("${1:prompt}")', isSnippet: true, detail: 'input(prompt)' },
    { label: 'isinstance', kind: K.Function, insertText: 'isinstance(${1:obj}, ${2:class_or_tuple})', isSnippet: true, detail: 'isinstance(object, classinfo)' },
    { label: 'sorted', kind: K.Function, insertText: 'sorted(${1:iterable})', isSnippet: true, detail: 'sorted(iterable)' },
    { label: 'map', kind: K.Function, insertText: 'map(${1:func}, ${2:iterable})', isSnippet: true, detail: 'map(function, iterable)' },
    { label: 'filter', kind: K.Function, insertText: 'filter(${1:func}, ${2:iterable})', isSnippet: true, detail: 'filter(function, iterable)' },

    // Types
    { label: 'str', kind: K.Class, detail: 'str class' },
    { label: 'int', kind: K.Class, detail: 'int class' },
    { label: 'float', kind: K.Class, detail: 'float class' },
    { label: 'bool', kind: K.Class, detail: 'bool class' },
    { label: 'list', kind: K.Class, detail: 'list class' },
    { label: 'dict', kind: K.Class, detail: 'dict class' },
    { label: 'set', kind: K.Class, detail: 'set class' },
    { label: 'tuple', kind: K.Class, detail: 'tuple class' },

    // Keywords
    ...['import', 'from', 'return', 'yield', 'pass', 'break', 'continue', 'raise', 'assert',
       'global', 'nonlocal', 'True', 'False', 'None', 'async', 'await', 'in', 'is', 'not', 'and', 'or'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('python', pythonItems);

  /* ─────────────────────────────────────────────
     2. C++
  ───────────────────────────────────────────── */
  const cppItems = [
    // Common includes & main
    { label: 'include', kind: K.Snippet, insertText: '#include <${1:iostream}>', isSnippet: true, detail: '#include <header>' },
    { label: 'main', kind: K.Snippet, insertText: 'int main() {\n\t${1}\n\treturn 0;\n}', isSnippet: true, detail: 'main() function' },
    { label: 'main_args', kind: K.Snippet, insertText: 'int main(int argc, char* argv[]) {\n\t${1}\n\treturn 0;\n}', isSnippet: true, detail: 'main with args' },

    // I/O & Streams
    { label: 'cout', kind: K.Snippet, insertText: 'std::cout << ${1:value} << std::endl;', isSnippet: true, detail: 'std::cout output' },
    { label: 'cin', kind: K.Snippet, insertText: 'std::cin >> ${1:variable};', isSnippet: true, detail: 'std::cin input' },
    { label: 'endl', kind: K.Constant, insertText: 'std::endl', detail: 'std::endl' },

    // Control flow snippets
    { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${3}\n}', isSnippet: true, detail: 'for index loop' },
    { label: 'for_range', kind: K.Snippet, insertText: 'for (const auto& ${1:item} : ${2:container}) {\n\t${3}\n}', isSnippet: true, detail: 'range-based for' },
    { label: 'while', kind: K.Snippet, insertText: 'while (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'while loop' },
    { label: 'if', kind: K.Snippet, insertText: 'if (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'if statement' },
    { label: 'switch', kind: K.Snippet, insertText: 'switch (${1:expr}) {\n\tcase ${2:val}:\n\t\t${3}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', isSnippet: true, detail: 'switch statement' },
    { label: 'try/catch', kind: K.Snippet, insertText: 'try {\n\t${1}\n} catch (const std::exception& ${2:e}) {\n\tstd::cerr << ${2:e}.what() << std::endl;\n}', isSnippet: true, detail: 'try/catch' },

    // OOP & Templates
    { label: 'class', kind: K.Snippet, insertText: 'class ${1:ClassName} {\npublic:\n\t${1:ClassName}();\n\tvirtual ~${1:ClassName}();\nprivate:\n\t${2}\n};', isSnippet: true, detail: 'class definition' },
    { label: 'struct', kind: K.Snippet, insertText: 'struct ${1:Name} {\n\t${2}\n};', isSnippet: true, detail: 'struct definition' },
    { label: 'template', kind: K.Snippet, insertText: 'template <typename ${1:T}>\n${2}', isSnippet: true, detail: 'template' },

    // STL Containers & Types
    { label: 'vector', kind: K.Class, insertText: 'std::vector<${1:int}> ${2:vec};', isSnippet: true, detail: 'std::vector<T>' },
    { label: 'string', kind: K.Class, insertText: 'std::string ${1:str};', isSnippet: true, detail: 'std::string' },
    { label: 'map', kind: K.Class, insertText: 'std::map<${1:string}, ${2:int}> ${3:map};', isSnippet: true, detail: 'std::map<K, V>' },
    { label: 'unordered_map', kind: K.Class, insertText: 'std::unordered_map<${1:string}, ${2:int}> ${3:map};', isSnippet: true, detail: 'std::unordered_map<K, V>' },
    { label: 'pair', kind: K.Class, insertText: 'std::pair<${1:int}, ${2:int}> ${3:p};', isSnippet: true, detail: 'std::pair<T1, T2>' },
    { label: 'unique_ptr', kind: K.Class, insertText: 'std::unique_ptr<${1:Type}> ${2:ptr} = std::make_unique<${1:Type}>(${3});', isSnippet: true, detail: 'std::unique_ptr' },
    { label: 'shared_ptr', kind: K.Class, insertText: 'std::shared_ptr<${1:Type}> ${2:ptr} = std::make_shared<${1:Type}>(${3});', isSnippet: true, detail: 'std::shared_ptr' },

    // Keywords
    ...['auto', 'const', 'constexpr', 'inline', 'virtual', 'override', 'final', 'nullptr',
       'using namespace std;', 'namespace', 'public', 'private', 'protected', 'return',
       'new', 'delete', 'static', 'sizeof', 'typedef', 'typename', 'bool', 'int', 'char',
       'float', 'double', 'void', 'long', 'unsigned'].map(k => ({ label: k, kind: K.Keyword }))
  ];
  register('cpp', cppItems);

  /* ─────────────────────────────────────────────
     3. C
  ───────────────────────────────────────────── */
  const cItems = [
    { label: 'include', kind: K.Snippet, insertText: '#include <${1:stdio.h}>', isSnippet: true, detail: '#include' },
    { label: 'main', kind: K.Snippet, insertText: 'int main() {\n\t${1}\n\treturn 0;\n}', isSnippet: true, detail: 'int main()' },
    { label: 'printf', kind: K.Function, insertText: 'printf("${1:%s}\\n"${2:, args});', isSnippet: true, detail: 'printf(format, ...)' },
    { label: 'scanf', kind: K.Function, insertText: 'scanf("${1:%d}", &${2:var});', isSnippet: true, detail: 'scanf(format, &var)' },
    { label: 'malloc', kind: K.Function, insertText: '(${1:int}*)malloc(sizeof(${1:int}) * ${2:n})', isSnippet: true, detail: 'malloc' },
    { label: 'free', kind: K.Function, insertText: 'free(${1:ptr});', isSnippet: true, detail: 'free' },
    { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
    { label: 'while', kind: K.Snippet, insertText: 'while (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'while loop' },
    { label: 'if', kind: K.Snippet, insertText: 'if (${1:condition}) {\n\t${2}\n}', isSnippet: true, detail: 'if statement' },
    { label: 'struct', kind: K.Snippet, insertText: 'typedef struct ${1:Name} {\n\t${2}\n} ${1:Name};', isSnippet: true, detail: 'typedef struct' },
    ...['#include <stdlib.h>', '#include <string.h>', '#include <math.h>', '#include <stdbool.h>',
       'NULL', 'sizeof', 'return', 'const', 'static', 'void', 'int', 'char', 'float', 'double', 'long'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('c', cItems);

  /* ─────────────────────────────────────────────
     4. JAVA
  ───────────────────────────────────────────── */
  const javaItems = [
    { label: 'psvm', kind: K.Snippet, insertText: 'public static void main(String[] args) {\n\t${1}\n}', isSnippet: true, detail: 'main method' },
    { label: 'sout', kind: K.Snippet, insertText: 'System.out.println(${1});', isSnippet: true, detail: 'System.out.println()' },
    { label: 'souf', kind: K.Snippet, insertText: 'System.out.printf("${1:%s}\\n", ${2:args});', isSnippet: true, detail: 'System.out.printf()' },
    { label: 'class', kind: K.Snippet, insertText: 'public class ${1:ClassName} {\n\t${2}\n}', isSnippet: true, detail: 'class declaration' },
    { label: 'for', kind: K.Snippet, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
    { label: 'foreach', kind: K.Snippet, insertText: 'for (${1:Type} ${2:item} : ${3:collection}) {\n\t${4}\n}', isSnippet: true, detail: 'for-each loop' },
    { label: 'try/catch', kind: K.Snippet, insertText: 'try {\n\t${1}\n} catch (${2:Exception} e) {\n\te.printStackTrace();\n}', isSnippet: true, detail: 'try/catch block' },

    // Common Types
    { label: 'String', kind: K.Class, detail: 'java.lang.String' },
    { label: 'ArrayList', kind: K.Class, insertText: 'List<${1:String}> ${2:list} = new ArrayList<>();', isSnippet: true, detail: 'java.util.ArrayList' },
    { label: 'HashMap', kind: K.Class, insertText: 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', isSnippet: true, detail: 'java.util.HashMap' },
    { label: 'Scanner', kind: K.Class, insertText: 'Scanner ${1:sc} = new Scanner(System.in);', isSnippet: true, detail: 'java.util.Scanner' },
    { label: 'Math', kind: K.Class, detail: 'java.lang.Math' },

    // Keywords
    ...['public', 'private', 'protected', 'static', 'final', 'abstract', 'interface', 'extends',
       'implements', 'import', 'package', 'return', 'new', 'this', 'super', 'null', 'true', 'false',
       'boolean', 'int', 'double', 'float', 'long', 'void', 'char', 'byte'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('java', javaItems);

  /* ─────────────────────────────────────────────
     5. GO
  ───────────────────────────────────────────── */
  const goItems = [
    { label: 'main', kind: K.Snippet, insertText: 'package main\n\nfunc main() {\n\t${1}\n}', isSnippet: true, detail: 'package main' },
    { label: 'fmt.Println', kind: K.Snippet, insertText: 'fmt.Println(${1})', isSnippet: true, detail: 'fmt.Println' },
    { label: 'fmt.Printf', kind: K.Snippet, insertText: 'fmt.Printf("${1:%v}\\n", ${2:args})', isSnippet: true, detail: 'fmt.Printf' },
    { label: 'func', kind: K.Snippet, insertText: 'func ${1:name}(${2:params}) ${3:error} {\n\t${4}\n}', isSnippet: true, detail: 'function declaration' },
    { label: 'if_err', kind: K.Snippet, insertText: 'if err != nil {\n\treturn ${1:err}\n}', isSnippet: true, detail: 'if err != nil' },
    { label: 'struct', kind: K.Snippet, insertText: 'type ${1:Name} struct {\n\t${2}\n}', isSnippet: true, detail: 'type struct' },
    { label: 'interface', kind: K.Snippet, insertText: 'type ${1:Name} interface {\n\t${2}\n}', isSnippet: true, detail: 'type interface' },
    { label: 'for', kind: K.Snippet, insertText: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
    { label: 'for_range', kind: K.Snippet, insertText: 'for ${1:k}, ${2:v} := range ${3:slice} {\n\t${4}\n}', isSnippet: true, detail: 'for range' },
    ...['import', 'package', 'var', 'const', 'type', 'return', 'defer', 'go', 'select', 'chan',
       'make', 'len', 'append', 'nil', 'true', 'false', 'string', 'int', 'bool', 'error'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('go', goItems);

  /* ─────────────────────────────────────────────
     6. RUST
  ───────────────────────────────────────────── */
  const rustItems = [
    { label: 'main', kind: K.Snippet, insertText: 'fn main() {\n\t${1}\n}', isSnippet: true, detail: 'fn main()' },
    { label: 'println!', kind: K.Snippet, insertText: 'println!("${1:{}", ${2:val});', isSnippet: true, detail: 'println! macro' },
    { label: 'fn', kind: K.Snippet, insertText: 'fn ${1:name}(${2:params}) -> ${3:Result<(), ()>} {\n\t${4}\n}', isSnippet: true, detail: 'fn declaration' },
    { label: 'struct', kind: K.Snippet, insertText: 'struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}', isSnippet: true, detail: 'struct declaration' },
    { label: 'impl', kind: K.Snippet, insertText: 'impl ${1:Name} {\n\t${2}\n}', isSnippet: true, detail: 'impl block' },
    { label: 'match', kind: K.Snippet, insertText: 'match ${1:expr} {\n\t${2:pat} => ${3:expr},\n\t_ => ${4:()},\n}', isSnippet: true, detail: 'match statement' },
    ...['let', 'let mut', 'pub', 'use', 'mod', 'const', 'enum', 'trait', 'type', 'return',
       'Some', 'None', 'Ok', 'Err', 'Vec', 'String', '&str', 'i32', 'u32', 'f64', 'bool'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('rust', rustItems);

  /* ─────────────────────────────────────────────
     7. SQL
  ───────────────────────────────────────────── */
  const sqlItems = [
    { label: 'SELECT', kind: K.Snippet, insertText: 'SELECT ${1:*} FROM ${2:table} WHERE ${3:condition};', isSnippet: true, detail: 'SELECT query' },
    { label: 'INSERT', kind: K.Snippet, insertText: 'INSERT INTO ${1:table} (${2:cols}) VALUES (${3:vals});', isSnippet: true, detail: 'INSERT query' },
    { label: 'UPDATE', kind: K.Snippet, insertText: 'UPDATE ${1:table} SET ${2:col} = ${3:val} WHERE ${4:condition};', isSnippet: true, detail: 'UPDATE query' },
    { label: 'DELETE', kind: K.Snippet, insertText: 'DELETE FROM ${1:table} WHERE ${2:condition};', isSnippet: true, detail: 'DELETE query' },
    { label: 'CREATE TABLE', kind: K.Snippet, insertText: 'CREATE TABLE ${1:table_name} (\n\tid INT PRIMARY KEY AUTO_INCREMENT,\n\t${2:col} VARCHAR(255)\n);', isSnippet: true, detail: 'CREATE TABLE' },
    ...['FROM', 'WHERE', 'AND', 'OR', 'NOT', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
       'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'AS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('sql', sqlItems);

  /* ─────────────────────────────────────────────
     8. JAVASCRIPT & TYPESCRIPT
  ───────────────────────────────────────────── */
  const jsItems = [
    { label: 'console.log', kind: K.Snippet, insertText: 'console.log(${1:value});', isSnippet: true, detail: 'console.log(...)' },
    { label: 'console.error', kind: K.Snippet, insertText: 'console.error(${1:error});', isSnippet: true, detail: 'console.error(...)' },
    { label: 'console.warn', kind: K.Snippet, insertText: 'console.warn(${1:warning});', isSnippet: true, detail: 'console.warn(...)' },
    { label: 'console.table', kind: K.Snippet, insertText: 'console.table(${1:data});', isSnippet: true, detail: 'console.table(...)' },
    { label: 'console.clear', kind: K.Snippet, insertText: 'console.clear();', isSnippet: true, detail: 'console.clear()' },
    { label: 'console', kind: K.Variable, insertText: 'console', detail: 'Console object' },
    { label: 'const', kind: K.Snippet, insertText: 'const ${1:name} = ${2:value};', isSnippet: true, detail: 'const declaration' },
    { label: 'let', kind: K.Snippet, insertText: 'let ${1:name} = ${2:value};', isSnippet: true, detail: 'let declaration' },
    { label: 'function', kind: K.Snippet, insertText: 'function ${1:name}(${2:params}) {\n\t${3}\n}', isSnippet: true, detail: 'function statement' },
    { label: 'arrow', kind: K.Snippet, insertText: 'const ${1:func} = (${2:params}) => {\n\t${3}\n};', isSnippet: true, detail: 'arrow function' },
    { label: 'async/await', kind: K.Snippet, insertText: 'async function ${1:name}() {\n\ttry {\n\t\tconst res = await ${2:promise};\n\t} catch (err) {\n\t\tconsole.error(err);\n\t}\n}', isSnippet: true, detail: 'async/await function' },
    { label: 'for', kind: K.Snippet, insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:arr}.length; ${1:i}++) {\n\t${3}\n}', isSnippet: true, detail: 'for loop' },
    { label: 'for_of', kind: K.Snippet, insertText: 'for (const ${1:item} of ${2:iterable}) {\n\t${3}\n}', isSnippet: true, detail: 'for...of loop' },
    { label: 'try/catch', kind: K.Snippet, insertText: 'try {\n\t${1}\n} catch (err) {\n\tconsole.error(err);\n}', isSnippet: true, detail: 'try/catch' },
    { label: 'setTimeout', kind: K.Snippet, insertText: 'setTimeout(() => {\n\t${1}\n}, ${2:1000});', isSnippet: true, detail: 'setTimeout' },
    { label: 'setInterval', kind: K.Snippet, insertText: 'setInterval(() => {\n\t${1}\n}, ${2:1000});', isSnippet: true, detail: 'setInterval' },
    { label: 'Promise', kind: K.Snippet, insertText: 'new Promise((resolve, reject) => {\n\t${1}\n})', isSnippet: true, detail: 'new Promise' },
    { label: 'fetch', kind: K.Snippet, insertText: 'const response = await fetch("${1:url}");\nconst data = await response.json();', isSnippet: true, detail: 'fetch API' },
    ...['return', 'if', 'else', 'switch', 'case', 'break', 'continue', 'class', 'import',
       'export', 'default', 'null', 'undefined', 'true', 'false', 'typeof', 'instanceof'].map(k => ({
      label: k, kind: K.Keyword
    }))
  ];
  register('javascript', jsItems);
  register('typescript', jsItems);
}
