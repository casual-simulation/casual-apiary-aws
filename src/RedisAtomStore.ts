import { Atom } from '@casual-simulation/causal-trees';
import { ApiaryAtomStore } from './ApiaryAtomStore';
import { sortBy } from 'lodash';
import { RedisClient } from 'redis';
import { promisify } from 'util';
import { spanify } from './Utils';

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
        let fieldsAndValues = [branchKey(this._globalNamespace, namespace)] as [
            string,
            ...string[]
        ];

        for (let atom of atoms) {
            fieldsAndValues.push(atom.hash, JSON.stringify(atom));
        }
        await this.hset(fieldsAndValues);
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
        const args = [
            branchKey(this._globalNamespace, namespace),
            ...atomHashes,
        ] as [string, ...string[]];

        await this.hdel(args);
    }

    async clearNamespace(namespace: string): Promise<void> {
        await this.del(branchKey(this._globalNamespace, namespace));
    }
}

function branchKey(globalNamespace: string, branch: string) {
    return `/${globalNamespace}/atoms/${branch}`;
}
