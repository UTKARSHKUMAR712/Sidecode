# Compiler Explorer (Godbolt) API Documentation

## 1. Overview of the API

Compiler Explorer (also known as Godbolt) provides a comprehensive RESTful API primarily interacting with `/api/*` endpoints. It enables developers to programmatically compile code to assembly, execute code, list available compilers/tools/libraries, format source code, and create/resolve shortlinks.

- **Data Formats:** Endpoints generally accept JSON or plain text. They return JSON if the request includes an `Accept: application/json` header, otherwise they return plain text.
- **Fair Use:** The official instance at `godbolt.org` is a community-run, non-commercial service. For high-volume or commercial IDE integrations, hosting a local instance of the open-source Compiler Explorer backend is strongly recommended.

## 2. Available Endpoints

The API is divided into several informative and operational endpoints:

### Querying Infrastructure
* `GET /api/languages` - Returns a list of supported languages.
* `GET /api/compilers` (or `GET /api/compilers/<lang-id>`) - Returns a list of compilers available. Fields can be filtered (e.g., `?fields=id,name,semver`).
* `GET /api/libraries/<lang-id>` - Lists third-party libraries (and versions) available for inclusion (e.g., Boost, fmt).
* `GET /api/tools/<lang-id>` - Lists supplementary tools available (e.g., clang-tidy, linters).
* `GET /api/formats` - Lists supported code formatters (e.g., rustfmt, clang-format).
* `GET /api/asm/<instructionSet>/<opcode>` - Returns documentation for a specific assembly instruction.

### Action Endpoints
* `POST /api/compiler/<compiler-id>/compile` - Performs compilation (and optionally execution) of code.
* `POST /api/compiler/<compiler-id>/cmake` - Performs a multi-file compilation using CMake.
* `POST /api/format/<formatter>` - Applies code formatting to provided source code.
* `POST /api/shortener` - Saves the current client state and generates a permalink (Godbolt shortlink).
* `GET /api/shortlinkinfo/<linkid>` - Retrieves the source code and configuration associated with a shortlink.

## 3. Execution Model and Parameters

Compilation and execution are performed via `POST /api/compiler/<compiler-id>/compile`. The API supports providing source code directly along with a rich set of configuration options.

### Request Payload (JSON)
```json
{
    "source": "int main() { return 0; }",
    "options": {
        "userArguments": "-O3 -Wall",
        "compilerOptions": {
            "executorRequest": true,
            "skipAsm": false
        },
        "filters": {
            "intel": true,
            "demangle": true,
            "execute": true,
            "binary": false
        },
        "executeParameters": {
            "args": ["cli_arg1"],
            "stdin": "input_string",
            "runtimeTools": [{"name": "env", "options": [{"name": "MY_ENV", "value": "1"}]}]
        },
        "tools": [],
        "libraries": []
    },
    "lang": "c++",
    "allowStoreCodeDebug": true,
    "bypassCache": 0
}
```

### Key Execution Model Parameters:
* **`options.userArguments`**: Contains the compiler flags (e.g., `-std=c++20 -O2`).
* **`options.compilerOptions.executorRequest`**: Boolean indicating whether to actually execute the compiled binary.
* **`options.filters`**: Fine-tune the assembly output (e.g., removing unused labels, intel vs. AT&T syntax, demangling names, removing comments).
* **`options.executeParameters`**: Required if execution is requested. You can pipe custom `stdin`, pass CLI `args`, or define runtime `env` variables.
* **`bypassCache`**: Uses an enum (`0` = None, `1` = Compilation, `2` = Execution) to bypass aggressive caching on the Godbolt server.
* **Response**: Returns a JSON object with `code` (exit code), `stdout`, `stderr`, `asm` (array of assembly instructions with source line mappings), and `optOutput` (optimization outputs).

## 4. Advanced Features for IDE Integration

We can significantly enhance our IDE's capabilities by leveraging the following advanced features of the API:

### 1. Advanced Compiler Tools (e.g., Static Analysis)
Tools like `clang-tidy`, `cppcheck`, or `pahole` can be integrated directly into a build request. We dynamically query `GET /api/tools/<lang-id>` to find available tools.
```json
"tools": [
    { "id": "clangtidytrunk", "args": "-checks=*" }
]
```
*IDE Use Case:* Provide on-the-fly static analysis and linting feedback mapped directly to source line numbers without needing a local clang-tidy installation.

### 2. Including External Libraries (Boost, fmt, etc.)
The Godbolt backend hosts pre-compiled versions of many popular libraries. By querying `GET /api/libraries/<lang-id>`, we can present a UI to developers to "include" third-party packages.
```json
"libraries": [
    {"id": "fmt", "version": "900"},
    {"id": "boost", "version": "181"}
]
```
*IDE Use Case:* Let users rapidly prototype C++ code that relies on heavyweight libraries like Boost, Range-v3, or fmt without the hassle of downloading and configuring them locally.

### 3. Multi-file & CMake Support
For more complex prototyping, Godbolt supports multiple files through the `files` array, and even full CMake configurations via `POST /api/compiler/<compiler-id>/cmake`.
```json
"files": [
    {
        "filename": "myheader.h",
        "contents": "#pragma once\n#define MY_CONSTANT 42"
    }
]
```
*IDE Use Case:* Build a scratchpad that lets users test multi-file structural changes or simple CMake dependencies purely in the cloud.

### 4. Code Formatting
Format source code using popular formatters without a local toolchain via `POST /api/format/<formatter>`.
```json
{
    "source": "int main(   ) {}",
    "base": "Google",
    "useSpaces": false,
    "tabWidth": 4
}
```
*IDE Use Case:* Provide a "Format Document" command backed by the cloud, supporting formatters like `clang-format` or `rustfmt`.

### 5. AST and LLVM IR Viewing
Godbolt natively supports exporting AST or LLVM IR by treating them as alternative views or by using specific compilers/flags. 
*IDE Use Case:* A dedicated panel in the IDE showing a live view of the AST or LLVM IR, generated by passing `-Xclang -ast-dump` or `-emit-llvm` as `userArguments`, parsing Godbolt's stdout/stderr, or using a dedicated compiler ID if available for that exact purpose.

## 5. Limitations

While powerful, integrating the Godbolt API has certain limitations to keep in mind:

1. **Network Sandbox:** Compilation nodes have no internet access. Code that requires remote `#include <https://...>` or fetches resources during CMake configure steps will fail.
2. **Stateless Nature:** Each compilation is isolated. You must send the full source state (and headers) on every request, which can be bandwidth-heavy for massive files.
3. **Execution Limits:** Code execution is strictly sandboxed with aggressive CPU, memory, and timeout limits. It is designed for small snippets and prototyping, not heavy computation.
4. **Rate Limiting & Cost:** The public `godbolt.org` instance is a non-commercial service. Our IDE integration must be cautious of rate limits, or we should allow users to configure their own custom self-hosted Godbolt URL.
5. **No Interactive Input:** While `stdin` can be passed upfront in `executeParameters`, true interactive terminal applications (e.g., prompting the user for input halfway through execution) are not supported.
