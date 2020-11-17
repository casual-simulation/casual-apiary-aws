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
import { Packet } from './src/Events';

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

    const packet = parsePacket(event.body);

    if (!packet) {
        return {
            statusCode: 400,
        };
    }

    if (packet.type === 'login') {
        await sendMessageToClient(
            callbackUrl(event),
            event.requestContext.connectionId,
            'Got your login!'
        );
    } else if (packet.type === 'message') {
        await sendMessageToClient(
            callbackUrl(event),
            event.requestContext.connectionId,
            'Got your message!'
        );
    }

    return {
        statusCode: 200,
    };
}

function parsePacket(data: string): Packet {
    try {
        const packet = JSON.parse(data);
        return packet;
    } catch (err) {
        return null;
    }
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

function getDocumentClient() {
    if (isOffline()) {
        return new AWS.DynamoDB.DocumentClient({
            region: 'localhost',
            endpoint: 'http://localhost:8000',
        });
    } else {
        return new AWS.DynamoDB.DocumentClient();
    }
}

function isOffline(): boolean {
    return !!process.env.IS_OFFLINE;
}
