import AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import { AwsMessage } from './AwsMessages';
import axios from 'axios';

export const MESSAGES_BUCKET_NAME = process.env.MESSAGES_BUCKET;

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export async function uploadMessage(
    client: AWS.S3,
    data: string
): Promise<string> {
    const key = uuid();
    const response = await client
        .putObject({
            Bucket: MESSAGES_BUCKET_NAME,
            Key: key,
            ContentType: 'application/json',
            Body: data,
        })
        .promise();

    if (isOffline()) {
        return `http://localhost:4569/${key}`;
    } else {
        return `https://${MESSAGES_BUCKET_NAME}.s3.amazonaws.com/${key}`;
    }
}

export async function getMessageUploadUrl(): Promise<string> {
    const client = getS3Client();
    const key = uuid();
    const params: AWS.S3.Types.PutObjectRequest = {
        Bucket: MESSAGES_BUCKET_NAME,
        Key: key,
        ContentType: 'application/json',
    };
    const url = await client.getSignedUrlPromise('putObject', params);
    return url;
}

export async function downloadObject(url: string): Promise<string> {
    const response = await axios.get(url);
    return response.data;
}

/**
 * Determines if we are running offline with serverless-offline.
 */
export function isOffline(): boolean {
    return !!process.env.IS_OFFLINE;
}

/**
 * Parses the given data into a AWS Message.
 * @param data The data to parse.
 */
export function parseMessage<T>(data: string): T {
    try {
        const value = JSON.parse(data);
        return value;
    } catch (err) {
        return null;
    }
}
