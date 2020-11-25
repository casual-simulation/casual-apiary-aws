import { Atom } from '@casual-simulation/causal-trees';
import { ApiaryAtomStore } from './ApiaryAtomStore';
import AWS from 'aws-sdk';
import { getDocumentClient } from './Utils';
import {
    PutItemInputAttributeMap,
    PutRequest,
    WriteRequest,
} from 'aws-sdk/clients/dynamodb';

const MAX_BATCH_ITEM_WRITE_COUNT = 25;
const MAX_RETRY_COUNT = 5;
const DEFAULT_BACKOFF_MILLISECONDS = 0.5;

/**
 * Defines a class that specifies a DynamoDB implementation of an ApiaryAtomStore.
 */
export class DynamoDbAtomStore implements ApiaryAtomStore {
    private _tableName: string;
    private _client: AWS.DynamoDB.DocumentClient;

    constructor(tableName: string, client?: AWS.DynamoDB.DocumentClient) {
        this._tableName = tableName;
        this._client = client || getDocumentClient();
    }

    async saveAtoms(namespace: string, atoms: Atom<any>[]): Promise<void> {
        const requests: WriteRequest[] = atoms.map((a) => ({
            PutRequest: {
                Item: formatAtom(namespace, a),
            },
        }));

        await this._processBatch(requests);
    }

    async loadAtoms(namespace: string): Promise<Atom<any>[]> {
        let result = await this._client
            .query({
                TableName: this._tableName,
                ProjectionExpression: 'atomJson',
                KeyConditionExpression: 'namespace = :namespace',
                ExpressionAttributeValues: {
                    ':namespace': namespace,
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

        return atoms;
    }

    async deleteAtoms(namespace: string, atomHashes: string[]): Promise<void> {
        const requests: WriteRequest[] = atomHashes.map((hash) => ({
            DeleteRequest: {
                Key: {
                    namespace: { S: namespace },
                    atomHash: { S: hash },
                },
            },
        }));

        await this._processBatch(requests);
    }

    async clearNamespace(namespace: string): Promise<void> {
        const atoms = await this.loadAtoms(namespace);
        await this.deleteAtoms(
            namespace,
            atoms.map((a) => a.hash)
        );
    }

    private async _processBatch(
        requests: WriteRequest[],
        tryCount: number = 0
    ) {
        const unprocessedRequests: WriteRequest[] = [];
        for (let i = 0; i < requests.length; i += MAX_BATCH_ITEM_WRITE_COUNT) {
            const data = await this._client
                .batchWrite({
                    RequestItems: {
                        [this._tableName]: requests.slice(
                            i,
                            i + MAX_BATCH_ITEM_WRITE_COUNT
                        ),
                    },
                })
                .promise();

            if (data.UnprocessedItems?.[this._tableName]?.length > 0) {
                unprocessedRequests.push(
                    ...data.UnprocessedItems[this._tableName]
                );
            }
        }

        if (unprocessedRequests.length > 0) {
            if (tryCount < MAX_RETRY_COUNT) {
                await delay(
                    DEFAULT_BACKOFF_MILLISECONDS * Math.pow(2, tryCount)
                );
                return this._processBatch(unprocessedRequests, tryCount + 1);
            }
        }
    }
}

interface DynamoAtom {
    namespace: string;
    atomHash: string;
    atomJson: string;
}

function formatAtom(
    namespace: string,
    atom: Atom<any>
): PutItemInputAttributeMap {
    return {
        namespace: {
            S: namespace,
        },
        atomHash: {
            S: atom.hash,
        },
        atomJson: {
            S: JSON.stringify(atom),
        },
    };
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
