import {
    AddAtomsEvent,
    ADD_ATOMS,
    AtomsReceivedEvent,
    ATOMS_RECEIVED,
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
     */
    sendMessage(connectionIds: string[], data: Message): Promise<void>;
}

export type Message =
    | WatchBranchMessage
    | AddAtomsMessage
    | AtomsReceivedMessage;

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