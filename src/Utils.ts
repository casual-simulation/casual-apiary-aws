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

export function getS3Client() {
    if (isOffline()) {
        return new AWS.S3({
            s3ForcePathStyle: true,
            accessKeyId: 'S3RVER',
            secretAccessKey: 'S3RVER',
            endpoint: new AWS.Endpoint('http://localhost:8000'),
        });
    }
    return new AWS.S3();
}

/**
 * Determines if we are running offline with serverless-offline.
 */
export function isOffline(): boolean {
    return !!process.env.IS_OFFLINE;
}
