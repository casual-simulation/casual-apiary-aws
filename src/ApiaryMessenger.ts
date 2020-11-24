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
    WatchBranchEvent,
    WATCH_BRANCH,
} from '@casual-simulation/causal-trees';

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
}

export type Message =
    | WatchBranchMessage
    | AddAtomsMessage
    | AtomsReceivedMessage
    | ReceiveMessageMessage
    | DeviceConnectedToBranchMessage
    | DeviceDisconnectedFromBranchMessage;

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
