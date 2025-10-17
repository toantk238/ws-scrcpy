# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ws-scrcpy is a web client for Genymobile/scrcpy that provides remote control and screen mirroring for Android and iOS devices through a web browser. It uses WebSockets for real-time communication and supports multiple video decoders.

## Development Commands

```bash
# Clean build artifacts
npm run clean

# Development build (default)
npm run dist:dev
# or
npm run dist

# Production build
npm run dist:prod

# Build and start the server
npm start

# Lint the codebase
npm run lint

# Format code with ESLint
npm run format
```

Note: Tests are not configured (`npm test` will exit with error code 1).

## Architecture Overview

### Client-Server Architecture

The project follows a clear client-server separation:

1. **Server (`/src/server/`)**: Node.js/Express server that:
   - Manages device connections via adb (Android) or WebDriverAgent (iOS)
   - Provides WebSocket endpoints for streaming and control
   - Handles file operations and APK installations
   - Runs device trackers to detect connected devices

2. **Client (`/src/app/`)**: Browser-based UI that:
   - Renders device screens using various H264 decoders (MSE, Broadway, TinyH264, WebCodecs)
   - Handles user input (touch, keyboard, mouse) and forwards to devices
   - Manages multiple device connections simultaneously
   - Provides device-specific UI controls

### Key Architectural Patterns

1. **Device Abstraction**: Base classes (`BaseClient`, `BaseDeviceTracker`) with platform-specific implementations:
   - Android: `GoogDeviceTracker`, `ScrcpyClient`
   - iOS: `ApplDeviceTracker`, `QVHClient`

2. **Video Decoder Strategy**: Multiple decoder implementations selected based on browser capabilities:
   - Located in `/src/app/player/` with a common interface
   - Automatic fallback between decoders

3. **Build Configuration**: Highly customizable via `build.config.override.json`:
   - Feature flags to include/exclude functionality
   - Conditional compilation using ifdef-loader
   - Separate webpack configs for dev/prod

4. **TypeScript-First**: Strict TypeScript with ES5 target for browser compatibility

## Important Configuration

1. **Build Configuration**: Create `build.config.override.json` to customize features
2. **Runtime Configuration**: Use `WS_SCRCPY_CONFIG` environment variable or create config file (see `config.example.yaml`)
3. **Security Note**: No encryption or authorization by default - implement security measures for production use

## Development Workflow

When making changes:

1. **Follow existing patterns**: Check similar features in the codebase first
2. **Maintain TypeScript types**: Update interfaces when changing data structures
3. **Handle both platforms**: Consider Android/iOS differences when modifying device interaction code
4. **Test with real devices**: The app requires actual Android/iOS devices connected via USB
5. **Run linting**: Always run `npm run lint` before committing changes

## System Prompt and MCP Configuration

### MCP Servers Available
This project has the following MCP (Model Context Protocol) servers configured in `.mcp.json`:

1. **Sequential Thinking Server** (`@modelcontextprotocol/server-sequential-thinking`)
   - Enables dynamic and reflective problem-solving through structured thinking
   - Useful for breaking down complex problems, planning with room for revision, and multi-step solutions
   - Can be invoked using the `mcp__sequential-thinking__sequentialthinking` tool

2. **Memory Server** (`@modelcontextprotocol/server-memory`)
   - Provides a persistent knowledge graph for storing and retrieving information
   - Useful for maintaining context across conversations and storing important project knowledge
   - Available tools:
     - `mcp__memory__create_entities` - Create entities in the knowledge graph
     - `mcp__memory__create_relations` - Create relationships between entities
     - `mcp__memory__add_observations` - Add observations to entities
     - `mcp__memory__search_nodes` - Search the knowledge graph
     - `mcp__memory__read_graph` - Read the entire knowledge graph

### Using MCP Servers
When working with complex problems or needing to maintain long-term context:
- Use the sequential thinking server for complex refactoring or architectural decisions
- Use the memory server to store important project knowledge, API patterns, or team decisions
- These tools are especially helpful for maintaining consistency across the codebase migration

### Example Use Cases

#### Sequential Thinking Server
```
# Use for complex migrations or refactoring:
- Breaking down the Spring Boot to Go migration into phases
- Planning API endpoint conversions with potential revisions
- Analyzing dependencies and determining migration order
- Solving complex entity relationship mappings
```

#### Memory Server
```
# Store project-specific knowledge:
- API endpoint mappings between Spring Boot and Go
- Common patterns used in the codebase
- Team decisions about architecture
- Migration progress and completed tasks
- Database schema changes and reasons
```

### System Prompt Guidelines
When Claude Code works on this project, it should:
1. **Prioritize using existing patterns** - Check how similar features are implemented
2. **Maintain consistency** - Follow the established code style and architecture
3. **Use MCP tools for complex tasks** - Leverage sequential thinking for planning, memory for context
4. **Document decisions** - Store important architectural decisions in the memory graph
5. **Test thoroughly** - Always run `go build ./...` and `go test ./...` after changes

