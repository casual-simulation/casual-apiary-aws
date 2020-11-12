import 'source-map-support/register';
import {
    APIGatewayProxyEvent,
    APIGatewayProxyHandler,
    APIGatewayProxyResult,
    APIGatewayProxyResultV2,
    APIGatewayProxyStructuredResultV2,
    Context,
} from 'aws-lambda';
import AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import {
    Atom,
    atom,
    atomId,
    atomIdToString,
} from '@casual-simulation/causal-trees';
import { bot } from '@casual-simulation/aux-common/aux-format-2';

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
    const client = new AWS.DynamoDB.DocumentClient();
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
    const client = new AWS.DynamoDB.DocumentClient();
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

function formatAtom(namespace: string, atom: Atom<any>): DynamoAtom {
    return {
        namespace,
        atomId: atomIdToString(atom.id),
        atomJson: JSON.stringify(atom),
    };
}
