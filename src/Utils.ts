import AWS from 'aws-sdk';

/**
 * Gets a new instance of a DynamoDB document client.
 * Can be used to interact with DynamoDB.
 */
export function getDocumentClient() {
    if (isOffline()) {
        return new AWS.DynamoDB.DocumentClient({
            region: 'localhost',
            endpoint: 'http://localhost:8000',
        });
    } else {
        return new AWS.DynamoDB.DocumentClient();
    }
}

/**
 * Determines if we are running offline with serverless-offline.
 */
export function isOffline(): boolean {
    return !!process.env.IS_OFFLINE;
}
