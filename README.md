# Sidecode: VS Code-Style IDE in Your Browser Side Panel

<div align="center">
  <p><strong>A lightweight, ultra-fast, Monaco-powered Integrated Development Environment that lives directly inside your browser's side panel (Chrome, Brave, Edge).</strong></p>
  <p>Write, edit real PC files, compile multi-file projects, run an interactive terminal, and execute code in multiple languages without ever leaving your active web tab.</p>
</div>

---

## 💻 Supported Programming Languages & Execution Engines

Sidecode provides native syntax highlighting, auto-detection, code formatting, IntelliSense, and compilation/execution across major programming languages:

| Language | File Extensions | Execution Mode | Capabilities & Features |
| :--- | :--- | :--- | :--- |
| **C** | `.c` | Cloud (GCC 14.1 / Clang) & Local Bridge | C99, C11, C17, C23, full `stdio`, `stdlib`, `math`, multi-file headers |
| **C++** | `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` | Cloud (GCC 14.1 / Clang) & Local Bridge | C++17, C++20, C++23, 350+ pre-compiled libraries (Boost, fmt, nlohmann/json, Catch2) |
| **Python** | `.py` | Cloud (Python 3.12+) & Local Bridge | Python 3 standard library, math, sys, script execution |
| **JavaScript** | `.js`, `.mjs`, `.cjs` | 100% In-Browser Sandbox (Offline) & Node.js | ES2024, directory-aware CommonJS `require()` resolution, nested files |
| **TypeScript** | `.ts` | In-Browser Sandbox (Offline) | Full TypeScript syntax, type safety diagnostics, 0ms network latency |
| **Rust** | `.rs` | Cloud (Rustc 1.80+) & Local Bridge | Rust 2021 edition, memory safety diagnostics, standard library |
| **Go** | `.go` | Cloud (Go 1.22+) & Local Bridge | Go 1.22+ standard library, goroutines, instant formatting |
| **Java** | `.java` | Cloud (OpenJDK 21+) & Local Bridge | Modern OpenJDK 21, object-oriented compilation |
| **Web & Markup** | `.html`, `.css`, `.scss`, `.json`, `.md`, `.yaml`, `.xml`, `.sql`, `.sh` | Monaco Editor Formatters | Bracket matching, auto-indentation, syntax highlighting, code folding |

---

## 🌟 Key Features

### 🖥️ 1. Complete VS Code Look & Feel
- **Full Menu Bar:** Top-level dropdown menu (`File` > `New File`, `Open File...`, `Open Folder...`, `Save`, `Save As...`, `Auto Save`, `Preferences`, `Close Editor`, `Close Folder`).
- **Collapsible File Explorer (`Ctrl+B`):** Full tree hierarchy with custom file icons (JS, TS, C++, Rust, Python, Go, Java, JSON, etc.), collapsible directories, horizontal side-scrolling for deep folder trees, and right-click context actions.
- **Direct PC Disk Editing:** Uses the native **File System Access API** (`showDirectoryPicker`) to edit actual project files on your hard drive in place. No import/export hurdles.
- **IndexedDB Workspace Persistence:** Re-opens your last opened workspace directory across browser restarts with 1-click permission restoration.
- **Double-Click Creation:** Double-click empty workspace space to quickly create files or folders, just like in desktop VS Code.

### 💻 2. Interactive Terminal CLI
- **Real-Time Shell Environment:** Type shell commands directly into the terminal prompt.
- **Built-in Commands:**
  - `cd <dir>` — Navigate directories (`cd ..`, `cd ~`, `cd folder`).
  - `mkdir <name>` — Create folders on disk.
  - `touch <name>` — Create files on disk.
  - `rm [-r] <name>` — Delete files or directories.
  - `mv <src> <dest>` — Rename or move files and folders.
  - `ls` / `dir` — List directory contents with folder icons.
  - `pwd` — Print current working directory path.
  - `cat <file>` — Display file contents.
  - `node <file.js>` / `python <file.py>` / `g++ <file.cpp>` — Run scripts or compile code from the prompt.
  - `clear` / `cls` — Clear terminal screen.
  - **Direct Expression Evaluation:** Type JS or math expressions directly into the prompt (e.g. `[5, 12, 8].filter(x => x > 10)`).
- **Prompt Synchronization:** Displays your active workspace and current relative working directory (`sidecode:~/workspace/src$`).

### ⚡ 3. Multi-Model Monaco Editor
- **Industry-Standard Editing:** Powered by Monaco Editor (the core of VS Code) with syntax highlighting, bracket matching, code folding, word wrap, and customizable font size and tab size.
- **Auto Language Detection:** Automatically associates Monaco language modes, IntelliSense, and compilation tools based on file extensions (`.js`, `.ts`, `.py`, `.cpp`, `.c`, `.rs`, `.go`, `.java`, etc.).
- **Multi-Tab Lifecycle:** Switch effortlessly between open files with view state persistence (scroll position and cursor position are saved when switching tabs).
- **Dirty State Tracking (`●`):** Unsaved changes display a dirty bullet indicator on tab headers and tree items, with unsaved change safeguards when closing.

### 🚀 4. Hybrid Execution Engine (Cloud & Local)
- **Local Native Bridge (Optional — 100% Real Interactive Terminal):**
  - **Commands:** Run `node bridge.js` (or `npm run bridge`) in your project folder.
  - **Authentic Interactive I/O:** Provides true bidirectional standard input (`scanf`, `cin`, `input()`). Programs pause live between loop iterations and accept inputs step-by-step just like in desktop VS Code.
  - **Zero npm Dependencies:** Built using standard Node.js libraries (`node:http`, `node:child_process`).
  - **Native Performance:** Executes directly on your PC using your local compilers (MSYS2 GCC, Clang, Python, Node, Rust, Go) with zero latency and no internet connection required.
- **In-Browser Sandbox (100% Offline):**
  - **Languages:** JavaScript, TypeScript.
  - Runs in a secure, isolated browser sandbox. Instant execution with 0ms network latency.
  - Full support for modern ECMAScript, formatted object/array inspection, and error stacks.
- **Cloud Runner (Compiler Explorer / Piston — Default & Fallback):**
  - **Languages:** C, C++, Python, Java, Rust, Go.
  - Automatically used whenever the local bridge is not running.
  - Executes code via Compiler Explorer in isolated Docker nsjail containers with standard library support.
  - **Unified Array & Object Output:** Harmonized standalone Google V8 (`d8`) output so array filtering and object logs match Node.js and browser formatting (`[ 12, 20, 15 ]`).
  - **Custom Piston Endpoint:** Option to configure a self-hosted Piston execution server in Settings.

### 🛠️ 5. Developer Tools & Productivity
- **Strict Input (`stdin`) Parser:** Supply batch standard input for interactive prompts (`scanf`, `cin`, `input()`). Includes strict data typing for strings, booleans, and arrays.
- **Problems Panel & Clean Diagnostics:** Isolates compilation errors and warnings from program output. Clicking any problem immediately navigates and highlights the exact line and column in the editor.
- **Assembly Inspector:** Real-time disassembly viewer displaying compiler-generated machine instructions mapped to source code lines.
- **Instant Libraries (Dependencies Menu):** Link 350+ pre-compiled libraries (Boost, fmt, nlohmann/json, Catch2, Tokio, Serde, etc.) with a single click.
- **Document Formatting (`Ctrl+Alt+F`):** Format code on-demand via Monaco's built-in formatters and language formatters.
- **Debug Zone:** Dedicated diagnostics dashboard to inspect extension memory usage, API requests, and execution telemetry.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` | Run code (active tab or command) |
| `Ctrl + S` | Save active tab directly to disk |
| `Ctrl + Shift + S` | Save As... (choose disk location) |
| `Ctrl + O` | Open file from PC |
| `Ctrl + B` | Toggle File Explorer sidebar |
| `Ctrl + N` | New file |
| `Ctrl + \`` / `Ctrl + ~` | Toggle Terminal / Console panel |
| `Ctrl + Alt + F` | Format Document |
| `Ctrl + Alt + A` | Run Static Analysis on active file |
| `Ctrl + Shift + Z` | Close Side Panel |

---

## 📁 Project Structure

```text
Sidecode/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── background.js              # Service worker managing side panel behavior
├── sidepanel/
│   ├── index.html             # Main IDE DOM layout
│   ├── app.js                 # Central application controller & event wiring
│   ├── style.css              # VS Code dark theme styling & responsive layout
│   ├── sandbox.html           # Isolated offline iframe sandbox for JS/TS
│   ├── storage.js             # Chrome storage & IndexedDB persistence
│   ├── modules/
│   │   ├── editor.js          # Monaco editor instance & multi-model manager
│   │   ├── explorer.js        # File tree explorer UI, context menus, and CRUD
│   │   ├── workspace.js       # File System Access API & disk synchronization
│   │   ├── terminal.js        # Interactive terminal CLI & command dispatcher
│   │   ├── tabs.js            # Tab bar state, lifecycle, and dirty flags
│   │   ├── cloudRunner.js     # Compiler Explorer & cloud execution engine
│   │   ├── analysis.js        # Problems panel & diagnostic parser
│   │   ├── console.js         # Terminal output stream, stdin, & assembly panel
│   │   ├── libraries.js       # Third-party dependency search & injection
│   │   ├── multifileCompiler.js # Multi-file compilation payload builder
│   │   ├── completions.js     # Code autocompletion dictionaries
│   │   └── permissions.js     # Brave & Chrome permission helpers
│   ├── vs/                    # Monaco Editor core distribution
│   └── workers/               # Monaco Editor web workers
├── debug/                     # Sidecode Debug Zone dashboard
└── docs/                      # Technical architecture documentation
```

---

## 📥 Installation (Developer Mode)

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/<your-username>/Sidecode.git
   ```
2. Open Google Chrome, Brave, or Microsoft Edge.
3. Navigate to:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`
4. Toggle **Developer mode** in the top right corner.
5. Click **Load unpacked** and select the root `Sidecode` folder (where `manifest.json` is located).
6. Pin **Sidecode** to your browser toolbar.
7. Click the extension icon to launch the IDE in your browser side panel.

---

## 🔒 Security & Privacy

- **Offline Safety:** All JavaScript and TypeScript executions run locally in your browser's sandboxed iframe without transmitting code over the network.
- **Local Disk Privacy:** Files accessed via Open Folder remain on your local machine; only the files you explicitly execute via Cloud Runner are transmitted over HTTPS to isolated sandbox runners.
- **No Telemetry / No Tracking:** Sidecode does not collect personal data, track user keystrokes, or display advertisements.
