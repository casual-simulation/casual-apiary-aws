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
import {
    downloadObject,
    getDocumentClient,
    getMessageUploadUrl,
    getS3Client,
    MESSAGES_BUCKET_NAME,
    parseMessage,
    uploadMessage,
} from './src/Utils';
import {
    AwsDownloadRequest,
    AwsMessage,
    AwsMessageData,
    AwsUploadRequest,
    AwsUploadResponse,
} from './src/AwsMessages';

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

export const MAX_MESSAGE_SIZE = 128_000;

const ATOMS_TABLE_NAME = 'AtomsTable';
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

    const message = parseMessage<AwsMessage>(event.body);

    if (message) {
        if (message.type === 'message') {
            const packet = parseMessage<Packet>(message.data);
            if (packet) {
                await processPacket(event, packet);
            }
        } else if (message.type === 'upload_request') {
            await processUpload(event, message);
        } else if (message.type === 'download_request') {
            await processDownload(event, message);
        }
    }

    return {
        statusCode: 200,
    };
}

async function processPacket(event: APIGatewayProxyEvent, packet: Packet) {
    console.log('Got Message: ', message);

    if (packet) {
        if (packet.type === 'login') {
            await login(event, packet);
        }
    }
}

export async function processUpload(
    event: APIGatewayProxyEvent,
    message: AwsUploadRequest
) {
    const uploadUrl = await getMessageUploadUrl();

    const response: AwsUploadResponse = {
        type: 'upload_response',
        id: message.id,
        uploadUrl: uploadUrl,
    };

    await sendMessageToClient(
        callbackUrl(event),
        event.requestContext.connectionId,
        JSON.stringify(response)
    );
}

export async function processDownload(
    event: APIGatewayProxyEvent,
    message: AwsDownloadRequest
) {
    const data = await downloadObject(message.url);
    const packet = parseMessage<Packet>(data);
    await processPacket(event, packet);
}

async function login(event: APIGatewayProxyEvent, packet: LoginPacket) {
    const result: LoginResultPacket = {
        type: 'login_result',
    };

    await sendPacket(event, result);
}

function formatAtom(namespace: string, atom: Atom<any>): DynamoAtom {
    return {
        namespace,
        atomId: atomIdToString(atom.id),
        atomJson: JSON.stringify(atom),
    };
}

function sendPacket(event: APIGatewayProxyEvent, packet: Packet) {
    return sendData(event, JSON.stringify(packet));
}

async function sendData(event: APIGatewayProxyEvent, data: string) {
    // TODO: Calculate the real message size instead of just assuming that
    // each character is 1 byte
    if (data.length > MAX_MESSAGE_SIZE) {
        const url = await uploadMessage(data);

        // Request download
        const downloadRequest: AwsDownloadRequest = {
            type: 'download_request',
            url: url,
        };

        await sendMessageToClient(
            callbackUrl(event),
            event.requestContext.connectionId,
            JSON.stringify(downloadRequest)
        );
    } else {
        const message: AwsMessageData = {
            type: 'message',
            data: data,
        };

        await sendMessageToClient(
            callbackUrl(event),
            event.requestContext.connectionId,
            JSON.stringify(message)
        );
    }
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
