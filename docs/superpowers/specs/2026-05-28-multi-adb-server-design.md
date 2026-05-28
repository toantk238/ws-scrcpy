# Multi-ADB Server Support Design

**Date:** 2026-05-28  
**Branch:** `feature/multi_servers`  
**Status:** Approved

---

## Overview

Allow ws-scrcpy to connect to multiple ADB servers running on different ports on the same machine. Each ADB server is identified by a user-defined label. Devices from different servers are namespaced by label to prevent collision. The change is fully backward-compatible: if no `adbServers` config is provided, behavior is identical to today.

---

## Configuration

A new optional `adbServers` key is added to the configuration file schema.

```typescript
// src/types/Configuration.d.ts
export interface AdbServerConfig {
    label: string;
    host?: string;   // default: '127.0.0.1'
    port?: number;   // default: 5037
}

export interface Configuration {
    // ...existing fields unchanged...
    adbServers?: AdbServerConfig[];
}
```

Example `config.yaml`:
```yaml
adbServers:
  - label: "lab-a"
    port: 5037
  - label: "lab-b"
    port: 5038
```

**Backward compatibility:** `Config.ts` synthesizes a default single-entry list when `adbServers` is absent:
```typescript
[{ label: 'default', host: process.env.ADB_HOST || '127.0.0.1', port: parseInt(process.env.ADB_PORT || '5037', 10) }]
```
Existing deployments need no config changes.

---

## ControlCenter — per-server instances

`ControlCenter` changes from a single static singleton to a registry keyed by server label.

**Before:**
```typescript
private static instance?: ControlCenter;
public static getInstance(): ControlCenter { ... }
```

**After:**
```typescript
private static instances = new Map<string, ControlCenter>();
public static getInstance(label: string): ControlCenter { ... }
public static getAllInstances(): ControlCenter[] { ... }
```

The constructor accepts the ADB server config and creates its own client and tracker:
```typescript
protected constructor(private readonly adbServer: AdbServerConfig) {
    super();
    this.client = AdbExtended.createClient({ host: adbServer.host, port: adbServer.port });
    const idString = `goog|${adbServer.label}|${os.hostname()}|${os.uptime()}`;
    this.id = crypto.createHash('md5').update(idString).digest('hex');
}
```

**Server startup** (`src/server/index.ts`) iterates `config.adbServers` and calls `ControlCenter.getInstance(label)` for each, replacing the single `servicesToStart.push(ControlCenter)`.

Each `ControlCenter` instance independently:
- Maintains its own `deviceMap: Map<string, Device>`
- Maintains its own `descriptors: Map<string, GoogDeviceDescriptor>`
- Runs its own adbkit tracker with auto-restart on error

---

## Device — carry ADB server context

`Device` constructor gains an `adbServer` parameter so every client call goes to the correct server.

```typescript
constructor(
    public readonly udid: string,
    state: string,
    private readonly adbServer: AdbServerConfig,
) {
    this.client = AdbExtended.createClient({ host: adbServer.host, port: adbServer.port });
    ...
}
```

A `namespacedUdid` getter provides collision-safe identity:
```typescript
get namespacedUdid(): string {
    return `${this.adbServer.label}:${this.udid}`;
}
```

`ControlCenter` uses `namespacedUdid` as keys in `deviceMap` and `descriptors`. The `GoogDeviceDescriptor` gains an `adbServerLabel` field so the browser UI can display `lab-a: Pixel 6`.

**`runShellCommandAdb` (spawn-based):** ADB host/port flags are injected:
```typescript
const args = ['-H', adbServer.host, '-P', String(adbServer.port), '-s', this.udid, 'shell', command];
```

---

## AdbUtils — optional server context parameter

All static methods in `AdbUtils` gain an optional trailing `adbServer?: AdbServerConfig` parameter:

```typescript
public static async push(
    serial: string,
    stream: ReadStream,
    pathString: string,
    adbServer?: AdbServerConfig,
): Promise<PushTransfer> {
    const client = AdbExtended.createClient(adbServer ?? {});
    ...
}
```

When `adbServer` is `undefined`, `AdbExtended.createClient({})` falls through to `ADB_HOST`/`ADB_PORT` env vars then `127.0.0.1:5037` — identical to today. No existing call sites break.

Callers that live on a `Device` (e.g. `ScrcpyServer`, middleware) pass `device.adbServer`. Direct middleware callers with no device context pass `undefined` and retain default behavior.

---

## DeviceTracker middleware — subscribe to all instances

`DeviceTracker` currently holds a direct reference to a single `ControlCenter`:
```typescript
private adt: ControlCenter = ControlCenter.getInstance();
```

With multiple instances it must subscribe to all of them:
```typescript
private adts: ControlCenter[] = ControlCenter.getAllInstances();
```

On construction it calls `init()` on each instance, subscribes `sendDeviceMessage` to every instance's `device` event, and sends the aggregated device list from all instances to the browser.

**Command routing:** `onSocketMessage` receives a `ControlCenterCommand` whose `udid` is the `namespacedUdid` (e.g. `lab-a:emulator-5554`). The middleware parses the label prefix and routes `runCommand` to the matching `ControlCenter` instance. If no label prefix is present (legacy command), it falls back to the first instance.

**Descriptor `udid` field:** `Device` sets `descriptor.udid = namespacedUdid`. This is the value the browser stores and sends back in commands, so server-side routing is transparent. The raw ADB serial (`this.udid`) is used only for direct ADB operations.

---

## Data Flow

```
Config.getInstance()
  └─ resolves adbServers (or synthesizes default single-entry)

index.ts loadGoogModules()
  └─ for each adbServer in config.adbServers:
       ControlCenter.getInstance(label)   ← creates instance if not exists
         └─ AdbExtended.createClient({host, port})
         └─ adbkit Tracker (watches devices on this server)
              └─ on device added/changed: new Device(udid, state, adbServer)
                   └─ namespacedUdid = "lab-a:emulator-5554"
                   └─ client = AdbExtended.createClient({host, port})

DeviceTracker middleware
  └─ collects descriptors from all ControlCenter.getAllInstances()
  └─ broadcasts to browser (descriptor includes adbServerLabel)

Browser UI
  └─ displays "lab-a: Pixel 6", "lab-b: Pixel 6" as distinct entries
```

---

## What Does NOT Change

- iOS (`appl-device`) — untouched
- Video streaming, decoders, WebSocket multiplexer — untouched
- Client-side players — untouched
- Build system and feature flags — untouched
- WebSocket protocol — descriptor gains one new field, no structural change

---

## Files to Modify

| File | Change |
|------|--------|
| `src/types/Configuration.d.ts` | Add `AdbServerConfig` type and `adbServers` field to `Configuration` |
| `src/server/Config.ts` | Resolve `adbServers` with backward-compatible default |
| `src/server/goog-device/services/ControlCenter.ts` | Singleton → per-label registry; accept `AdbServerConfig` in constructor |
| `src/server/goog-device/Device.ts` | Accept `AdbServerConfig` in constructor; add `namespacedUdid`; fix `runShellCommandAdb` |
| `src/server/goog-device/AdbUtils.ts` | Add optional `adbServer?` param to all static methods |
| `src/server/index.ts` | Iterate `config.adbServers` when wiring up `ControlCenter` instances |
| `src/server/goog-device/mw/DeviceTracker.ts` | Subscribe to all `ControlCenter` instances; route commands by label prefix |
| `src/types/GoogDeviceDescriptor.d.ts` | Add `adbServerLabel` field |
| `config.example.yaml` | Document `adbServers` config option |

---

## Non-Goals

- Remote ADB servers on different hosts (host support is included in the type but the primary use case is localhost with different ports)
- iOS multi-tracker support
- Dynamic add/remove of ADB servers at runtime (requires restart)
- UI grouping by server label (devices just get a label prefix in the existing list)
