# Multi-ADB Server Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow ws-scrcpy to track and control devices across multiple ADB servers on different ports by wiring a per-server `ControlCenter` instance and threading `AdbServerConfig` through device operations.

**Architecture:** Each configured ADB server gets its own `ControlCenter` instance (keyed by label), `Device` objects carry their server's `{host, port}`, and `AdbUtils` static methods accept an optional trailing `AdbServerConfig` parameter that defaults to the `ADB_HOST`/`ADB_PORT` env-var behaviour when absent. Device identifiers exposed to the browser become `label:rawSerial` (e.g. `lab-a:emulator-5554`), which the server parses back for routing.

**Tech Stack:** TypeScript, Node.js, adbkit (`@dead50f7/adbkit`), YAML config, Express/WS server.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/Configuration.d.ts` | Modify | Add `AdbServerConfig` type; add `adbServers?` to `Configuration` |
| `src/types/GoogDeviceDescriptor.d.ts` | Modify | Add `adbServerLabel` field |
| `src/server/Config.ts` | Modify | Resolve `adbServers` with backward-compat default |
| `src/server/goog-device/AdbUtils.ts` | Modify | Add optional `adbServer?` to all serial-based static methods |
| `src/server/goog-device/Device.ts` | Modify | Accept `AdbServerConfig` in constructor; add `namespacedUdid`; fix `runShellCommandAdb` |
| `src/server/goog-device/services/ControlCenter.ts` | Modify | Singleton → per-label registry; use `namespacedUdid` as map key; add `resolveSerial` helper |
| `src/server/goog-device/mw/DeviceTracker.ts` | Modify | Subscribe to all `ControlCenter` instances; route commands by label prefix |
| `src/server/goog-device/mw/WebsocketProxyOverAdb.ts` | Modify | Resolve raw serial + adbServer from namespaced udid before calling `AdbUtils.forward` |
| `src/server/goog-device/mw/FileListing.ts` | Modify | Resolve raw serial + adbServer before calling `AdbUtils.pipe*` methods |
| `src/server/goog-device/mw/RemoteDevtools.ts` | Modify | Resolve raw serial + adbServer before calling `AdbUtils.getRemoteDevtoolsInfo` |
| `src/server/index.ts` | Modify | Iterate `config.adbServers` to start one `ControlCenter` per server |
| `config.example.yaml` | Modify | Document the new `adbServers` config option |

---

## Task 1: Add Types

**Files:**
- Modify: `src/types/Configuration.d.ts`
- Modify: `src/types/GoogDeviceDescriptor.d.ts`

- [ ] **Step 1: Add `AdbServerConfig` and `adbServers` to Configuration.d.ts**

Open `src/types/Configuration.d.ts`. Add the new type before the `Configuration` interface, and add the field to `Configuration`:

```typescript
export interface AdbServerConfig {
    label: string;
    host?: string;
    port?: number;
}

// inside Configuration interface — add this line:
adbServers?: AdbServerConfig[];
```

The full updated `Configuration` interface:
```typescript
export interface Configuration {
    server?: ServerItem[];
    runApplTracker?: boolean;
    announceApplTracker?: boolean;
    runGoogTracker?: boolean;
    announceGoogTracker?: boolean;
    remoteHostList?: HostsItem[];
    adbServers?: AdbServerConfig[];
}
```

- [ ] **Step 2: Add `adbServerLabel` to GoogDeviceDescriptor.d.ts**

Open `src/types/GoogDeviceDescriptor.d.ts` and add one field to the interface:

```typescript
export default interface GoogDeviceDescriptor extends BaseDeviceDescriptor {
    'ro.build.version.release': string;
    'ro.build.version.sdk': string;
    'ro.product.cpu.abi': string;
    'ro.product.manufacturer': string;
    'ro.product.model': string;
    'wifi.interface': string;
    interfaces: NetInterface[];
    pid: number;
    wifiIpAddr: string;
    'last.update.timestamp': number;
    adbServerLabel: string;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npm run lint
```

Expected: no TypeScript errors in these two files. (Other files will warn about missing `adbServerLabel` in object literals — that is expected; they are fixed in later tasks.)

- [ ] **Step 4: Commit**

```bash
git add src/types/Configuration.d.ts src/types/GoogDeviceDescriptor.d.ts
git commit -m "feat(types): add AdbServerConfig and adbServerLabel for multi-ADB server support"
```

---

## Task 2: Update Config.ts

**Files:**
- Modify: `src/server/Config.ts`

- [ ] **Step 1: Import the new type**

At the top of `src/server/Config.ts`, update the import from `Configuration.d.ts`:

```typescript
import { AdbServerConfig, Configuration, HostItem, ServerItem } from '../types/Configuration';
```

- [ ] **Step 2: Add `adbServers` to `defaultConfig` and expose a getter**

In the `initConfig` private static method, the `defaultConfig` object is built around line 35. Add `adbServers` to it:

```typescript
const defaultAdbServer: AdbServerConfig = {
    label: 'default',
    host: process.env.ADB_HOST || '127.0.0.1',
    port: parseInt(process.env.ADB_PORT || '5037', 10),
};
const defaultConfig: Required<Configuration> = {
    runGoogTracker,
    runApplTracker,
    announceGoogTracker,
    announceApplTracker,
    server,
    remoteHostList: [],
    adbServers: [defaultAdbServer],
};
```

The `Object.assign({}, defaultConfig, userConfig)` merge that follows will replace `adbServers` with the user-provided value when present, or keep the default single-entry list otherwise.

- [ ] **Step 3: Add public getter**

At the bottom of the `Config` class (near the other getters), add:

```typescript
public get adbServers(): AdbServerConfig[] {
    return this.fullConfig.adbServers;
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run lint
git add src/server/Config.ts
git commit -m "feat(config): resolve adbServers list with backward-compatible default"
```

---

## Task 3: Thread `adbServer?` Through AdbUtils

**Files:**
- Modify: `src/server/goog-device/AdbUtils.ts`

`AdbUtils` has 13 public static methods that call `AdbExtended.createClient()`. Add an optional `adbServer?: AdbServerConfig` trailing parameter to each. When absent, `AdbExtended.createClient({})` falls through to the `ADB_HOST`/`ADB_PORT` env-var defaults — identical to today.

- [ ] **Step 1: Add the import**

At the top of `AdbUtils.ts`, add:
```typescript
import { AdbServerConfig } from '../../types/Configuration';
```

- [ ] **Step 2: Update `push`**

```typescript
public static async push(serial: string, stream: ReadStream, pathString: string, adbServer?: AdbServerConfig): Promise<PushTransfer> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 3: Update `stats`**

```typescript
public static async stats(serial: string, pathString: string, stats?: Stats, deep = 0, adbServer?: AdbServerConfig): Promise<Stats> {
    if (!stats || (stats.isSymbolicLink() && pathString.endsWith('/'))) {
        const client = AdbExtended.createClient(adbServer ?? {});
```

Also update the recursive call inside `stats` to pass `adbServer`:
```typescript
stats = await this.stats(serial, pathString, stats, deep++, adbServer);
```

- [ ] **Step 4: Update `readdir`**

```typescript
public static async readdir(serial: string, pathString: string, adbServer?: AdbServerConfig): Promise<FileStats[]> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 5: Update `pipePullFile`**

```typescript
public static async pipePullFile(serial: string, pathString: string, adbServer?: AdbServerConfig): Promise<PullTransfer> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 6: Update `pipeStatToStream`, `pipeReadDirToStream`, `pipePullFileToStream`**

These three delegate to `stats`, `readdir`, and `pipePullFile` respectively, passing `serial` and `pathString`. Add `adbServer?` to each and thread it through:

```typescript
public static async pipeStatToStream(serial: string, pathString: string, stream: Multiplexer, adbServer?: AdbServerConfig): Promise<void> {
    // ...existing body...
    // change the internal call to pass adbServer, e.g.:
    const stats = await AdbUtils.stats(serial, pathString, undefined, 0, adbServer);
```

```typescript
public static async pipeReadDirToStream(serial: string, pathString: string, stream: Multiplexer, adbServer?: AdbServerConfig): Promise<void> {
    // ...
    const entries = await AdbUtils.readdir(serial, pathString, adbServer);
```

```typescript
public static async pipePullFileToStream(serial: string, pathString: string, stream: Multiplexer, adbServer?: AdbServerConfig): Promise<void> {
    // ...
    const transfer = await AdbUtils.pipePullFile(serial, pathString, adbServer);
```

- [ ] **Step 7: Update `forward`**

```typescript
public static async forward(serial: string, remote: string, adbServer?: AdbServerConfig): Promise<number> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 8: Update `getDevtoolsRemoteList`**

```typescript
public static async getDevtoolsRemoteList(serial: string, adbServer?: AdbServerConfig): Promise<string[]> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 9: Update `getRemoteDevtoolsVersion` and `getRemoteDevtoolsTargets`**

These make HTTP calls via a previously-forwarded localhost port. They do NOT call `AdbExtended.createClient()` directly. Add `adbServer?` to their signatures for forward-compatibility and thread it to any `getDevtoolsRemoteList` or `forward` calls inside:

```typescript
public static async getRemoteDevtoolsVersion(
    serial: string,
    port: number,
    adbServer?: AdbServerConfig,
): Promise<VersionMetadata> {
    // find the internal call to getDevtoolsRemoteList or forward and pass adbServer
    // e.g.: await AdbUtils.getDevtoolsRemoteList(serial, adbServer)
```

```typescript
public static async getRemoteDevtoolsTargets(
    serial: string,
    port: number,
    adbServer?: AdbServerConfig,
): Promise<RemoteTarget[]> {
    // same pattern — pass adbServer to any inner AdbUtils calls
```

Read the existing bodies of these methods to confirm the actual parameter names and inner calls, then apply the same `adbServer?` threading pattern.

- [ ] **Step 10: Update `getRemoteDevtoolsInfo`**

This method calls `AdbUtils.forward` internally to set up the port forward. Add `adbServer?` and thread it:

```typescript
public static async getRemoteDevtoolsInfo(host: string, serial: string, adbServer?: AdbServerConfig): Promise<DevtoolsInfo> {
    // inside the body, find: AdbUtils.forward(serial, remote)
    // change to: AdbUtils.forward(serial, remote, adbServer)
    // also thread adbServer to getRemoteDevtoolsVersion and getRemoteDevtoolsTargets calls
```

Read the existing body of `getRemoteDevtoolsInfo` (lines 313–362 of `AdbUtils.ts`) to confirm exact call sites, then apply the pattern above.

- [ ] **Step 11: Update `getDeviceName`**

```typescript
public static async getDeviceName(serial: string, adbServer?: AdbServerConfig): Promise<string> {
    const client = AdbExtended.createClient(adbServer ?? {});
```

- [ ] **Step 12: Verify and commit**

```bash
npm run lint
git add src/server/goog-device/AdbUtils.ts
git commit -m "feat(adb-utils): add optional adbServer param to all serial-based static methods"
```

---

## Task 4: Update Device

**Files:**
- Modify: `src/server/goog-device/Device.ts`

- [ ] **Step 1: Import `AdbServerConfig`**

```typescript
import { AdbServerConfig } from '../../types/Configuration';
```

- [ ] **Step 2: Update constructor signature**

Change:
```typescript
constructor(public readonly udid: string, state: string) {
```
To:
```typescript
constructor(
    public readonly udid: string,
    state: string,
    public readonly adbServer: AdbServerConfig,
) {
```

- [ ] **Step 3: Update client creation in constructor**

Change:
```typescript
this.client = AdbExtended.createClient();
```
To:
```typescript
this.client = AdbExtended.createClient({ host: adbServer.host, port: adbServer.port });
```

- [ ] **Step 4: Add `namespacedUdid` getter**

Add this getter after the class fields:
```typescript
public get namespacedUdid(): string {
    return `${this.adbServer.label}:${this.udid}`;
}
```

- [ ] **Step 5: Set `descriptor.udid` to `namespacedUdid`**

In the constructor, the descriptor is initialized with `udid`. Change the `udid` field in the descriptor literal to use `namespacedUdid`. Since the getter is defined after construction, use `${adbServer.label}:${udid}` directly:

```typescript
this.descriptor = {
    udid: `${adbServer.label}:${udid}`,
    state: 'unknown',
    'ro.build.version.release': '',
    'ro.build.version.sdk': '',
    'ro.product.manufacturer': '',
    'ro.product.model': '',
    'ro.product.cpu.abi': '',
    'last.update.timestamp': 0,
    adbServerLabel: adbServer.label,
};
```

- [ ] **Step 6: Fix `runShellCommandAdb` to inject `-H`/`-P` flags**

Find the `runShellCommandAdb` method (around line 101). Change:
```typescript
const args = ['-s', `${this.udid}`, 'shell', command];
```
To:
```typescript
const args = [
    '-H', this.adbServer.host ?? '127.0.0.1',
    '-P', String(this.adbServer.port ?? 5037),
    '-s', this.udid,
    'shell', command,
];
```

- [ ] **Step 7: Verify and commit**

```bash
npm run lint
git add src/server/goog-device/Device.ts
git commit -m "feat(device): carry AdbServerConfig, expose namespacedUdid, fix runShellCommandAdb host/port"
```

---

## Task 5: Refactor ControlCenter

**Files:**
- Modify: `src/server/goog-device/services/ControlCenter.ts`

- [ ] **Step 1: Import `AdbServerConfig`**

```typescript
import { AdbServerConfig } from '../../../types/Configuration';
```

- [ ] **Step 2: Replace singleton with per-label registry**

Replace:
```typescript
private static instance?: ControlCenter;
```
With:
```typescript
private static instances = new Map<string, ControlCenter>();
```

- [ ] **Step 3: Update static factory methods**

Replace `getInstance()` and `hasInstance()`:

```typescript
public static getInstance(label: string): ControlCenter | undefined {
    return this.instances.get(label);
}

public static register(adbServer: AdbServerConfig): ControlCenter {
    if (!this.instances.has(adbServer.label)) {
        this.instances.set(adbServer.label, new ControlCenter(adbServer));
    }
    return this.instances.get(adbServer.label)!;
}

public static getAllInstances(): ControlCenter[] {
    return Array.from(this.instances.values());
}

public static hasInstance(label?: string): boolean {
    if (label) return this.instances.has(label);
    return this.instances.size > 0;
}
```

- [ ] **Step 4: Update constructor to accept `AdbServerConfig`**

Replace:
```typescript
private initialized = false;
private client: AdbKitClient = AdbExtended.createClient();
...
protected constructor() {
    super();
    const idString = `goog|${os.hostname()}|${os.uptime()}`;
    this.id = crypto.createHash('md5').update(idString).digest('hex');
}
```
With:
```typescript
private initialized = false;
private client: AdbKitClient;
...
protected constructor(public readonly adbServer: AdbServerConfig) {
    super();
    this.client = AdbExtended.createClient({ host: adbServer.host, port: adbServer.port });
    const idString = `goog|${adbServer.label}|${os.hostname()}|${os.uptime()}`;
    this.id = crypto.createHash('md5').update(idString).digest('hex');
}
```

- [ ] **Step 5: Update `getName()` to include the server label**

```typescript
public getName(): string {
    return `Android Tracker [${this.adbServer.label}@${os.hostname()}]`;
}
```

- [ ] **Step 6: Update `handleConnected` to create Device with `adbServer`**

Change:
```typescript
device = new Device(udid, state);
device.on('update', this.onDeviceUpdate);
this.deviceMap.set(udid, device);
```
To:
```typescript
device = new Device(udid, state, this.adbServer);
device.on('update', this.onDeviceUpdate);
this.deviceMap.set(device.namespacedUdid, device);
```

Also update the disconnect case:
```typescript
// In the removal branch — replace this.deviceMap.set / delete with namespacedUdid
device = this.deviceMap.get(/* need namespacedUdid */);
```

The `handleConnected` receives the raw `udid` from adbkit. Compute `namespacedUdid` at the top of the method:
```typescript
private handleConnected(rawUdid: string, state: string): void {
    const namespacedUdid = `${this.adbServer.label}:${rawUdid}`;
    let device = this.deviceMap.get(namespacedUdid);
    if (!device) {
        device = new Device(rawUdid, state, this.adbServer);
        device.on('update', this.onDeviceUpdate);
        this.deviceMap.set(namespacedUdid, device);
    } else {
        device.setState(state);
    }
}
```

- [ ] **Step 7: Update `onDeviceUpdate` to use `namespacedUdid`**

Change:
```typescript
private onDeviceUpdate = (device: Device): void => {
    const { udid, descriptor } = device;
    this.descriptors.set(udid, descriptor);
```
To:
```typescript
private onDeviceUpdate = (device: Device): void => {
    const { namespacedUdid, descriptor } = device;
    this.descriptors.set(namespacedUdid, descriptor);
```

- [ ] **Step 8: Add `resolveSerial` static helper**

This helper is used by middleware to get the raw ADB serial and server config from a `namespacedUdid`:

```typescript
public static resolveSerial(namespacedUdid: string): { rawSerial: string; adbServer: AdbServerConfig } | undefined {
    const colonIdx = namespacedUdid.indexOf(':');
    if (colonIdx === -1) return undefined;
    const label = namespacedUdid.substring(0, colonIdx);
    const rawSerial = namespacedUdid.substring(colonIdx + 1);
    const instance = ControlCenter.instances.get(label);
    if (!instance) return undefined;
    return { rawSerial, adbServer: instance.adbServer };
}
```

- [ ] **Step 9: Verify and commit**

```bash
npm run lint
git add src/server/goog-device/services/ControlCenter.ts
git commit -m "feat(control-center): refactor to per-label registry, use namespacedUdid as device key"
```

---

## Task 6: Update DeviceTracker Middleware

**Files:**
- Modify: `src/server/goog-device/mw/DeviceTracker.ts`

- [ ] **Step 1: Replace single `adt` with array of all instances**

Change:
```typescript
private adt: ControlCenter = ControlCenter.getInstance();
private readonly id: string;
```
To:
```typescript
private adts: ControlCenter[] = ControlCenter.getAllInstances();
```

Remove the `this.id` field — each center has its own id, used when sending events.

- [ ] **Step 2: Update constructor to subscribe to all instances**

Replace the constructor body with:
```typescript
constructor(ws: WS | Multiplexer) {
    super(ws);
    Promise.all(this.adts.map((adt) => adt.init()))
        .then(() => {
            this.adts.forEach((adt) => adt.on('device', this.sendDeviceMessage.bind(this, adt)));
            const allDevices = this.adts.flatMap((adt) => adt.getDevices());
            this.buildAndSendMessage(allDevices);
        })
        .catch((error: Error) => {
            console.error(`[${DeviceTracker.TAG}] Error: ${error.message}`);
        });
}
```

- [ ] **Step 3: Update `sendDeviceMessage` to use the per-center id and name**

Change the signature to accept the center reference:
```typescript
private sendDeviceMessage = (adt: ControlCenter, device: GoogDeviceDescriptor): void => {
    const data: DeviceTrackerEvent<GoogDeviceDescriptor> = {
        device,
        id: adt.getId(),
        name: adt.getName(),
    };
    ...
};
```

Update `buildAndSendMessage` similarly — the list message uses the id/name of all trackers. For the initial list, use the id/name of the first tracker (or iterate and send one list per tracker):
```typescript
private buildAndSendMessage(devices: GoogDeviceDescriptor[]): void {
    const firstAdt = this.adts[0];
    const data: DeviceTrackerEventList<GoogDeviceDescriptor> = {
        list: devices,
        id: firstAdt?.getId() ?? '',
        name: firstAdt?.getName() ?? '',
    };
    this.sendMessage({
        id: 0,
        type: 'devicelist',
        data,
    });
}
```

- [ ] **Step 4: Update `onSocketMessage` to route commands by label prefix**

Change:
```typescript
this.adt.runCommand(command).catch(...)
```
To:
```typescript
const udid = command.getUdid();
const colonIdx = udid.indexOf(':');
const label = colonIdx !== -1 ? udid.substring(0, colonIdx) : this.adts[0]?.adbServer.label ?? '';
const adt = ControlCenter.getInstance(label);
adt?.runCommand(command).catch((e: Error) => {
    console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${e.message}`);
});
```

- [ ] **Step 5: Update `release` to unsubscribe from all instances**

Change:
```typescript
public release(): void {
    super.release();
    this.adt.off('device', this.sendDeviceMessage);
}
```
To:
```typescript
public release(): void {
    super.release();
    this.adts.forEach((adt) => adt.off('device', this.sendDeviceMessage as any));
}
```

- [ ] **Step 6: Verify and commit**

```bash
npm run lint
git add src/server/goog-device/mw/DeviceTracker.ts
git commit -m "feat(device-tracker): subscribe to all ControlCenter instances, route commands by label"
```

---

## Task 7: Update AdbUtils Callers in Middleware

**Files:**
- Modify: `src/server/goog-device/mw/WebsocketProxyOverAdb.ts`
- Modify: `src/server/goog-device/mw/FileListing.ts`
- Modify: `src/server/goog-device/mw/RemoteDevtools.ts`

All three receive a `namespacedUdid` (or `serial`) from the browser. They must call `ControlCenter.resolveSerial()` to split it into `rawSerial` and `adbServer`, then pass both to `AdbUtils`.

- [ ] **Step 1: Update `WebsocketProxyOverAdb.ts`**

Add import at top:
```typescript
import { ControlCenter } from '../services/ControlCenter';
```

In `createProxyOverAdb` (around line 49), before the `AdbUtils.forward(udid, remote)` call:
```typescript
public static createProxyOverAdb(ws: WS, udid: string, remote: string, path?: string | null): WebsocketProxy {
    const resolved = ControlCenter.resolveSerial(udid);
    if (!resolved) {
        ws.close(4003, `[${WebsocketProxyOverAdb.TAG}] Unknown device "${udid}"`);
        return new WebsocketProxy(ws);
    }
    AdbUtils.forward(resolved.rawSerial, remote, resolved.adbServer)
```

- [ ] **Step 2: Update `FileListing.ts`**

Add import at top:
```typescript
import { ControlCenter } from '../services/ControlCenter';
```

In the `handle` static method (around line 72), resolve before AdbUtils calls:
```typescript
private static async handle(cmd: string, serial: string, pathString: string, channel: Multiplexer): Promise<void> {
    const resolved = ControlCenter.resolveSerial(serial);
    const rawSerial = resolved?.rawSerial ?? serial;
    const adbServer = resolved?.adbServer;
    switch (cmd) {
        case 'stat':
            return AdbUtils.pipeStatToStream(rawSerial, pathString, channel, adbServer);
        case 'readdir':
            return AdbUtils.pipeReadDirToStream(rawSerial, pathString, channel, adbServer);
        case 'pull':
            return AdbUtils.pipePullFileToStream(rawSerial, pathString, channel, adbServer);
        ...
    }
}
```

- [ ] **Step 3: Update `RemoteDevtools.ts`**

Add import at top:
```typescript
import { ControlCenter } from '../services/ControlCenter';
```

In the constructor or wherever `AdbUtils.getRemoteDevtoolsInfo` is called (around line 44), resolve before the call:
```typescript
const resolved = ControlCenter.resolveSerial(this.udid);
const rawUdid = resolved?.rawSerial ?? this.udid;
const adbServer = resolved?.adbServer;
AdbUtils.getRemoteDevtoolsInfo(this.host, rawUdid, adbServer)
```

- [ ] **Step 4: Verify and commit**

```bash
npm run lint
git add src/server/goog-device/mw/WebsocketProxyOverAdb.ts \
        src/server/goog-device/mw/FileListing.ts \
        src/server/goog-device/mw/RemoteDevtools.ts
git commit -m "feat(middleware): resolve namespacedUdid to raw serial + adbServer before AdbUtils calls"
```

---

## Task 8: Wire Multiple Instances in index.ts

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Update `loadGoogModules` to iterate `config.adbServers`**

Find the `loadGoogModules` function. Currently it has:
```typescript
servicesToStart.push(ControlCenter);
```

Replace the ControlCenter wiring block with:
```typescript
// Register one ControlCenter per configured ADB server
for (const adbServer of config.adbServers) {
    const center = ControlCenter.register(adbServer);
    runningServices.push(center);
}
```

Remove `servicesToStart.push(ControlCenter)` — the services are now pushed directly as instances rather than classes. If `servicesToStart` holds class references and calls `getInstance()` on them, adapt accordingly:

If the existing pattern is `serviceClass.getInstance().start()`, change to explicit `.start()` calls:
```typescript
for (const adbServer of config.adbServers) {
    const center = ControlCenter.register(adbServer);
    center.start().catch((e: Error) => {
        console.error(`Error: Failed to init "${center.getName()}". ${e.message}`);
    });
}
```

- [ ] **Step 2: Verify and commit**

```bash
npm run lint
git add src/server/index.ts
git commit -m "feat(server): start one ControlCenter instance per configured ADB server"
```

---

## Task 9: Update config.example.yaml

**Files:**
- Modify: `config.example.yaml`

- [ ] **Step 1: Add `adbServers` section**

Open `config.example.yaml` and add a documented example near the top (after the server section):

```yaml
# ADB server connections. Each entry starts one Android device tracker.
# label: identifier used to namespace device serials (e.g. "lab-a:emulator-5554")
# port:  ADB daemon port (default: 5037)
# host:  ADB daemon host (default: 127.0.0.1)
# If omitted, a single default server is used (127.0.0.1:5037 or ADB_HOST/ADB_PORT env vars).
#adbServers:
#  - label: "lab-a"
#    port: 5037
#  - label: "lab-b"
#    port: 5038
```

- [ ] **Step 2: Commit**

```bash
git add config.example.yaml
git commit -m "docs(config): document adbServers config option in example file"
```

---

## Task 10: Full Build Verification

- [ ] **Step 1: Run full dev build**

```bash
npm run dist:dev
```

Expected: webpack compiles without TypeScript errors. Fix any remaining type errors before continuing.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 3: Manual smoke test — single server (backward compat)**

Start the server with no `adbServers` in config:
```bash
npm start
```

Connect an Android device via USB. Open the browser UI. Confirm the device appears and can be mirrored. The device's identifier in the UI will be `default:SERIAL`.

- [ ] **Step 4: Manual smoke test — two servers**

Start two ADB daemons on different ports:
```bash
adb -P 5037 start-server
adb -P 5038 start-server
```

Create a test config file:
```yaml
adbServers:
  - label: "lab-a"
    port: 5037
  - label: "lab-b"
    port: 5038
```

Start with the config:
```bash
WS_SCRCPY_CONFIG=./test-multi.yaml npm start
```

Confirm both device lists appear in the UI with `lab-a:` and `lab-b:` prefixes.

- [ ] **Step 5: Final commit if any build fixes were needed**

```bash
git add -p
git commit -m "fix: address compilation issues from multi-ADB server integration"
```
