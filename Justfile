# ws-scrcpy dev recipes

# Default: list available recipes
default:
    @just --list

# Build once (development)
build:
    npm run dist:dev

# Build once (production)
build-prod:
    npm run dist:prod

# Hot-reload dev workflow:
# 1. Build everything once, then start the server + webpack watch in parallel
dev: build
    #!/usr/bin/env bash
    set -e
    # Start server in background
    node dist/index.js &
    SERVER_PID=$!
    echo "Server started (pid $SERVER_PID) — open http://localhost:$(node -e "const c=require('./dist/config.json') 2>/dev/null; console.log(c?.port||8000)" 2>/dev/null || echo 8000)"
    echo "Webpack watching for changes — refresh browser after each rebuild"
    # Watch frontend; kill server on exit
    trap "kill $SERVER_PID 2>/dev/null" EXIT
    npx webpack --config webpack/ws-scrcpy.dev.ts --watch

# Start server only (if already built)
serve:
    node dist/index.js

# Watch frontend only (server must be running separately)
watch:
    npx webpack --config webpack/ws-scrcpy.dev.ts --watch

# Lint
lint:
    npm run lint

# Clean build artifacts
clean:
    npm run clean
