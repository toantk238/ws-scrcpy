import { TrackerChangeSet } from '@dead50f7/adbkit/lib/TrackerChangeSet';
import { Device } from '../Device';
import { Service } from '../../services/Service';
import AdbKitClient from '@dead50f7/adbkit/lib/adb/client';
import { AdbExtended } from '../adb';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import Tracker from '@dead50f7/adbkit/lib/adb/tracker';
import Timeout = NodeJS.Timeout;
import { BaseControlCenter } from '../../services/BaseControlCenter';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import * as os from 'os';
import * as crypto from 'crypto';
import { DeviceState } from '../../../common/DeviceState';
import { AdbServerConfig } from '../../../types/Configuration';

export class ControlCenter extends BaseControlCenter<GoogDeviceDescriptor> implements Service {
    private static readonly defaultWaitAfterError = 1000;
    private static instances = new Map<string, ControlCenter>();

    private initialized = false;
    private client: AdbKitClient;
    private tracker?: Tracker;
    private waitAfterError = 1000;
    private restartTimeoutId?: Timeout;
    private deviceMap: Map<string, Device> = new Map();
    private descriptors: Map<string, GoogDeviceDescriptor> = new Map();
    private readonly id: string;

    protected constructor(public readonly adbServer: AdbServerConfig) {
        super();
        this.client = AdbExtended.createClient({ host: adbServer.host, port: adbServer.port });
        const idString = `goog|${adbServer.label}|${os.hostname()}|${os.uptime()}`;
        this.id = crypto.createHash('md5').update(idString).digest('hex');
    }

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

    public static resolveSerial(namespacedUdid: string): { rawSerial: string; adbServer: AdbServerConfig } | undefined {
        const colonIdx = namespacedUdid.indexOf(':');
        if (colonIdx === -1) return undefined;
        const label = namespacedUdid.substring(0, colonIdx);
        const rawSerial = namespacedUdid.substring(colonIdx + 1);
        const instance = ControlCenter.instances.get(label);
        if (!instance) return undefined;
        return { rawSerial, adbServer: instance.adbServer };
    }

    private restartTracker = (): void => {
        if (this.restartTimeoutId) {
            return;
        }
        console.log(`Device tracker is down. Will try to restart in ${this.waitAfterError}ms`);
        this.restartTimeoutId = setTimeout(() => {
            this.stopTracker();
            this.waitAfterError *= 1.2;
            this.init();
        }, this.waitAfterError);
    };

    private onChangeSet = (changes: TrackerChangeSet): void => {
        this.waitAfterError = ControlCenter.defaultWaitAfterError;
        if (changes.added.length) {
            for (const item of changes.added) {
                const { id, type } = item;
                this.handleConnected(id, type);
            }
        }
        if (changes.removed.length) {
            for (const item of changes.removed) {
                const { id } = item;
                this.handleConnected(id, DeviceState.DISCONNECTED);
            }
        }
        if (changes.changed.length) {
            for (const item of changes.changed) {
                const { id, type } = item;
                this.handleConnected(id, type);
            }
        }
    };

    private onDeviceUpdate = (device: Device): void => {
        const { namespacedUdid, descriptor } = device;
        this.descriptors.set(namespacedUdid, descriptor);
        this.emit('device', descriptor);
    };

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

    public async init(): Promise<void> {
        if (this.initialized) {
            return;
        }
        this.tracker = await this.startTracker();
        const list = await this.client.listDevices();
        list.forEach((device) => {
            const { id, type } = device;
            this.handleConnected(id, type);
        });
        this.initialized = true;
    }

    private async startTracker(): Promise<Tracker> {
        if (this.tracker) {
            return this.tracker;
        }
        const tracker = await this.client.trackDevices();
        tracker.on('changeSet', this.onChangeSet);
        tracker.on('end', this.restartTracker);
        tracker.on('error', this.restartTracker);
        return tracker;
    }

    private stopTracker(): void {
        if (this.tracker) {
            this.tracker.off('changeSet', this.onChangeSet);
            this.tracker.off('end', this.restartTracker);
            this.tracker.off('error', this.restartTracker);
            this.tracker.end();
            this.tracker = undefined;
        }
        this.tracker = undefined;
        this.initialized = false;
    }

    public getDevices(): GoogDeviceDescriptor[] {
        return Array.from(this.descriptors.values());
    }

    public getDevice(udid: string): Device | undefined {
        return this.deviceMap.get(udid);
    }

    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return `Android Tracker [${this.adbServer.label}@${os.hostname()}]`;
    }

    public start(): Promise<void> {
        return this.init().catch((e) => {
            console.error(`Error: Failed to init "${this.getName()}". ${e.message}`);
        });
    }

    public release(): void {
        this.stopTracker();
    }

    public async runCommand(command: ControlCenterCommand): Promise<void> {
        const udid = command.getUdid();
        const device = this.getDevice(udid);
        if (!device) {
            console.error(`Device with udid:"${udid}" not found`);
            return;
        }
        const type = command.getType();
        switch (type) {
            case ControlCenterCommand.KILL_SERVER:
                await device.killServer(command.getPid());
                return;
            case ControlCenterCommand.START_SERVER:
                await device.startServer();
                return;
            case ControlCenterCommand.UPDATE_INTERFACES:
                await device.updateInterfaces();
                return;
            default:
                throw new Error(`Unsupported command: "${type}"`);
        }
    }
}
