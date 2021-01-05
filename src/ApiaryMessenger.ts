import {
    AddAtomsEvent,
    ADD_ATOMS,
    AtomsReceivedEvent,
    ATOMS_RECEIVED,
    ConnectedToBranchEvent,
    DEVICE_CONNECTED_TO_BRANCH,
    DEVICE_DISCONNECTED_FROM_BRANCH,
    DisconnectedFromBranchEvent,
    ReceiveDeviceActionEvent,
    RECEIVE_EVENT,
    SendRemoteActionEvent,
    SEND_EVENT,
    UNWATCH_BRANCH,
    UNWATCH_BRANCH_DEVICES,
    WatchBranchEvent,
    WATCH_BRANCH,
    WATCH_BRANCH_DEVICES,
} from '@casual-simulation/causal-trees';
import { Packet } from './Events';

/**
 * The name of the event which gets the number of devices.
 */
export const DEVICE_COUNT = 'repo/device_count';

/**
 * Defines an interface that is capable of sending messages to connections.
 */
export interface ApiaryMessenger {
    /**
     * Sends the given data to the given connection IDs.
     * @param connectionIds The IDs of the connections.
     * @param data The data that should be sent.
     * @param excludeConnection The connection ID that should be skipped.
     */
    sendMessage(
        connectionIds: string[],
        data: Message,
        excludeConnection?: string
    ): Promise<void>;

    sendPacket?(connectionId: string, packet: Packet): Promise<void>;
    sendRaw?(connectionId: string, data: string): Promise<void>;
}

export type Message =
    | WatchBranchMessage
    | AddAtomsMessage
    | AtomsReceivedMessage
    | ReceiveMessageMessage
    | DeviceConnectedToBranchMessage
    | DeviceDisconnectedFromBranchMessage
    | UnwatchBranchMessage
    | SendEventMessage
    | WatchBranchDevicesMessage
    | UnatchBranchDevicesMessage
    | DeviceCountMessage;

export interface WatchBranchMessage {
    name: typeof WATCH_BRANCH;
    data: WatchBranchEvent;
}

export interface AddAtomsMessage {
    name: typeof ADD_ATOMS;
    data: AddAtomsEvent;
}

export interface AtomsReceivedMessage {
    name: typeof ATOMS_RECEIVED;
    data: AtomsReceivedEvent;
}
export interface ReceiveMessageMessage {
    name: typeof RECEIVE_EVENT;
    data: ReceiveDeviceActionEvent;
}

export interface DeviceConnectedToBranchMessage {
    name: typeof DEVICE_CONNECTED_TO_BRANCH;
    data: ConnectedToBranchEvent;
}

export interface DeviceDisconnectedFromBranchMessage {
    name: typeof DEVICE_DISCONNECTED_FROM_BRANCH;
    data: DisconnectedFromBranchEvent;
}

export interface UnwatchBranchMessage {
    name: typeof UNWATCH_BRANCH;
    data: string;
}

export interface SendEventMessage {
    name: typeof SEND_EVENT;
    data: SendRemoteActionEvent;
}

export interface WatchBranchDevicesMessage {
    name: typeof WATCH_BRANCH_DEVICES;
    data: string;
}

export interface UnatchBranchDevicesMessage {
    name: typeof UNWATCH_BRANCH_DEVICES;
    data: string;
}

export interface DeviceCountMessage {
    name: typeof DEVICE_COUNT;
    data: {
        branch: string;
        count: number;
    };
}
