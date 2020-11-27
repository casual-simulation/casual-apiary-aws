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
    ADD_ATOMS,
    Atom,
    atom,
    atomId,
    atomIdToString,
    CausalRepoMessageHandlerMethods,
    SEND_EVENT,
    UNWATCH_BRANCH,
    UNWATCH_BRANCH_DEVICES,
    WATCH_BRANCH,
    WATCH_BRANCH_DEVICES,
} from '@casual-simulation/causal-trees';
import { bot } from '@casual-simulation/aux-common/aux-format-2';
import {
    LoginPacket,
    LoginResultPacket,
    MessagePacket,
    Packet,
} from './src/Events';
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
import { CausalRepoServer } from './src/CausalRepoServer';
import { DynamoDbConnectionStore } from './src/DynamoDbConnectionStore';
import { ApiGatewayMessenger } from './src/ApiGatewayMessenger';
import { DynamoDbAtomStore } from './src/DynamoDbAtomStore';
import { Message } from './src/ApiaryMessenger';

export const MAX_MESSAGE_SIZE = 128_000;

const ATOMS_TABLE_NAME = 'AtomsTable';
const CONNECTIONS_TABLE_NAME = 'ConnectionsTable';
const NAMESPACE_CONNECTIONS_TABLE_NAME = 'NamespaceConnectionsTable';
const DEFAULT_NAMESPACE = 'auxplayer.com@test-story';

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
    const server = getCausalRepoServer(event);
    await server.disconnect(event.requestContext.connectionId);

    return {
        statusCode: 200,
    };
}

export async function message(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
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
    if (packet) {
        if (packet.type === 'login') {
            await login(event, packet);
        } else if (packet.type === 'message') {
            await messagePacket(event, packet);
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

    await getMessenger(event).sendRaw(
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

    const server = getCausalRepoServer(event);
    await server.connect({
        connectionId: event.requestContext.connectionId,
        sessionId: packet.sessionId,
        username: packet.username,
        token: packet.token,
    });

    await getMessenger(event).sendPacket(
        event.requestContext.connectionId,
        result
    );
}

async function messagePacket(
    event: APIGatewayProxyEvent,
    packet: MessagePacket
) {
    const server = getCausalRepoServer(event);
    const message: Message = {
        name: <any>packet.channel,
        data: packet.data,
    };
    const connectionId = event.requestContext.connectionId;
    if (message.name === WATCH_BRANCH) {
        await server.watchBranch(connectionId, message.data);
    } else if (message.name === ADD_ATOMS) {
        await server.addAtoms(connectionId, message.data);
    } else if (message.name === UNWATCH_BRANCH) {
        await server.unwatchBranch(connectionId, message.data);
    } else if (message.name === SEND_EVENT) {
        await server.sendEvent(connectionId, message.data);
    } else if (message.name == WATCH_BRANCH_DEVICES) {
        await server.watchBranchDevices(connectionId, message.data);
    } else if (message.name === UNWATCH_BRANCH_DEVICES) {
        await server.unwatchBranchDevices(connectionId, message.data);
    }
}

let _server: CausalRepoServer;
let _messenger: ApiGatewayMessenger;

function getCausalRepoServer(event: APIGatewayProxyEvent) {
    if (!_server) {
        const documentClient = getDocumentClient();
        const atomStore = new DynamoDbAtomStore(
            ATOMS_TABLE_NAME,
            documentClient
        );
        const connectionStore = new DynamoDbConnectionStore(
            CONNECTIONS_TABLE_NAME,
            NAMESPACE_CONNECTIONS_TABLE_NAME,
            documentClient
        );
        _server = new CausalRepoServer(
            connectionStore,
            atomStore,
            getMessenger(event)
        );
    }
    return _server;
}

function getMessenger(event: APIGatewayProxyEvent) {
    if (!_messenger) {
        _messenger = new ApiGatewayMessenger(callbackUrl(event));
    }
    return _messenger;
}

function callbackUrl(event: APIGatewayProxyEvent): string {
    if (process.env.IS_OFFLINE) {
        return 'http://localhost:4001';
    }
    const domain = event.requestContext.domainName;
    const path = event.requestContext.stage;
    return `https://${domain}/${path}`;
}

function handleEvents(
    message: MessagePacket,
    handlers: Partial<CausalRepoMessageHandlerMethods>
): any {
    const handler = handlers[message.channel];

    if (handler) {
        return handler(message);
    }

    return undefined;
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
