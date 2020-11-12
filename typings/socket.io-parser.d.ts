declare module 'socket.io-parser' {
    export const CONNECT = 0;
    export const DISCONNECT = 1;
    export const EVENT = 2;
    export const ACK = 3;
    export const ERROR = 4;
    export const BINARY_EVENT = 5;
    export const BINARY_ACK = 6;

    export type PacketType =
        | typeof CONNECT
        | typeof DISCONNECT
        | typeof EVENT
        | typeof ACK
        | typeof ERROR
        | typeof BINARY_EVENT
        | typeof BINARY_ACK;

    export interface PacketBase {
        type: number;
        nsp: string;
    }

    export interface ConnectPacket extends PacketBase {
        type: typeof CONNECT;
    }

    export interface DisconnectPacket extends PacketBase {
        type: typeof DISCONNECT;
    }

    export interface EventPacket extends PacketBase {
        type: typeof EVENT;
        data: any;
        id?: number;
    }

    export interface AckPacket extends PacketBase {
        type: typeof ACK;
        data: any;
        id: number;
    }

    export interface ErrorPacket extends PacketBase {
        type: typeof ERROR;
        data?: any;
    }

    export interface BinaryEventPacket extends PacketBase {
        type: typeof BINARY_EVENT;
        data: any;
        id?: number;
    }

    export interface BinaryAckPacket extends PacketBase {
        type: typeof BINARY_ACK;
        data: any;
        id: number;
    }

    export type Packet =
        | ConnectPacket
        | DisconnectPacket
        | EventPacket
        | AckPacket
        | ErrorPacket
        | BinaryEventPacket
        | BinaryAckPacket;

    export class Encoder {
        encode(packet: Packet, callback: (packets: [string]) => void): void;
    }

    export class Decoder {
        on(eventName: 'decoded', callback: (packet: Packet) => void): void;
        add(packet: string): void;
    }
}
