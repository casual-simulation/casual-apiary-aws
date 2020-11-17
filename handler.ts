import 'source-map-support/register';
import {
    APIGatewayProxyEvent,
    APIGatewayProxyHandler,
    APIGatewayProxyResult,
    APIGatewayProxyResultV2,
    APIGatewayProxyStructuredResultV2,
    Context,
} from 'aws-lambda';
import AWS, { ApiGatewayManagementApi } from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import {
    Atom,
    atom,
    atomId,
    atomIdToString,
} from '@casual-simulation/causal-trees';
import { bot } from '@casual-simulation/aux-common/aux-format-2';
import { LoginPacket, LoginResultPacket, Packet } from './src/Events';
import { getDocumentClient } from './src/Utils';
import { fromByteArray, toByteArray } from 'base64-js';
import {
    decode,
    encode,
    getCurrentSequenceNumber,
    getStartSequenceNumber,
    getTotalMessageCount,
    isPartialMessage,
} from './src/BinaryEncoder';
import { add } from 'lodash';
import { AwsSocketHandler, MAX_MESSAGE_SIZE } from './src/AwsSocketHandler';

export const hello: APIGatewayProxyHandler = async (event, _context) => {
    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                message:
                    'Go Serverless Webpack (Typescript) v1.0! Your function executed successfully!',
                input: event,
            },
            null,
            2
        ),
    };
};

const ATOMS_TABLE_NAME = 'AtomsTable';
const MESSAGES_TABLE_NAME = 'MessagesTable';
const DEFAULT_NAMESPACE = 'auxplayer.com@test-story';

interface DynamoAtom {
    namespace: string;
    atomId: string;
    atomJson: string;
}

export async function write(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    const client = getDocumentClient();
    const botAtom = atom(atomId(uuid(), 1), null, bot(uuid()));
    const item = formatAtom(DEFAULT_NAMESPACE, botAtom);

    const data = await client
        .put({
            TableName: ATOMS_TABLE_NAME,
            Item: item,
        })
        .promise();

    return {
        statusCode: 200,
    };
}

export async function read(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    const client = getDocumentClient();
    let result = await client
        .query({
            TableName: ATOMS_TABLE_NAME,
            ProjectionExpression: 'atomJson',
            KeyConditionExpression: 'namespace = :namespace',
            ExpressionAttributeValues: {
                ':namespace': DEFAULT_NAMESPACE,
            },
        })
        .promise();

    let atoms = [] as Atom<any>[];
    while (result?.$response.data) {
        for (let item of result.$response.data.Items) {
            const atom = JSON.parse(item.atomJson);
            atoms.push(atom);
        }

        if (result.$response.hasNextPage()) {
            const request = result.$response.nextPage();
            if (request) {
                result = await request.promise();
                continue;
            }
        }
        result = null;
    }

    return {
        statusCode: 200,
        body: JSON.stringify(atoms),
    };
}

export async function connect(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    console.log(
        `Got WebSocket connection: ${event.requestContext.connectionId}`
    );

    return {
        statusCode: 200,
    };
}

export async function disconnect(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    console.log(
        `Got WebSocket disconnect: ${event.requestContext.connectionId}`
    );
    return {
        statusCode: 200,
    };
}

export async function message(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    console.log(
        `Got WebSocket message from ${event.requestContext.connectionId}`,
        event.body
    );

    let data: Uint8Array;
    try {
        data = toByteArray(event.body);
    } catch (ex) {
        // Not base64 data so we can handle the message immediately
        return event;
    }

    if (isPartialMessage(data)) {
        const connectionId = event.requestContext.connectionId;
        const view = new DataView(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
        const startSequenceNumber = getStartSequenceNumber(view);
        const totalMessageCount = getTotalMessageCount(view);
        const endSequenceNumber = startSequenceNumber + totalMessageCount;
        const sequenceNumber = getCurrentSequenceNumber(view);
        const messageCount = await countCurrentPackets(
            connectionId,
            startSequenceNumber,
            endSequenceNumber
        );

        if (messageCount >= totalMessageCount) {
            const currentItems = await getCurrentPackets(
                connectionId,
                startSequenceNumber,
                endSequenceNumber
            );

            let datas = [] as Uint8Array[];
            let addedCurrentMessage = false;
            for (let i = 0; i < currentItems.length; i++) {
                const item = currentItems[i];

                if (
                    !addedCurrentMessage &&
                    item.sequenceNumber > sequenceNumber
                ) {
                    addedCurrentMessage = true;
                    datas.push(data);
                }

                datas.push(toByteArray(item.data));
            }

            const decoded = decode(datas);
            await processMessage(event, decoded);
        } else {
            await savePacket({
                connectionId: connectionId,
                sequenceNumber: sequenceNumber,
                data: fromByteArray(data),
            });
        }
    } else {
        const decoded = decode(data);
        await processMessage(event, decoded);
    }

    return {
        statusCode: 200,
    };
}

async function processMessage(event: APIGatewayProxyEvent, message: string) {
    console.log('Got Message: ', message);

    const packet = parsePacket(message);

    if (packet) {
        if (packet.type === 'login') {
            await login(event, packet);
        }
    }
}

async function login(event: APIGatewayProxyEvent, packet: LoginPacket) {
    const result: LoginResultPacket = {
        type: 'login_result',
    };

    await sendPacket(event, result);
}

async function savePacket(packet: WebSocketPacket) {
    const client = getDocumentClient();

    await client
        .put({
            TableName: MESSAGES_TABLE_NAME,
            Item: packet,
        })
        .promise();
}

async function countCurrentPackets(
    connectionId: string,
    startSequenceNumber: number,
    endSequenceNumber: number
): Promise<number> {
    const client = getDocumentClient();

    const response = await client
        .query({
            TableName: MESSAGES_TABLE_NAME,
            Select: 'COUNT',
            KeyConditionExpression:
                'connectionId = :connectionId and sequenceNumber >= :startSequenceNumber and sequenceNumber <= :endSequenceNumber',
            ExpressionAttributeValues: {
                ':connectionId': connectionId,
                ':startSequenceNumber': startSequenceNumber,
                ':endSequenceNumber': endSequenceNumber,
            },
        })
        .promise();

    return response.Count;
}

async function getCurrentPackets(
    connectionId: string,
    startSequenceNumber: number,
    endSequenceNumber: number
): Promise<WebSocketRetrievedPacket[]> {
    const client = getDocumentClient();

    let result = await client
        .query({
            TableName: MESSAGES_TABLE_NAME,
            ProjectionExpression: 'sequenceNumber,data',
            KeyConditionExpression:
                'connectionId = :connectionId and sequenceNumber >= :startSequenceNumber and sequenceNumber <= :endSequenceNumber',
            ExpressionAttributeValues: {
                ':connectionId': connectionId,
                ':startSequenceNumber': startSequenceNumber,
                ':endSequenceNumber': endSequenceNumber,
            },
        })
        .promise();

    let datas = [] as WebSocketRetrievedPacket[];
    while (result?.$response.data) {
        for (let item of result.$response.data.Items) {
            datas.push(item as WebSocketRetrievedPacket);
        }

        if (result.$response.hasNextPage()) {
            const request = result.$response.nextPage();
            if (request) {
                result = await request.promise();
                continue;
            }
        }
        result = null;
    }

    return datas;
}

function sendPacket(event: APIGatewayProxyEvent, packet: Packet) {
    const messages = encodePacket(packet);
    const endpoint = callbackUrl(event);
    const promises = messages.map((message) => {
        return sendMessageToClient(
            endpoint,
            event.requestContext.connectionId,
            message
        );
    });

    return Promise.all(promises);
}

function parsePacket(data: string): Packet {
    try {
        const packet = JSON.parse(data);
        return packet;
    } catch (err) {
        return null;
    }
}

function encodePacket(packet: Packet): string[] {
    const json = JSON.stringify(packet);
    const handler = new AwsSocketHandler(MAX_MESSAGE_SIZE);

    const messages = handler.encode(json, 0);
    return messages;
}

function formatAtom(namespace: string, atom: Atom<any>): DynamoAtom {
    return {
        namespace,
        atomId: atomIdToString(atom.id),
        atomJson: JSON.stringify(atom),
    };
}

function callbackUrl(event: APIGatewayProxyEvent): string {
    if (process.env.IS_OFFLINE) {
        return 'http://localhost:4001';
    }
    const domain = event.requestContext.domainName;
    const path = event.requestContext.stage;
    return `https://${domain}/${path}`;
}

async function sendMessageToClient(
    url: string,
    connectionId: string,
    payload: string
) {
    const api = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: url,
    });
    await api
        .postToConnection({
            ConnectionId: connectionId,
            Data: payload,
        })
        .promise();
}

interface WebSocketPacket {
    connectionId: string;
    sequenceNumber: number;
    data: string;
}

interface WebSocketRetrievedPacket {
    sequenceNumber: number;
    data: string;
}
