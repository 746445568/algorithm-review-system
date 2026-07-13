# Security policy

## Supported surface

Only the current Windows x64 desktop build is supported. The browser extension is temporarily unavailable pending secure pairing.

## Local trust boundary

`ojreviewd` listens only on `127.0.0.1:38473`. `/health` is deliberately unauthenticated; all `/api/*` routes require the persistent random service token. CORS is restricted to Electron's file/null origin and the local Vite development origin. Requests without an `Origin` header still require authentication.

The token and encrypted AI credentials live in the application's secure directory. They must never be placed in preload APIs, renderer state, response DTOs, logs, diagnostics, screenshots, or issue reports.

## Reporting

Do not open a public issue containing secrets or user data. Report a vulnerability privately to the repository owner with reproduction steps, affected version/commit, and the minimum sanitized evidence needed to reproduce it.

## Release policy

Unsigned Windows packages are internal testing artifacts only. Public GitHub Release creation remains disabled until a Windows signing certificate is configured and browser-extension secure pairing is complete.
