import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { ControlCenter } from '../services/ControlCenter';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { DeviceTrackerEvent } from '../../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../../types/DeviceTrackerEventList';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';
import { ChannelCode } from '../../../common/ChannelCode';

export class DeviceTracker extends Mw {
    public static readonly TAG = 'DeviceTracker';
    public static readonly type = 'android';
    private adts: ControlCenter[] = ControlCenter.getAllInstances();
    private adtHandlers: Map<ControlCenter, (device: GoogDeviceDescriptor) => void> = new Map();

    public static processChannel(ws: Multiplexer, code: string): Mw | undefined {
        if (code !== ChannelCode.GTRC) {
            return;
        }
        return new DeviceTracker(ws);
    }

    public static processRequest(ws: WS, params: RequestParameters): DeviceTracker | undefined {
        if (params.action !== ACTION.GOOG_DEVICE_LIST) {
            return;
        }
        return new DeviceTracker(ws);
    }

    constructor(ws: WS | Multiplexer) {
        super(ws);
        Promise.all(this.adts.map((adt) => adt.init()))
            .then(() => {
                this.adts.forEach((adt) => {
                    const handler = (device: GoogDeviceDescriptor) => this.sendDeviceMessage(adt, device);
                    this.adtHandlers.set(adt, handler);
                    adt.on('device', handler);
                });
                const allDevices = this.adts.flatMap((adt) => adt.getDevices());
                this.buildAndSendMessage(allDevices);
            })
            .catch((error: Error) => {
                console.error(`[${DeviceTracker.TAG}] Error: ${error.message}`);
            });
    }

    private sendDeviceMessage = (adt: ControlCenter, device: GoogDeviceDescriptor): void => {
        const data: DeviceTrackerEvent<GoogDeviceDescriptor> = {
            device,
            id: adt.getId(),
            name: adt.getName(),
        };
        this.sendMessage({
            id: 0,
            type: 'deviceevent',
            data,
        });
    };

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

    protected onSocketMessage(event: WS.MessageEvent): void {
        let command: ControlCenterCommand;
        try {
            command = ControlCenterCommand.fromJSON(event.data.toString());
        } catch (error: any) {
            console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${error?.message}`);
            return;
        }
        const udid = command.getUdid();
        const colonIdx = udid.indexOf(':');
        const label = colonIdx !== -1 ? udid.substring(0, colonIdx) : this.adts[0]?.adbServer.label ?? '';
        const adt = ControlCenter.getInstance(label);
        adt?.runCommand(command).catch((e: Error) => {
            console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${e.message}`);
        });
    }

    public release(): void {
        super.release();
        this.adtHandlers.forEach((handler, adt) => {
            adt.off('device', handler);
        });
        this.adtHandlers.clear();
    }
}
