# Security policy

## Supported surface

Only the current Windows x64 desktop build is formally supported. The unpacked Chrome/Edge extension is supported for development after one-time secure pairing.

## Local trust boundary

`ojreviewd` listens only on `127.0.0.1:38473`. `/health` is deliberately unauthenticated. The extension pairing claim accepts only a valid `chrome-extension://` origin and requires a six-digit code that expires after five minutes or five failed attempts. All other `/api/*` routes require a bearer token.

The desktop service token can access the full local API. A successfully paired extension receives a separate token that is restricted to the two import endpoints and its exact extension origin. The service stores only the extension token hash; the raw token remains in trusted extension storage and is never sent to a content script. CORS is restricted to Electron's file/null origin, the local Vite development origin, and the paired extension origin. Requests without an `Origin` header still require authentication.

The token and encrypted AI credentials live in the application's secure directory. They must never be placed in preload APIs, renderer state, response DTOs, logs, diagnostics, screenshots, or issue reports.

## Reporting

Do not open a public issue containing secrets or user data. Report a vulnerability privately to the repository owner with reproduction steps, affected version/commit, and the minimum sanitized evidence needed to reproduce it.

## Release policy

Unsigned Windows packages are internal testing artifacts only. Public GitHub Release creation remains disabled until a Windows signing certificate is configured.
