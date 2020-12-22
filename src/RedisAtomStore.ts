import { Atom, atomIdToString } from '@casual-simulation/causal-trees';
import { ApiaryAtomStore } from './ApiaryAtomStore';
import { sortBy } from 'lodash';
import { RedisClient } from 'redis';
import { promisify } from 'util';
import { spanify } from './Utils';

/**
 * The size, in bytes, of the maximum request that should be made with redis.
 * Lambda Store has a max request size of 400k but we have a 2k buffer to be safe.
 */
const DEFAULT_BATCH_MAX_SIZE = 398_000;
const MAX_REDIS_BATCH_SIZE = parseInt(
    process.env.MAX_REDIS_BATCH_SIZE || DEFAULT_BATCH_MAX_SIZE.toString()
);

/**
 * Defines a class that specifies a Redis implementation of an ApiaryAtomStore.
 */
export class RedisAtomStore implements ApiaryAtomStore {
    private _globalNamespace: string;
    private _redis: RedisClient;

    private hset: (args: [string, ...string[]]) => Promise<string[]>;
    private hdel: (args: [string, ...string[]]) => Promise<void>;
    private hlen: (key: string) => Promise<number>;
    private hvals: (key: string) => Promise<string[]>;
    private del: (key: string) => Promise<void>;

    constructor(globalNamespace: string, client: RedisClient) {
        this._globalNamespace = globalNamespace;
        this._redis = client;

        this.del = spanify(
            'Redis DEL',
            promisify(this._redis.del).bind(this._redis)
        );
        this.hset = spanify(
            'Redis HSET',
            promisify(this._redis.hset).bind(this._redis)
        );
        this.hdel = spanify(
            'Redis HDEL',
            promisify(this._redis.hdel).bind(this._redis)
        );
        this.hvals = spanify(
            'Redis HVALS',
            promisify(this._redis.hvals).bind(this._redis)
        );
        this.hlen = spanify(
            'Redis HLEN',
            promisify(this._redis.hlen).bind(this._redis)
        );
    }

    async saveAtoms(namespace: string, atoms: Atom<any>[]): Promise<void> {
        if (atoms.length <= 0) {
            return;
        }
        const key = branchKey(this._globalNamespace, namespace);
        let fieldsAndValues = [key] as [string, ...string[]];

        let length = 0;

        for (let atom of atoms) {
            const json = JSON.stringify(atom);
            const fieldLength =
                Buffer.byteLength(atom.hash, 'utf8') +
                Buffer.byteLength(json, 'utf8');

            if (fieldLength >= MAX_REDIS_BATCH_SIZE) {
                throw new Error(
                    `Unable to upload atom (${atomIdToString(
                        atom.id
                    )}) because it exceeds the configured maximum redis request size.`
                );
            }

            length += fieldLength;

            if (length >= MAX_REDIS_BATCH_SIZE) {
                if (fieldsAndValues.length > 1) {
                    await this.hset(fieldsAndValues);
                    fieldsAndValues = [key];
                    length = fieldLength;
                }
            }

            fieldsAndValues.push(atom.hash, json);
        }

        if (fieldsAndValues.length > 1) {
            await this.hset(fieldsAndValues);
        }
    }

    async loadAtoms(namespace: string): Promise<Atom<any>[]> {
        const values = await this.hvals(
            branchKey(this._globalNamespace, namespace)
        );
        const atoms = values.map((val) => JSON.parse(val)) as Atom<any>[];
        return sortBy(atoms, (a) => a.id.timestamp);
    }

    async countAtoms(namespace: string): Promise<number> {
        const count = await this.hlen(
            branchKey(this._globalNamespace, namespace)
        );
        return count;
    }

    async deleteAtoms(namespace: string, atomHashes: string[]): Promise<void> {
        const key = branchKey(this._globalNamespace, namespace);
        let args = [key] as [string, ...string[]];

        let length = 0;
        for (let hash of atomHashes) {
            const fieldLength = Buffer.byteLength(hash, 'utf8');

            if (fieldLength >= MAX_REDIS_BATCH_SIZE) {
                throw new Error(
                    `Unable to upload hash because it exceeds the configured maximum redis request size.`
                );
            }

            length += fieldLength;

            if (length >= MAX_REDIS_BATCH_SIZE) {
                if (args.length > 1) {
                    await this.hdel(args);
                    args = [key];
                    length = fieldLength;
                }
            }

            args.push(hash);
        }

        if (args.length > 1) {
            await this.hdel(args);
        }
    }

    async clearNamespace(namespace: string): Promise<void> {
        await this.del(branchKey(this._globalNamespace, namespace));
    }
}

function branchKey(globalNamespace: string, branch: string) {
    return `/${globalNamespace}/atoms/${branch}`;
}
