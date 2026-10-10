# Sidecode Future Upgrades & Roadmap

This document outlines architectural plans and planned capabilities to transition Sidecode into a comprehensive browser-based IDE.

---

## 1. Python Third-Party Libraries (Pyodide Wasm)
- **Current State:** Python runs via Godbolt's stateless CPython container with access to all 276 standard library modules. Outbound internet is disabled in Godbolt for security, preventing dynamic `pip install`.
- **Planned Solution:** Integrate **Pyodide** (CPython compiled to WebAssembly) into Sidecode's browser sandbox.
- **Capabilities Unlocked:**
  - Full client-side offline execution for Python.
  - Access to precompiled scientific packages including `numpy`, `pandas`, `scipy`, `matplotlib`, `sympy`, `scikit-learn`, and `regex`.
  - Zero network latency for local computations and visualizations.

---

## 2. JavaScript & TypeScript Modern CDN Imports
- **Current State:** JavaScript and TypeScript run in an isolated in-browser iframe sandbox with standard DOM and ES2022 support.
- **Planned Solution:** Add ESM Import Map support backed by `esm.sh` or `unpkg`.
- **Capabilities Unlocked:**
  - Users can write standard ES module imports directly:
    ```javascript
    import confetti from 'https://esm.sh/canvas-confetti';
    import { format } from 'https://esm.sh/date-fns';
    ```
  - Automatic type declarations (`.d.ts`) downloaded dynamically into Monaco for autocomplete and hover tooltips on imported npm packages.

---

## 3. Java Third-Party Dependencies (Maven / Classpath)
- **Current State:** Java executes via Godbolt OpenJDK without external Maven repository resolvers.
- **Planned Solution:**
  - Provide a curated set of popular Java `.jar` libraries (`Gson`, `Guava`, `JUnit`, `Jackson`, `Apache Commons`) via custom Piston containers or remote compilation worker with pre-downloaded classpaths.
  - Add dependency selection to the IDE dependency manager for Java tabs.

---

## 4. Multi-File Project Workspace
- **Planned Solution:** Expand Sidecode tabs into a mini project explorer (files & directories), supporting multi-file C/C++ compilation (`#include "my_header.h"`), Java packages (`package com.app;`), and Rust modules (`mod utils;`).
- **Compiler Explorer Support:** Godbolt supports multi-file compilation payloads via its CMake / file manifest endpoints.

---

## 5. Offline WebAssembly Compilers
- **Planned Solution:** Opt-in offline execution engines:
  - C/C++ via TCC-Wasm (Tiny C Compiler) or Clang-Wasm.
  - SQLite Wasm with in-memory relational database querying.
  - Lua Wasm for lightweight offline scripting.
