import 'source-map-support/register';
import {
    APIGatewayProxyEvent,
    APIGatewayProxyStructuredResultV2,
    Context,
} from 'aws-lambda';
import AWS, { ApiGatewayManagementApi } from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import {
    ADD_ATOMS,
    CausalRepoMessageHandlerMethods,
    SEND_EVENT,
    UNWATCH_BRANCH,
    UNWATCH_BRANCH_DEVICES,
    WATCH_BRANCH,
    WATCH_BRANCH_DEVICES,
} from '@casual-simulation/causal-trees';
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
    parseMessage,
} from './src/Utils';
import {
    AwsDownloadRequest,
    AwsMessage,
    AwsMessageTypes,
    AwsUploadRequest,
    AwsUploadResponse,
} from './src/AwsMessages';
import { CausalRepoServer } from './src/CausalRepoServer';
import { DynamoDbConnectionStore } from './src/DynamoDbConnectionStore';
import { ApiGatewayMessenger } from './src/ApiGatewayMessenger';
import { DynamoDbAtomStore } from './src/DynamoDbAtomStore';
import { DEVICE_COUNT, Message } from './src/ApiaryMessenger';
import { ApiaryConnectionStore } from './src/ApiaryConnectionStore';
import { ApiaryAtomStore } from './src/ApiaryAtomStore';
import { RedisClient, createClient as createRedisClient } from 'redis';
import { RedisAtomStore } from './src/RedisAtomStore';
import { RedisConnectionStore } from './src/RedisConnectionStore';

export const ATOMS_TABLE_NAME = process.env.ATOMS_TABLE;
export const CONNECTIONS_TABLE_NAME = process.env.CONNECTIONS_TABLE;
export const NAMESPACE_CONNECTIONS_TABLE_NAME =
    process.env.NAMESPACE_CONNECTIONS_TABLE;
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = parseInt(process.env.REDIS_PORT);
export const REDIS_PASS = process.env.REDIS_PASS;
export const USE_REDIS = process.env.USE_REDIS === 'true';
export const REDIS_TLS = process.env.REDIS_TLS
    ? process.env.REDIS_TLS === 'true'
    : true;
export const REDIS_NAMESPACE = process.env.REDIS_NAMESPACE;

if (USE_REDIS) {
    console.log('[handler] Using Redis.');
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
    const server = getCausalRepoServer(event, false);
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
        if (message[0] === AwsMessageTypes.Message) {
            const packet = parseMessage<Packet>(message[1]);
            if (packet) {
                await processPacket(event, packet, false);
            }
        } else if (message[0] === AwsMessageTypes.UploadRequest) {
            await processUpload(event, message, false);
        } else if (message[0] === AwsMessageTypes.DownloadRequest) {
            await processDownload(event, message, false);
        }
    }

    return {
        statusCode: 200,
    };
}

export async function webhook(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
    const story = event.queryStringParameters['story'];
    if (!story) {
        console.log('[handler] No story query parameter was provided!');
        return {
            statusCode: 404,
        };
    }

    const server = getCausalRepoServer(event, true);
    const domain = event.requestContext.domainName;
    const url = `https://${domain}${event.path}`;

    let errored = false;
    try {
        const data = JSON.parse(event.body);

        try {
            const statusCode = await server.webhook(
                story,
                event.httpMethod,
                url,
                event.headers,
                data
            );
            return {
                statusCode,
            };
        } catch (err) {
            errored = true;
            throw err;
        }
    } catch (parseError) {
        if (errored) {
            throw parseError;
        }
        return {
            statusCode: 400,
        };
    }
}

async function processPacket(
    event: APIGatewayProxyEvent,
    packet: Packet,
    isHttp: boolean
) {
    if (packet) {
        if (packet.type === 'login') {
            await login(event, packet, isHttp);
        } else if (packet.type === 'message') {
            await messagePacket(event, packet, isHttp);
        }
    }
}

export async function processUpload(
    event: APIGatewayProxyEvent,
    message: AwsUploadRequest,
    isHttp: boolean
) {
    const uploadUrl = await getMessageUploadUrl();

    const response: AwsUploadResponse = [
        AwsMessageTypes.UploadResponse,
        message[1],
        uploadUrl,
    ];

    await getMessenger(event, isHttp).sendRaw(
        event.requestContext.connectionId,
        JSON.stringify(response)
    );
}

export async function processDownload(
    event: APIGatewayProxyEvent,
    message: AwsDownloadRequest,
    isHttp: boolean
) {
    const data = await downloadObject(message[1]);
    const packet = parseMessage<Packet>(data);
    await processPacket(event, packet, isHttp);
}

async function login(
    event: APIGatewayProxyEvent,
    packet: LoginPacket,
    isHttp: boolean
) {
    const result: LoginResultPacket = {
        type: 'login_result',
    };

    const server = getCausalRepoServer(event, isHttp);
    await server.connect({
        connectionId: event.requestContext.connectionId,
        sessionId: packet.sessionId,
        username: packet.username,
        token: packet.token,
    });

    await getMessenger(event, isHttp).sendPacket(
        event.requestContext.connectionId,
        result
    );
}

async function messagePacket(
    event: APIGatewayProxyEvent,
    packet: MessagePacket,
    isHttp: boolean
) {
    const server = getCausalRepoServer(event, isHttp);
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
    } else if (message.name === DEVICE_COUNT) {
        await server.deviceCount(connectionId, <string>(<any>message.data));
    }
}

let _connectionStore: ApiaryConnectionStore;
let _atomStore: ApiaryAtomStore;
let _messenger: ApiGatewayMessenger;
let _server: CausalRepoServer;

function getCausalRepoServer(event: APIGatewayProxyEvent, isHttp: boolean) {
    if (!_server || isHttp) {
        const atomStore = getAtomStore();
        const connectionStore = getConnectionStore();

        _server = new CausalRepoServer(
            connectionStore,
            atomStore,
            getMessenger(event, isHttp)
        );
    }
    return _server;
}

function getConnectionStore() {
    if (!_connectionStore) {
        if (USE_REDIS) {
            const redisClient = getRedisClient();
            _connectionStore = new RedisConnectionStore(
                REDIS_NAMESPACE,
                redisClient
            );
        } else {
            const documentClient = getDocumentClient();
            _connectionStore = new DynamoDbConnectionStore(
                CONNECTIONS_TABLE_NAME,
                NAMESPACE_CONNECTIONS_TABLE_NAME,
                documentClient
            );
        }
    }
    return _connectionStore;
}

function getAtomStore() {
    if (!_atomStore) {
        if (USE_REDIS) {
            const redisClient = getRedisClient();
            _atomStore = new RedisAtomStore(REDIS_NAMESPACE, redisClient);
        } else {
            const documentClient = getDocumentClient();
            _atomStore = new DynamoDbAtomStore(
                ATOMS_TABLE_NAME,
                documentClient
            );
        }
    }
    return _atomStore;
}

let _redisClient: RedisClient;

const REDIS_CONNECTION_TIMEOUT = 1000 * 60 * 60; // 1 hour

function getRedisClient() {
    if (!_redisClient) {
        _redisClient = createRedisClient({
            host: REDIS_HOST,
            port: REDIS_PORT,
            password: REDIS_PASS,
            tls: REDIS_TLS,

            retry_strategy: function (options) {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    // End reconnecting on a specific error and flush all commands with
                    // a individual error
                    return new Error('The server refused the connection');
                }
                if (options.total_retry_time > REDIS_CONNECTION_TIMEOUT) {
                    // End reconnecting after a specific timeout and flush all commands
                    // with a individual error
                    return new Error('Retry time exhausted');
                }
                // reconnect after min(100ms per attempt, 3 seconds)
                return Math.min(options.attempt * 100, 3000);
            },
        });
    }

    return _redisClient;
}

function getMessenger(event: APIGatewayProxyEvent, isHttp: boolean) {
    if (!_messenger || isHttp) {
        _messenger = new ApiGatewayMessenger(
            callbackUrl(event, isHttp),
            getConnectionStore()
        );
    }
    return _messenger;
}

function callbackUrl(event: APIGatewayProxyEvent, isHttp: boolean): string {
    if (process.env.IS_OFFLINE) {
        return 'http://localhost:4001';
    }

    if (isHttp) {
        return process.env.WEBSOCKET_URL || 'https://websocket.casualos.com';
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
