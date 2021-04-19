import { RedisClient } from 'redis';
import { promisify } from 'util';
import { UpdatesStore } from './UpdatesStore';
import { spanify } from './Utils';

export class RedisUpdatesStore implements UpdatesStore {
    private _globalNamespace: string;
    private _redis: RedisClient;

    private rpush: (args: [string, ...string[]]) => Promise<number>;
    private lrange: (
        key: string,
        start: number,
        end: number
    ) => Promise<string[]>;
    private del: (key: string) => Promise<void>;

    constructor(globalNamespace: string, client: RedisClient) {
        this._globalNamespace = globalNamespace;
        this._redis = client;

        this._redis.rpush('key', 'abc');

        this.del = spanify(
            'Redis DEL',
            promisify(this._redis.del).bind(this._redis)
        );
        this.rpush = spanify(
            'Redis RPUSH',
            promisify(this._redis.rpush).bind(this._redis)
        );
        this.lrange = spanify(
            'Redis LRANGE',
            promisify(this._redis.lrange).bind(this._redis)
        );
    }

    async getUpdates(branch: string): Promise<string[]> {
        const key = branchKey(this._globalNamespace, branch);
        const updates = await this.lrange(key, 0, -1);
        return updates;
    }

    async addUpdates(branch: string, updates: string[]): Promise<void> {
        const key = branchKey(this._globalNamespace, branch);
        await this.rpush([key, ...updates]);
    }

    async clearUpdates(branch: string): Promise<void> {
        const key = branchKey(this._globalNamespace, branch);
        await this.del(key);
    }
}

function branchKey(globalNamespace: string, branch: string) {
    return `/${globalNamespace}/updates/${branch}`;
}
