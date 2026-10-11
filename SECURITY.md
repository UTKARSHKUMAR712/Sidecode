# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

Security is a fundamental priority for Sidecode. If you discover a vulnerability or security flaw, please report it responsibly:

1. **Do not create public GitHub issues for security vulnerabilities.**
2. Report the vulnerability directly to the project author:
   - **Author**: utkarshkumar712
   - **GitHub**: [https://github.com/UTKARSHKUMAR712](https://github.com/UTKARSHKUMAR712)
   - **Security Advisory**: Submit via [GitHub Security Advisories](https://github.com/UTKARSHKUMAR712/Sidecode/security/advisories/new)
3. Include a detailed description of the vulnerability, reproduction steps, and potential impact.
4. You will receive an acknowledgment within 48 hours.

## Security Architecture

- **Sandboxed Execution**: In-browser JavaScript and TypeScript run inside a sandboxed `iframe` with restricted permissions.
- **Local Privacy**: Local PC files edited via the File System Access API are accessed purely on your machine.
- **Local Bridge Safeguards**: The native bridge server binds exclusively to `127.0.0.1` and automatically closes when the extension or browser shuts down.
- **Zero Telemetry**: Sidecode does not collect or transmit analytics, telemetry, or personal data.
