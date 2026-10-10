# Sidecode Compiler Architecture

Sidecode offers a hybrid execution environment for code snippets: an in-browser sandbox (for Web languages) and a cloud-based execution engine (for System and Backend languages).

## Supported Languages & Execution Engines

1. **In-Browser Sandbox** (`sandbox`)
   - **Languages:** JavaScript, TypeScript
   - **How it works:** Uses a hidden `<iframe>` with the `sandbox` attribute. Code is executed entirely offline using the browser's native JavaScript engine (V8, SpiderMonkey, etc.). TypeScript is transpiled to JS before execution.
   - **Pros:** 100% offline, zero latency, highly secure.
   - **Cons:** Cannot execute system languages natively.

2. **Cloud Execution** (`cloud`)
   - **Languages:** C, C++, Java, Python, Go, Rust
   - **How it works:** Code is sent over HTTPS to a remote execution API. By default, Sidecode relies on the **Compiler Explorer (Godbolt) API**, which compiles and executes the code in isolated Docker/nsjail sandboxes.
   - **Pros:** Full access to standard libraries; no heavy local toolchains required.
   - **Cons:** Requires an active internet connection.

## Cloud API Specifics & Limitations

### 1. Default Cloud API: Compiler Explorer (Godbolt)
Sidecode interfaces with `https://godbolt.org/api/compiler/<compiler-id>/compile`.

**Assembly Output:** Because Godbolt is inherently designed for compiler exploration, it natively returns mapped Assembly instructions alongside standard execution stdout. Sidecode parses this response to dynamically populate a dedicated **Assembly tab** in the IDE UI for supported languages.

**Compiler IDs used:**
- C: `cg141` (GCC 14.1)
- C++: `cg141` (G++ 14.1)
- Java: `java21` (OpenJDK 21)
- Python: `python312` (Python 3.12)
- Go: `go122` (Go 1.22)
- Rust: `r180` (Rust 1.80)

**Limitations:**
- **Standard Input (`stdin`) is NOT interactive.** 
  Because this is a stateless batch API, you cannot interact with `scanf()`, `cin`, or `input()` while the program is running. **All standard input must be provided *before* running the code.**
  - *Workaround:* We added a dedicated "Input (stdin)" tab in the console panel. Users must type their input there before pressing Run. The entire string is sent along with the compilation payload.
- **Timeouts:** Long-running loops or tasks are killed aggressively by Godbolt to conserve resources (usually capped at a few seconds).
- **Network Constraints:** Some school or corporate networks block Godbolt.

### 2. Custom Fallback API: Piston v2
Because the public Piston API recently changed to whitelist-only (causing 401 Unauthorized errors), Sidecode now defaults to Godbolt. However, we preserved the Piston execution logic for power users.

Users can host their own instance of the [Piston execution engine](https://github.com/engineer-man/piston) using Docker. 
They can then go into Sidecode's **Settings (⚙)** and provide their custom endpoint (e.g., `http://localhost:2000/api/v2/piston/execute`). 
If a custom URL is provided, Sidecode will route all cloud execution to that endpoint instead of Godbolt.

**Piston Advantages:**
- No arbitrary rate limiting (if self-hosted).
- Still a batch API, but generally supports wider execution parameters.
- Can be run locally, achieving the "offline" capability for backend languages without embedding heavy Wasm compilers.

## Future Plans

- Exploring WebAssembly (Wasm) ports of compilers (like Pyodide for Python, TCC-Wasm for C) to bring 100% offline execution for all languages. Due to the high download payload (e.g., Clang in Wasm is >30MB), this is deferred as an opt-in future capability.
