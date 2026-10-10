# Sidecode: Browser Extension IDE

Sidecode is a lightweight, Monaco-powered Integrated Development Environment (IDE) that lives entirely in your browser's side panel (Chrome/Edge/Brave). It enables developers to quickly write, compile, and execute code snippets in multiple languages without leaving their current web tab.

## Features

- **Monaco Editor:** Industry-standard editing experience (powers VS Code) with syntax highlighting, autocomplete, and intelligent code suggestions.
- **Multi-Language Support:** Write code in JavaScript, TypeScript, Python, C, C++, Java, Rust, and Go.
- **Smart Boilerplates:** Switching to a compiled language like C or Java automatically populates the editor with the minimum required boilerplate so you can start coding immediately.
- **Integrated Console:** View your program's standard output (stdout), errors (stderr), and execution time directly in the IDE.
- **Standard Input (`stdin`) Support:** An integrated "Input" tab allows you to supply standard input for algorithms requiring user input. Includes a **Strict Typing Parser** that enforces data types (Booleans, Strings, Arrays) before executing.
- **Hybrid Execution Engine:**
  - **Browser Sandbox:** JavaScript and TypeScript run 100% offline via an isolated sandbox.
  - **Cloud Runner:** System languages (C/C++, Java, Rust, Go, Python) are compiled and executed instantly using a fast Cloud API.
- **Advanced Debug Zone:** A dedicated, real-time logging dashboard to monitor exact API payloads, compiler execution errors, and standard input/output streams. Accessible via Settings.

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin the Sidecode extension to your browser toolbar.
6. Click the Sidecode icon to open it in your Side Panel.

## Architecture & Documentation

- For a detailed breakdown of how the execution engine works, API limitations, and self-hosting instructions, see [docs/COMPILER.md](./docs/COMPILER.md).

## Usage Tips

- **Run Shortcut:** Press `Ctrl+Enter` while inside the editor to quickly run your code.
- **Clear Console:** Press the `Clear` button in the console header or re-run code.
- **Standard Input:** Since cloud execution happens in batches, interactive prompts (like Python's `input()` or C's `scanf()`) will immediately hit EOF unless you provide input upfront. Use the **Input (stdin)** tab to write your input before hitting Run.
- **Strict Typing Mode:** Our custom parser enforces data typing. Wrap strings in `"double quotes"`, arrays in `[1,2,3]`, or use `` `backticks` `` for raw strings.
- **Developer Settings:** Click the gear icon `⚙` to adjust your Font Size, Word Wrap, Tab Size, set your default language, or provide a custom execution server URL.

## Security

- Web extensions execute with elevated privileges. Sidecode leverages strict Content Security Policies (CSP) and relies on `chrome.userScripts` and iframe sandboxing to ensure malicious code cannot escape the JavaScript runtime.
- System languages are executed in securely isolated nsjail environments provided by the Compiler Explorer API or your custom Piston deployment.
