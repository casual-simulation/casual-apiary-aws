import { sha256 } from 'k6/crypto';
export function generateUser() {
    return {
        username: randomString(),
        sessionId: randomString(),
        token: randomString(),
    };
}

export function formatMessage(data) {
    const json = JSON.stringify(data);
    const message = [AwsMessageTypes.Message, json];
    return JSON.stringify(message);
}

export function parseMessage(json) {
    const data = JSON.parse(json);
    return JSON.parse(data[1]);
}

export function randomString() {
    const number = Math.random();
    const str = number.toString();
    return sha256(str, 'hex').slice(0, 10);
}

export function getUrl() {
    const url = __ENV.URL;
    if (!url) {
        throw new Error('The URL Environment Variable must be set.');
    }
    return url;
}

export const AwsMessageTypes = {
    Message: 1,
    UploadRequest: 2,
    UploadResponse: 3,
    DownloadRequest: 4,
};
