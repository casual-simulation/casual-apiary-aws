import { fromByteArray, toByteArray } from 'base64-js';
import {
    decode,
    encode,
    getCurrentSequenceNumber,
    getStartSequenceNumber,
    isFinalMessage,
    isPartialMessage,
} from './BinaryEncoder';
import { sortBy } from 'lodash';

export const BASE_64_OVERHEAD = 1 / 3;
export const MAX_MESSAGE_SIZE = 128_000;

/**
 * Defines a class that is able to decode websocket message events that use the binary encoder format as they arrive.
 */
export class AwsSocketHandler {
    private _maxMessageSize: number;

    constructor(maxMessageSize: number) {
        this._maxMessageSize = Math.floor(
            maxMessageSize - maxMessageSize * BASE_64_OVERHEAD
        );
    }

    /**
     * Encodes the given string data into a format that is suitable to send over the wire to AWS.
     * @param data The data to send.
     */
    encode(data: string, startSequenceNumber: number): string[] {
        const encoded = encode(data, this._maxMessageSize, startSequenceNumber);

        if (Array.isArray(encoded)) {
            let messages = [] as string[];
            for (let message of encoded) {
                const final = fromByteArray(message);
                messages.push(final);
            }

            return messages;
        } else {
            const final = fromByteArray(encoded);
            return [final];
        }
    }
}

export interface WebSocketMessage {
    data: any;
}
