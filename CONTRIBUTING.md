# Contributing to OJReviewDesktop

## Development Setup

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/)

### Getting Started

```bash
git clone https://github.com/746445568/algorithm-review-system.git
cd algorithm-review-system

# Backend
cd apps/server
go test ./...

# Frontend
cd apps/desktop-electron
npm install
npm run dev
```

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

feat:    new feature
fix:     bug fix
docs:    documentation
chore:   build/tooling/dependencies
test:    testing
refactor: code refactoring (no behavior change)
```

Example:
```
feat: add review calendar view with streak tracking
fix: prevent sync task from running when queue is full
docs: add CONTRIBUTING.md
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes with tests
4. Ensure tests pass:
   - Backend: `cd apps/server && go test ./...`
   - Frontend: `cd apps/desktop-electron && npm test`
5. Commit using Conventional Commits format
6. Push and create a Pull Request

## Code Style

- **Go:** Follow standard Go conventions. Use `t.Fatalf` (not `t.Errorf`) in tests.
- **JavaScript/React:** Use ES modules. Components in PascalCase files. Follow existing patterns in the codebase.

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.
