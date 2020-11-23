import { CausalRepoServer } from './CausalRepoServer';
import {
    ADD_ATOMS,
    atom,
    atomId,
    atomMatchesHash,
    ATOMS_RECEIVED,
    UNWATCH_BRANCH,
    WATCH_BRANCH,
} from '@casual-simulation/causal-trees/core2';
import { MemoryApiaryConnectionStore } from './MemoryApiaryConnectionStore';
import { MemoryApiaryAtomStore } from './MemoryApiaryAtomStore';
import { DeviceConnection } from './ApiaryConnectionStore';
import { MemoryApiaryMessenger } from './MemoryApiaryMessenger';
// import { bot } from '../aux-vm/node_modules/@casual-simulation/aux-common/aux-format-2';
// import {
//     hashPassword,
//     verifyPassword,
// } from '../causal-trees/node_modules/@casual-simulation/crypto';

console.log = jest.fn();
console.error = jest.fn();

const device1Info: DeviceConnection = {
    username: 'device1',
    connectionId: 'device1',
    sessionId: 'device1',
    token: 'device1',
};
const device2Info: DeviceConnection = {
    username: 'device2',
    connectionId: 'device2',
    sessionId: 'device2',
    token: 'device2',
};
const device3Info: DeviceConnection = {
    username: 'device3',
    connectionId: 'device3',
    sessionId: 'device3',
    token: 'device3',
};

describe('CausalRepoServer', () => {
    let server: CausalRepoServer;
    let atomStore: MemoryApiaryAtomStore;
    let connectionStore: MemoryApiaryConnectionStore;
    let messenger: MemoryApiaryMessenger;

    beforeEach(() => {
        atomStore.reset();
        connectionStore.reset();
        messenger.reset();
    });

    // We initialize the server once for all the tests
    // because it should only rely on the stores for cross-request data.
    beforeAll(() => {
        atomStore = new MemoryApiaryAtomStore();
        connectionStore = new MemoryApiaryConnectionStore();
        messenger = new MemoryApiaryMessenger();
        server = new CausalRepoServer(connectionStore, atomStore, messenger);
    });

    describe('connect()', () => {
        it('should save the given connection', async () => {
            await server.connect(device1Info);

            const connection = await connectionStore.getConnection(
                device1Info.connectionId
            );
            expect(connection).toEqual(device1Info);
        });
    });

    describe('disconnect()', () => {
        it('should remove the given connection', async () => {
            await server.connect(device1Info);

            await server.disconnect('connectionId');

            const connection = await connectionStore.getConnection(
                'connectionId'
            );
            expect(connection).toBeUndefined();
        });
    });

    describe(WATCH_BRANCH, () => {
        it('should load the given branch and send the current atoms', async () => {
            await server.connect(device1Info);

            const a1 = atom(atomId('a', 1), null, {});
            const a2 = atom(atomId('a', 2), a1, {});
            await atomStore.saveAtoms('testBranch', [a1, a2]);

            await server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
            });

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
            ]);
        });

        it('should create a new orphan branch if the branch name does not exist', async () => {
            await server.connect(device1Info);

            await server.watchBranch(device1Info.connectionId, {
                branch: 'doesNotExist',
            });

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'doesNotExist',
                        atoms: [],
                    },
                },
            ]);
        });

        it('should be able to accept multiple requests to watch a branch at a time', async () => {
            await server.connect(device1Info);
            await server.connect(device2Info);

            const a1 = atom(atomId('a', 1), null, {});
            const a2 = atom(atomId('a', 2), a1, {});
            await atomStore.saveAtoms('testBranch', [a1, a2]);

            const watchBranch1 = server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
            });
            const watchBranch2 = server.watchBranch(device2Info.connectionId, {
                branch: 'testBranch',
            });

            await Promise.all([watchBranch1, watchBranch2]);

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
            ]);
            expect(messenger.getMessages(device2Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
            ]);
        });

        it('should be able to load, unload, and reload the branch', async () => {
            await server.connect(device1Info);

            const a1 = atom(atomId('a', 1), null, {});
            const a2 = atom(atomId('a', 2), a1, {});
            await atomStore.saveAtoms('testBranch', [a1, a2]);

            await server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
            });

            await server.disconnect(device1Info.connectionId);

            await server.connect(device1Info);

            await server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
            });

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
            ]);
        });

        describe('temp', () => {
            it('should load the branch like normal if it is temporary', async () => {
                await server.connect(device1Info);

                const a1 = atom(atomId('a', 1), null, {});
                const a2 = atom(atomId('a', 2), a1, {});
                await atomStore.saveAtoms('testBranch', [a1, a2]);

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'testBranch',
                    temporary: true,
                });

                expect(messenger.getMessages(device1Info.connectionId)).toEqual(
                    [
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'testBranch',
                                atoms: [a1, a2],
                            },
                        },
                    ]
                );
            });
            it('should load the atoms that were added to the branch by another device', async () => {
                await server.connect(device1Info);
                await server.connect(device2Info);
                await server.connect(device3Info);

                const a1 = atom(atomId('a', 1), null, {});
                const a2 = atom(atomId('a', 2), a1, {});

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'testBranch',
                    temporary: true,
                });

                await server.addAtoms(device2Info.connectionId, {
                    branch: 'testBranch',
                    atoms: [a1, a2],
                });

                await server.watchBranch(device3Info.connectionId, {
                    branch: 'testBranch',
                    temporary: true,
                });

                expect(messenger.getMessages(device1Info.connectionId)).toEqual(
                    [
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'testBranch',
                                atoms: [],
                            },
                        },
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'testBranch',
                                atoms: [a1, a2],
                            },
                        },
                    ]
                );

                expect(messenger.getMessages(device2Info.connectionId)).toEqual(
                    [
                        {
                            name: ATOMS_RECEIVED,
                            data: {
                                branch: 'testBranch',
                                hashes: [a1.hash, a2.hash],
                            },
                        },
                    ]
                );

                expect(messenger.getMessages(device3Info.connectionId)).toEqual(
                    [
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'testBranch',
                                atoms: [a1, a2],
                            },
                        },
                    ]
                );
            });

            it('should delete the atoms once all devices have disconnected', async () => {
                await server.connect(device1Info);
                await server.connect(device2Info);
                await server.connect(device3Info);

                const a1 = atom(atomId('a', 1), null, {});
                const a2 = atom(atomId('a', 2), a1, {});

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'testBranch',
                    temporary: true,
                });

                await server.addAtoms(device2Info.connectionId, {
                    branch: 'testBranch',
                    atoms: [a1, a2],
                });

                await server.watchBranch(device3Info.connectionId, {
                    branch: 'testBranch',
                    temporary: true,
                });

                let atoms = await atomStore.loadAtoms('testBranch');
                expect(atoms).toEqual([a1, a2]);

                await server.disconnect(device1Info.connectionId);

                atoms = await atomStore.loadAtoms('testBranch');
                expect(atoms).toEqual([a1, a2]);

                await server.disconnect(device2Info.connectionId);

                atoms = await atomStore.loadAtoms('testBranch');
                expect(atoms).toEqual([a1, a2]);

                await server.disconnect(device3Info.connectionId);

                atoms = await atomStore.loadAtoms('testBranch');
                expect(atoms).toEqual([]);
            });

            it('should not send a add_atoms event to the device that added the atoms', async () => {
                await server.connect(device1Info);

                const a1 = atom(atomId('a', 1), null, {});
                const a2 = atom(atomId('a', 2), a1, {});

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'testBranch',
                });

                await server.addAtoms(device1Info.connectionId, {
                    branch: 'testBranch',
                    atoms: [a1, a2],
                });

                expect(messenger.getMessages(device1Info.connectionId)).toEqual(
                    [
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'testBranch',
                                atoms: [],
                            },
                        },
                        {
                            name: ATOMS_RECEIVED,
                            data: {
                                branch: 'testBranch',
                                hashes: [a1.hash, a2.hash],
                            },
                        },
                    ]
                );
            });

            it('should be able to load a temporary branch immediately after loading a persistent branch', async () => {
                await server.connect(device1Info);

                const a1 = atom(atomId('a', 1), null, {});
                const a2 = atom(atomId('a', 2), a1, {});

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'persistentBranch',
                });

                await server.watchBranch(device1Info.connectionId, {
                    branch: 'tempBranch',
                    temporary: true,
                });

                await server.addAtoms(device1Info.connectionId, {
                    branch: 'tempBranch',
                    atoms: [a1, a2],
                });

                expect(messenger.getMessages(device1Info.connectionId)).toEqual(
                    [
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'persistentBranch',
                                atoms: [],
                            },
                        },
                        {
                            name: ADD_ATOMS,
                            data: {
                                branch: 'tempBranch',
                                atoms: [],
                            },
                        },
                        {
                            name: ATOMS_RECEIVED,
                            data: {
                                branch: 'tempBranch',
                                hashes: [a1.hash, a2.hash],
                            },
                        },
                    ]
                );
            });
        });
    });

    // describe(GET_BRANCH, () => {
    //     it('should load the given branch and send the current atoms', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const getBranch = new Subject<string>();
    //         device.events.set(GET_BRANCH, getBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         getBranch.next('testBranch');

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should create a new orphan branch if the branch name does not exist', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const getBranch = new Subject<string>();
    //         device.events.set(GET_BRANCH, getBranch);

    //         connections.connection.next(device);

    //         await waitAsync();

    //         getBranch.next('testBranch');

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not send additional atoms that were added after the GET_BRANCH call', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const device2 = new MemoryConnection(device2Info);
    //         const getBranch = new Subject<string>();
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(GET_BRANCH, getBranch);
    //         device2.events.set(ADD_ATOMS, addAtoms);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const b1 = atom(atomId('b', 1), null, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         getBranch.next('testBranch');

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [b1],
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    describe(UNWATCH_BRANCH, () => {
        it('should stop sending new atoms to devices that have left a branch', async () => {
            await server.connect(device1Info);
            await server.connect(device2Info);

            const a1 = atom(atomId('a', 1), null, {});
            const a2 = atom(atomId('a', 2), a1, {});
            const a3 = atom(atomId('a', 3), a2, {});
            const a4 = atom(atomId('a', 4), a3, {});

            await server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
            });

            await server.addAtoms(device2Info.connectionId, {
                branch: 'testBranch',
                atoms: [a1, a2],
            });

            await server.unwatchBranch(device1Info.connectionId, 'testBranch');

            await server.addAtoms(device2Info.connectionId, {
                branch: 'testBranch',
                atoms: [a3, a4],
            });

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [],
                    },
                },
                {
                    name: ADD_ATOMS,
                    data: {
                        branch: 'testBranch',
                        atoms: [a1, a2],
                    },
                },
            ]);
        });

        it('should do nothing if the branch is already unloaded', async () => {
            await server.connect(device1Info);

            await server.unwatchBranch(device1Info.connectionId, 'testBranch');

            expect(messenger.getMessages(device1Info.connectionId)).toEqual([]);
        });

        it('should delete temporary atoms when all devices have left the branch', async () => {
            await server.connect(device1Info);
            await server.connect(device2Info);

            const a1 = atom(atomId('a', 1), null, {});
            const a2 = atom(atomId('a', 2), a1, {});
            const a3 = atom(atomId('a', 3), a2, {});
            const a4 = atom(atomId('a', 4), a3, {});

            await server.watchBranch(device1Info.connectionId, {
                branch: 'testBranch',
                temporary: true,
            });

            await server.watchBranch(device2Info.connectionId, {
                branch: 'testBranch',
                temporary: true,
            });

            await server.addAtoms(device2Info.connectionId, {
                branch: 'testBranch',
                atoms: [a1, a2, a3, a4],
            });

            await server.unwatchBranch(device1Info.connectionId, 'testBranch');

            expect(await atomStore.loadAtoms('testBranch')).toEqual([
                a1,
                a2,
                a3,
                a4,
            ]);

            await server.unwatchBranch(device2Info.connectionId, 'testBranch');

            expect(await atomStore.loadAtoms('testBranch')).toEqual([]);
        });
    });

    // describe(WATCH_BRANCHES, () => {
    //     it('should issue an event when a branch is loaded', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         const device2 = new MemoryConnection(device2Info);
    //         const watchBranches = new Subject<void>();
    //         device2.events.set(WATCH_BRANCHES, watchBranches);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchBranches.next();
    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: LOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should issue an event for each branch that is already loaded', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         const device2 = new MemoryConnection(device2Info);
    //         const watchBranches = new Subject<void>();
    //         device2.events.set(WATCH_BRANCHES, watchBranches);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         watchBranches.next();
    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch2',
    //         });
    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: LOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //             {
    //                 name: LOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch2',
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should issue an event when a branch is unloaded via unwatching leaving', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         const leaveBranch = new Subject<string>();
    //         device.events.set(WATCH_BRANCH, joinBranch);
    //         device.events.set(UNWATCH_BRANCH, leaveBranch);

    //         const device2 = new MemoryConnection(device2Info);
    //         const watchBranches = new Subject<void>();
    //         device2.events.set(WATCH_BRANCHES, watchBranches);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchBranches.next();
    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         leaveBranch.next('testBranch');
    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: LOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //             {
    //                 name: UNLOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should issue an event when a branch is unloaded via disconnecting', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         const leaveBranch = new Subject<string>();
    //         device.events.set(WATCH_BRANCH, joinBranch);
    //         device.events.set(UNWATCH_BRANCH, leaveBranch);

    //         const device2 = new MemoryConnection(device2Info);
    //         const watchBranches = new Subject<void>();
    //         device2.events.set(WATCH_BRANCHES, watchBranches);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchBranches.next();
    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         device.disconnect.next();
    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: LOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //             {
    //                 name: UNLOAD_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(ADD_ATOMS, () => {
    //     it('should add the given atoms to the given branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },

    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not add atoms that violate cardinality', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(
    //             atomId('a', 1, undefined, { group: 'abc', number: 1 }),
    //             null,
    //             {}
    //         );
    //         const a2 = atom(
    //             atomId('a', 2, undefined, { group: 'abc', number: 1 }),
    //             null,
    //             {}
    //         );

    //         const idx = index();
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [idx, c]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a1, a2],
    //         });

    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a1.hash, a2.hash],
    //                 },
    //             },

    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should notify all other devices connected to the branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a3],
    //                 },
    //             },
    //         ]);

    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a3],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not notify the device that sent the new atoms', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },

    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should immediately store the added atoms', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toEqual({
    //             type: 'atom',
    //             data: a3,
    //         });
    //     });

    //     it('should store the given atoms with the current branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const [repoAtom] = await store.getObjects('testBranch', [a3.hash]);
    //         expect(repoAtom).toEqual({
    //             type: 'atom',
    //             data: a3,
    //         });
    //     });

    //     it('should not send atoms that are already in the current commit', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);

    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should add the atoms to the stage store', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const stage = await stageStore.getStage('testBranch');

    //         expect(stage).toEqual({
    //             additions: [a3],
    //             deletions: {},
    //         });
    //     });

    //     it('should remove the given atoms from the given branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const removeAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, removeAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         removeAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },

    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not remove the given atoms if they are part of a cardinality tree', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const removeAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, removeAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(
    //             atomId('a', 1, undefined, { group: 'abc', number: 1 }),
    //             null,
    //             {}
    //         );
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         removeAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },

    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should notify all other devices connected to the branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const removeAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, removeAtoms);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         removeAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     removedAtoms: [a3.hash],
    //                 },
    //             },
    //         ]);

    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     removedAtoms: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not notify the device that removed the atoms', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const removeAtoms = new Subject<AddAtomsEvent>();
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(ADD_ATOMS, removeAtoms);
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         removeAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },

    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should not send atoms that were already removed from the current commit', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const removeAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, removeAtoms);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         removeAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //         ]);

    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2],
    //                 },
    //             },
    //         ]);

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should add the removed atoms to the stage store', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2, a3);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             removedAtoms: [a3.hash],
    //         });

    //         await waitAsync();

    //         const stage = await stageStore.getStage('testBranch');

    //         expect(stage).toEqual({
    //             additions: [],
    //             deletions: {
    //                 [a3.hash]: atomIdToString(a3.id),
    //             },
    //         });
    //     });

    //     it('should ignore when given an event with a null branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: null,
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toBe(null);
    //     });

    //     it('should not crash if adding atoms to a branch that does not exist', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         connections.connection.next(device);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         addAtoms.next({
    //             branch: 'abc',
    //             atoms: [a1, a2, a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toBe(null);
    //     });

    //     describe('temp', () => {
    //         it('should not store the given atoms with the current branch', async () => {
    //             server.init();

    //             const device = new MemoryConnection(device1Info);
    //             const addAtoms = new Subject<AddAtomsEvent>();
    //             device.events.set(ADD_ATOMS, addAtoms);

    //             const joinBranch = new Subject<WatchBranchEvent>();
    //             device.events.set(WATCH_BRANCH, joinBranch);

    //             connections.connection.next(device);

    //             await waitAsync();

    //             joinBranch.next({
    //                 branch: '@testBranch',
    //                 temporary: true,
    //             });

    //             const a1 = atom(atomId('a', 1), null, {});
    //             const a2 = atom(atomId('a', 2), a1, {});
    //             const a3 = atom(atomId('a', 3), a2, {});

    //             const idx = index(a1, a2);
    //             const c = commit('message', new Date(2019, 9, 4), idx, null);
    //             const b = branch('@testBranch', c);

    //             await storeData(store, '@testBranch', idx.data.hash, [
    //                 a1,
    //                 a2,
    //                 idx,
    //                 c,
    //             ]);
    //             await updateBranch(store, b);

    //             addAtoms.next({
    //                 branch: '@testBranch',
    //                 atoms: [a3],
    //             });

    //             await waitAsync();

    //             const [repoAtom] = await store.getObjects('@testBranch', [
    //                 a3.hash,
    //             ]);
    //             expect(repoAtom).toBeFalsy();
    //         });

    //         it('should notify all other devices connected to the branch', async () => {
    //             server.init();

    //             const device = new MemoryConnection(device1Info);
    //             const addAtoms = new Subject<AddAtomsEvent>();
    //             device.events.set(ADD_ATOMS, addAtoms);

    //             const device2 = new MemoryConnection(device2Info);
    //             const joinBranch2 = new Subject<WatchBranchEvent>();
    //             device2.events.set(WATCH_BRANCH, joinBranch2);

    //             const device3 = new MemoryConnection(device3Info);
    //             const joinBranch3 = new Subject<WatchBranchEvent>();
    //             device3.events.set(WATCH_BRANCH, joinBranch3);

    //             connections.connection.next(device);
    //             connections.connection.next(device2);
    //             connections.connection.next(device3);

    //             await waitAsync();

    //             const a1 = atom(atomId('a', 1), null, {});

    //             joinBranch2.next({
    //                 branch: '@testBranch',
    //                 temporary: true,
    //             });
    //             joinBranch3.next({
    //                 branch: '@testBranch',
    //                 temporary: true,
    //             });

    //             await waitAsync();

    //             addAtoms.next({
    //                 branch: '@testBranch',
    //                 atoms: [a1],
    //             });

    //             await waitAsync();

    //             expect(device2.messages).toEqual([
    //                 {
    //                     name: ADD_ATOMS,
    //                     data: {
    //                         branch: '@testBranch',
    //                         atoms: [],
    //                     },
    //                 },
    //                 {
    //                     name: ADD_ATOMS,
    //                     data: {
    //                         branch: '@testBranch',
    //                         atoms: [a1],
    //                     },
    //                 },
    //             ]);

    //             expect(device3.messages).toEqual([
    //                 {
    //                     name: ADD_ATOMS,
    //                     data: {
    //                         branch: '@testBranch',
    //                         atoms: [],
    //                     },
    //                 },
    //                 {
    //                     name: ADD_ATOMS,
    //                     data: {
    //                         branch: '@testBranch',
    //                         atoms: [a1],
    //                     },
    //                 },
    //             ]);
    //         });
    //     });

    //     it('should prevent adding atoms to a branch that has a password', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);
    //         const hash1 = hashPassword('password');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toBe(null);

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             // in this case, no atoms were accepted
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should allow adding atoms to a branch that has a password when authenticated', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const authenticate = new Subject<AuthenticateBranchWritesEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(AUTHENTICATE_BRANCH_WRITES, authenticate);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);
    //         const hash1 = hashPassword('password');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         authenticate.next({
    //             branch: 'testBranch',
    //             password: 'password',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toEqual({
    //             type: 'atom',
    //             data: a3,
    //         });

    //         expect(device.messages.slice(2)).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             // in this case, no atoms were accepted
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should remember that the device is authenticated if the device authenticates without watching', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const authenticate = new Subject<AuthenticateBranchWritesEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(AUTHENTICATE_BRANCH_WRITES, authenticate);

    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);
    //         const hash1 = hashPassword('password');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         authenticate.next({
    //             branch: 'testBranch',
    //             password: 'password',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toEqual({
    //             type: 'atom',
    //             data: a3,
    //         });

    //         expect(device.messages).toEqual([
    //             {
    //                 name: AUTHENTICATED_TO_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                     authenticated: true,
    //                 },
    //             },
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             // in this case, no atoms were accepted
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(COMMIT, () => {
    //     it('should commit the current changes to the branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const makeCommit = new Subject<CommitEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(COMMIT, makeCommit);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         makeCommit.next({
    //             branch: 'testBranch',
    //             message: 'newCommit',
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const data = await loadBranch(store, testBranch);

    //         expect(data.commit.message).toBe('newCommit');
    //         expect(data.commit.previousCommit).toBe(c.hash);
    //         expect(data.atoms).toEqual(
    //             new Map([[a1.hash, a1], [a2.hash, a2], [a3.hash, a3]])
    //         );
    //     });

    //     it('should send the new commit to all devices watching for commits', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const makeCommit = new Subject<CommitEvent>();
    //         const watchCommits = new Subject<string>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(COMMIT, makeCommit);
    //         device.events.set(WATCH_COMMITS, watchCommits);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         watchCommits.next('testBranch');

    //         await waitAsync();

    //         makeCommit.next({
    //             branch: 'testBranch',
    //             message: 'newCommit',
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const newCommit = await store.getObject(testBranch.hash);

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //             {
    //                 name: ADD_COMMITS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     commits: [c],
    //                 },
    //             },
    //             {
    //                 name: ADD_COMMITS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     commits: [newCommit],
    //                 },
    //             },
    //             {
    //                 name: COMMIT_CREATED,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should finish the commit operation before allowing new atoms', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const makeCommit = new Subject<CommitEvent>();
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(WATCH_BRANCH, joinBranch);
    //         device.events.set(COMMIT, makeCommit);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});
    //         const a6 = atom(atomId('a', 6), a2, {});
    //         // const a7 = atom(atomId('a', 7), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         makeCommit.next({
    //             branch: 'testBranch',
    //             message: 'newCommit',
    //         });

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a4, a5, a6],
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const data = await loadBranch(store, testBranch);

    //         expect(data.commit.message).toBe('newCommit');
    //         expect(data.commit.previousCommit).toBe(c.hash);
    //         expect(data.atoms).toEqual(
    //             new Map([[a1.hash, a1], [a2.hash, a2], [a3.hash, a3]])
    //         );

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         // Should have the newly added atoms in the stage
    //         expect(device.messages.slice(3)).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3, a4, a5, a6],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send a commit created event to the device that requested the commit', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const makeCommit = new Subject<CommitEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(COMMIT, makeCommit);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         makeCommit.next({
    //             branch: 'testBranch',
    //             message: 'newCommit',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //             {
    //                 name: COMMIT_CREATED,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(WATCH_COMMITS, () => {
    //     it('should send the commits for the branch when first connected', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchCommits = new Subject<string>();
    //         device.events.set(WATCH_COMMITS, watchCommits);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx1 = index(a1, a2);
    //         const idx2 = index(a1, a2, a3);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchCommits.next('testBranch');

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             // Server should send all the existing commits
    //             {
    //                 name: ADD_COMMITS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     commits: [c2, c1],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(CHECKOUT, () => {
    //     it('should reset the given branch to the given commit', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const checkout = new Subject<CheckoutEvent>();
    //         device.events.set(CHECKOUT, checkout);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx1 = index(a1, a2);
    //         const idx2 = index(a1, a2, a3);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         checkout.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const branchCommit = await store.getObject(testBranch.hash);

    //         expect(branchCommit).toEqual(c1);
    //     });

    //     it(`should send a RESET event with the new state`, async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const checkout = new Subject<CheckoutEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(CHECKOUT, checkout);
    //         device.events.set(WATCH_BRANCH, watchBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});

    //         const idx1 = index(a1, a2, a3);
    //         const idx2 = index(a1, a2, a4, a5);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a4,
    //             a5,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         checkout.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a4, a5],
    //                 },
    //             },
    //             {
    //                 name: RESET,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);
    //     });

    //     it(`should handle resetting atoms with cardinality constraints`, async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const checkout = new Subject<CheckoutEvent>();
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(CHECKOUT, checkout);
    //         device.events.set(WATCH_BRANCH, watchBranch);
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         connections.connection.next(device);

    //         const a1 = atom(
    //             atomId('a', 1, undefined, { group: 'abc', number: 2 }),
    //             null,
    //             {}
    //         );
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(
    //             atomId('a', 3, undefined, { group: 'abc', number: 2 }),
    //             null,
    //             {}
    //         );

    //         const b1 = atom(
    //             atomId('b', 1, undefined, { group: 'abc', number: 1 }),
    //             null,
    //             {}
    //         );
    //         const b2 = atom(atomId('b', 2), b1, {});

    //         const idx1 = index(a1, a2);
    //         const idx2 = index(b1, b2);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             b1,
    //             b2,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         checkout.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(RESTORE, () => {
    //     it('should create a commit referencing the restored commits index', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const restore = new Subject<RestoreEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(RESTORE, restore);
    //         device.events.set(WATCH_BRANCH, watchBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});

    //         const idx1 = index(a1, a2, a3);
    //         const idx2 = index(a1, a2, a4, a5);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             a4,
    //             a5,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         restore.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const branchCommit = await store.getObject(testBranch.hash);

    //         expect(branchCommit).toEqual({
    //             type: 'commit',
    //             message: `Restore to ${c1.hash}`,
    //             time: expect.any(Date),
    //             hash: expect.any(String),
    //             index: c1.index,
    //             previousCommit: c2.hash,
    //         });
    //     });

    //     it('should commit uncommitted changes', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const restore = new Subject<RestoreEvent>();
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(RESTORE, restore);
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(WATCH_BRANCH, watchBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});
    //         const a6 = atom(atomId('a', 6), a2, {});

    //         const idx1 = index(a1, a2, a3);
    //         const idx2 = index(a1, a2, a4, a5);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a4,
    //             a5,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a6],
    //         });

    //         await waitAsync();

    //         restore.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         const [testBranch] = await store.getBranches('testBranch');
    //         const branchCommit = (await store.getObject(
    //             testBranch.hash
    //         )) as CausalRepoCommit;
    //         const changesCommit = (await store.getObject(
    //             branchCommit.previousCommit
    //         )) as CausalRepoCommit;
    //         const data = await loadCommit(store, 'testBranch', changesCommit);

    //         expect(branchCommit).toEqual({
    //             type: 'commit',
    //             message: `Restore to ${c1.hash}`,
    //             time: expect.any(Date),
    //             hash: expect.any(String),
    //             index: c1.index,
    //             previousCommit: changesCommit.hash,
    //         });

    //         expect(changesCommit).toEqual({
    //             type: 'commit',
    //             message: `Save testBranch before restore`,
    //             time: expect.any(Date),
    //             hash: expect.any(String),
    //             index: expect.any(String),
    //             previousCommit: c2.hash,
    //         });
    //         expect(data.atoms).toEqual(
    //             new Map([
    //                 [a1.hash, a1],
    //                 [a2.hash, a2],
    //                 [a4.hash, a4],
    //                 [a5.hash, a5],
    //                 [a6.hash, a6],
    //             ])
    //         );
    //     });

    //     it(`should send a RESET event with the new state`, async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const restore = new Subject<RestoreEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(RESTORE, restore);
    //         device.events.set(WATCH_BRANCH, watchBranch);

    //         connections.connection.next(device);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});

    //         const idx1 = index(a1, a2, a3);
    //         const idx2 = index(a1, a2, a4, a5);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a4,
    //             a5,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         restore.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a4, a5],
    //                 },
    //             },
    //             {
    //                 name: RESET,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //             {
    //                 name: RESTORED,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //         ]);
    //     });

    //     it(`should handle resetting atoms with cardinality constraints`, async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const restore = new Subject<RestoreEvent>();
    //         const watchBranch = new Subject<WatchBranchEvent>();
    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         device.events.set(RESTORE, restore);
    //         device.events.set(WATCH_BRANCH, watchBranch);
    //         device.events.set(ADD_ATOMS, addAtoms);

    //         connections.connection.next(device);

    //         const a1 = atom(
    //             atomId('a', 1, undefined, { group: 'abc', number: 2 }),
    //             null,
    //             {}
    //         );
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(
    //             atomId('a', 3, undefined, { group: 'abc', number: 2 }),
    //             null,
    //             {}
    //         );

    //         const b1 = atom(
    //             atomId('b', 1, undefined, { group: 'abc', number: 1 }),
    //             null,
    //             {}
    //         );
    //         const b2 = atom(atomId('b', 2), b1, {});

    //         const idx1 = index(a1, a2);
    //         const idx2 = index(b1, b2);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             b1,
    //             b2,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         restore.next({
    //             branch: 'testBranch',
    //             commit: c1.hash,
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         watchBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: RESTORED,
    //                 data: {
    //                     branch: 'testBranch',
    //                 },
    //             },
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [a3.hash],
    //                 },
    //             },
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [a1, a2, a3],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(SEND_EVENT, () => {
    //     it('should notify the device that the event was sent to', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remote(
    //                 {
    //                     type: 'abc',
    //                 },
    //                 {
    //                     sessionId: device3Info.claims[SESSION_ID_CLAIM],
    //                 }
    //             ),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceEvent(device1Info, {
    //                         type: 'abc',
    //                     }),
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send remote events to the default selector if none is specified', async () => {
    //         server.defaultDeviceSelector = {
    //             sessionId: device2Info.claims[SESSION_ID_CLAIM],
    //         };
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remote({
    //                 type: 'abc',
    //             }),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceEvent(device1Info, {
    //                         type: 'abc',
    //                     }),
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should broadcast to all devices if broadcast is true', async () => {
    //         server.defaultDeviceSelector = {
    //             sessionId: device2Info.claims[SESSION_ID_CLAIM],
    //         };
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remote(
    //                 {
    //                     type: 'abc',
    //                 },
    //                 {
    //                     broadcast: true,
    //                 }
    //             ),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceEvent(device1Info, {
    //                         type: 'abc',
    //                     }),
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceEvent(device1Info, {
    //                         type: 'abc',
    //                     }),
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should relay the task ID from the remote action to the device action', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remote(
    //                 {
    //                     type: 'abc',
    //                 },
    //                 {
    //                     sessionId: device3Info.claims[SESSION_ID_CLAIM],
    //                 },
    //                 undefined,
    //                 'task1'
    //             ),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceEvent(
    //                         device1Info,
    //                         {
    //                             type: 'abc',
    //                         },
    //                         'task1'
    //                     ),
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should convert a remote action result to a device action result', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remoteResult(
    //                 'data',
    //                 {
    //                     sessionId: device3Info.claims[SESSION_ID_CLAIM],
    //                 },
    //                 'task1'
    //             ),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceResult(device1Info, 'data', 'task1'),
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should convert a remote action error to a device action error', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const sendEvent = new Subject<SendRemoteActionEvent>();
    //         device.events.set(SEND_EVENT, sendEvent);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         sendEvent.next({
    //             branch: 'testBranch',
    //             action: remoteError(
    //                 'data',
    //                 {
    //                     sessionId: device3Info.claims[SESSION_ID_CLAIM],
    //                 },
    //                 'task1'
    //             ),
    //         });

    //         await waitAsync();

    //         expect(device2.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //         ]);
    //         expect(device3.messages).toEqual([
    //             {
    //                 name: ADD_ATOMS,
    //                 data: {
    //                     branch: 'testBranch',
    //                     atoms: [],
    //                 },
    //             },
    //             {
    //                 name: RECEIVE_EVENT,
    //                 data: {
    //                     branch: 'testBranch',
    //                     action: deviceError(device1Info, 'data', 'task1'),
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(WATCH_DEVICES, () => {
    //     it('should send an event when a device connects to a branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<void>();
    //         device.events.set(WATCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next();
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send an event when a device unwatches a branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<void>();
    //         device.events.set(WATCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         const leaveBranch2 = new Subject<string>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);
    //         device2.events.set(UNWATCH_BRANCH, leaveBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next();
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         leaveBranch2.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_DISCONNECTED_FROM_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: 'testBranch',
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send an event when a device disconnects', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<void>();
    //         device.events.set(WATCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next();
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         device2.disconnect.next();
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_DISCONNECTED_FROM_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: 'testBranch',
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send events for all the currently loaded branches and devices', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<void>();
    //         device.events.set(WATCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         const device4 = new MemoryConnection(device4Info);
    //         const joinBranch4 = new Subject<WatchBranchEvent>();
    //         device4.events.set(WATCH_BRANCH, joinBranch4);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);
    //         connections.connection.next(device4);
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         joinBranch3.next({
    //             branch: 'testBranch2',
    //         });
    //         await waitAsync();

    //         joinBranch4.next({
    //             branch: 'testBranch2',
    //         });
    //         await waitAsync();

    //         watchDevices.next();
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch2',
    //                     },
    //                     device: device3Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch2',
    //                     },
    //                     device: device4Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should include whether the branch is temporary when a device connects', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<void>();
    //         device.events.set(WATCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next();
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //             temporary: true,
    //         });
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: true,
    //                     branch: {
    //                         branch: 'testBranch',
    //                         temporary: true,
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(WATCH_BRANCH_DEVICES, () => {
    //     it('should send an event when a device connects to a branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send an event when a device unwatches a branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         const leaveBranch2 = new Subject<string>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);
    //         device2.events.set(UNWATCH_BRANCH, leaveBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         leaveBranch2.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_DISCONNECTED_FROM_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: 'testBranch',
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send an event when a device disconnects', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         device2.disconnect.next();
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_DISCONNECTED_FROM_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: 'testBranch',
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send events for all the currently connected devices only for the specified branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         const device3 = new MemoryConnection(device3Info);
    //         const joinBranch3 = new Subject<WatchBranchEvent>();
    //         device3.events.set(WATCH_BRANCH, joinBranch3);

    //         const device4 = new MemoryConnection(device4Info);
    //         const joinBranch4 = new Subject<WatchBranchEvent>();
    //         device4.events.set(WATCH_BRANCH, joinBranch4);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);
    //         connections.connection.next(device4);
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         joinBranch3.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         joinBranch4.next({
    //             branch: 'testBranch2',
    //         });
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                     },
    //                     device: device3Info,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should include whether the branch is temporary when a device connects', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //             temporary: true,
    //         });
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICE_CONNECTED_TO_BRANCH,
    //                 data: {
    //                     broadcast: false,
    //                     branch: {
    //                         branch: 'testBranch',
    //                         temporary: true,
    //                     },
    //                     device: device2Info,
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(UNWATCH_BRANCH_DEVICES, () => {
    //     it('should not send an event when stopped watching', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const watchDevices = new Subject<string>();
    //         device.events.set(WATCH_BRANCH_DEVICES, watchDevices);
    //         const unwatchDevices = new Subject<string>();
    //         device.events.set(UNWATCH_BRANCH_DEVICES, unwatchDevices);

    //         const device2 = new MemoryConnection(device2Info);
    //         const joinBranch2 = new Subject<WatchBranchEvent>();
    //         device2.events.set(WATCH_BRANCH, joinBranch2);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         watchDevices.next('testBranch');
    //         await waitAsync();

    //         unwatchDevices.next('testBranch');
    //         await waitAsync();

    //         joinBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         await waitAsync();

    //         expect(device.messages).toEqual([]);
    //     });
    // });

    // describe(BRANCH_INFO, () => {
    //     it('should send a response with false when the given branch does not exist', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const branchInfo = new Subject<string>();
    //         device.events.set(BRANCH_INFO, branchInfo);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         branchInfo.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: BRANCH_INFO,
    //                 data: {
    //                     branch: 'testBranch',
    //                     exists: false,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send a response with true when the given branch exists', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const branchInfo = new Subject<string>();
    //         device.events.set(BRANCH_INFO, branchInfo);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         branchInfo.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: BRANCH_INFO,
    //                 data: {
    //                     branch: 'testBranch',
    //                     exists: true,
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(BRANCHES, () => {
    //     it('should send a response with the list of branch names', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const branches = new Subject<void>();
    //         device.events.set(BRANCHES, branches);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);
    //         const b2 = branch('testBranch2', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);
    //         await updateBranch(store, b2);

    //         branches.next();
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: BRANCHES,
    //                 data: {
    //                     branches: ['testBranch', 'testBranch2'],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(BRANCHES_STATUS, () => {
    //     it('should send a response with info about each branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const branches = new Subject<void>();
    //         device.events.set(BRANCHES_STATUS, branches);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);
    //         const b2 = branch('testBranch2', c, new Date(2019, 9, 5));
    //         const b3 = branch('testBranch3', c, new Date(2019, 9, 6));

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);
    //         await updateBranch(store, b2);
    //         await updateBranch(store, b3);

    //         branches.next();
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: BRANCHES_STATUS,
    //                 data: {
    //                     // should be sorted from most recently updated to least
    //                     // recently updated.
    //                     branches: [
    //                         {
    //                             branch: 'testBranch3',
    //                             lastUpdateTime: new Date(2019, 9, 6),
    //                         },
    //                         {
    //                             branch: 'testBranch2',
    //                             lastUpdateTime: new Date(2019, 9, 5),
    //                         },
    //                         {
    //                             branch: 'testBranch',
    //                             lastUpdateTime: null,
    //                         },
    //                     ],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(SET_BRANCH_PASSWORD, () => {
    //     it('should change the password if given the previous password', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const setPassword = new Subject<SetBranchPasswordEvent>();
    //         device.events.set(SET_BRANCH_PASSWORD, setPassword);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);
    //         const hash1 = hashPassword('password1');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);

    //         setPassword.next({
    //             branch: 'testBranch',
    //             oldPassword: 'password1',
    //             newPassword: 'newPassword',
    //         });

    //         await waitAsync();

    //         const storedSettings = await store.getBranchSettings('testBranch');

    //         expect(
    //             verifyPassword('newPassword', storedSettings.passwordHash)
    //         ).toBe(true);
    //     });

    //     it('should be able to set the password of a branch that doesnt have a password by using 3342 as the old password', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const setPassword = new Subject<SetBranchPasswordEvent>();
    //         device.events.set(SET_BRANCH_PASSWORD, setPassword);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);

    //         setPassword.next({
    //             branch: 'testBranch',
    //             oldPassword: '3342',
    //             newPassword: 'newPassword',
    //         });

    //         await waitAsync();

    //         const storedSettings = await store.getBranchSettings('testBranch');

    //         expect(
    //             verifyPassword('newPassword', storedSettings.passwordHash)
    //         ).toBe(true);
    //     });

    //     it('should not be able to set the password of a branch if the old password is wrong', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const setPassword = new Subject<SetBranchPasswordEvent>();
    //         device.events.set(SET_BRANCH_PASSWORD, setPassword);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);
    //         const hash1 = hashPassword('password1');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);

    //         setPassword.next({
    //             branch: 'testBranch',
    //             oldPassword: 'wrong',
    //             newPassword: 'newPassword',
    //         });

    //         await waitAsync();

    //         const storedSettings = await store.getBranchSettings('testBranch');

    //         expect(
    //             verifyPassword('newPassword', storedSettings.passwordHash)
    //         ).toBe(false);
    //     });

    //     it('should not allow adding atoms when the password was changed while authenticated', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const device2 = new MemoryConnection(device2Info);

    //         const addAtoms = new Subject<AddAtomsEvent>();
    //         const authenticate = new Subject<AuthenticateBranchWritesEvent>();
    //         const setPassword = new Subject<SetBranchPasswordEvent>();
    //         const joinBranch = new Subject<WatchBranchEvent>();
    //         device.events.set(ADD_ATOMS, addAtoms);
    //         device.events.set(AUTHENTICATE_BRANCH_WRITES, authenticate);
    //         device.events.set(WATCH_BRANCH, joinBranch);

    //         device2.events.set(SET_BRANCH_PASSWORD, setPassword);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const hash1 = hashPassword('password');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);
    //         const b = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b);

    //         joinBranch.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         authenticate.next({
    //             branch: 'testBranch',
    //             password: 'password',
    //         });

    //         await waitAsync();

    //         setPassword.next({
    //             branch: 'testBranch',
    //             oldPassword: 'password',
    //             newPassword: 'different',
    //         });

    //         await waitAsync();

    //         addAtoms.next({
    //             branch: 'testBranch',
    //             atoms: [a3],
    //         });

    //         await waitAsync();

    //         const repoAtom = await store.getObject(a3.hash);
    //         expect(repoAtom).toEqual(null);

    //         expect(device.messages.slice(1)).toEqual([
    //             {
    //                 name: AUTHENTICATED_TO_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                     authenticated: true,
    //                 },
    //             },

    //             // Disconnected because the password changed
    //             {
    //                 name: AUTHENTICATED_TO_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                     authenticated: false,
    //                 },
    //             },
    //             // Server should send a atoms received event
    //             // back indicating which atoms it processed
    //             // in this case, no atoms were accepted
    //             {
    //                 name: ATOMS_RECEIVED,
    //                 data: {
    //                     branch: 'testBranch',
    //                     hashes: [],
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(AUTHENTICATE_BRANCH_WRITES, () => {
    //     it('should respond with an message indicating that the password was wrong', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const authenticate = new Subject<AuthenticateBranchWritesEvent>();
    //         device.events.set(AUTHENTICATE_BRANCH_WRITES, authenticate);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);
    //         const hash1 = hashPassword('password1');
    //         const settings = branchSettings('testBranch', hash1);
    //         await store.saveSettings(settings);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);

    //         authenticate.next({
    //             branch: 'testBranch',
    //             password: 'wrong',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: AUTHENTICATED_TO_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                     authenticated: false,
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should be able to authenticate to branches without passwords by using 3342 as the password', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const authenticate = new Subject<AuthenticateBranchWritesEvent>();
    //         device.events.set(AUTHENTICATE_BRANCH_WRITES, authenticate);

    //         connections.connection.next(device);
    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});

    //         const idx = index(a1, a2);
    //         const c = commit('message', new Date(2019, 9, 4), idx, null);
    //         const b1 = branch('testBranch', c);

    //         await storeData(store, 'testBranch', idx.data.hash, [
    //             a1,
    //             a2,
    //             idx,
    //             c,
    //         ]);
    //         await updateBranch(store, b1);

    //         authenticate.next({
    //             branch: 'testBranch',
    //             password: '3342',
    //         });

    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: AUTHENTICATED_TO_BRANCH,
    //                 data: {
    //                     branch: 'testBranch',
    //                     authenticated: true,
    //                 },
    //             },
    //         ]);
    //     });
    // });

    // describe(DEVICES, () => {
    //     it('should send a response with the list of devices', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const device2 = new MemoryConnection(device2Info);
    //         const devices = new Subject<string>();
    //         device.events.set(DEVICES, devices);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         await waitAsync();

    //         devices.next(null);
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICES,
    //                 data: {
    //                     devices: [device1Info, device2Info],
    //                 },
    //             },
    //         ]);
    //     });

    //     it('should send a response with the list of devices that are connected to the given branch', async () => {
    //         server.init();

    //         const device = new MemoryConnection(device1Info);
    //         const device2 = new MemoryConnection(device2Info);
    //         const device3 = new MemoryConnection(device3Info);
    //         const devices = new Subject<string>();
    //         const watchBranch2 = new Subject<WatchBranchEvent>();
    //         const watchBranch3 = new Subject<WatchBranchEvent>();
    //         device.events.set(DEVICES, devices);
    //         device2.events.set(WATCH_BRANCH, watchBranch2);
    //         device3.events.set(WATCH_BRANCH, watchBranch3);

    //         connections.connection.next(device);
    //         connections.connection.next(device2);
    //         connections.connection.next(device3);

    //         await waitAsync();

    //         const a1 = atom(atomId('a', 1), null, {});
    //         const a2 = atom(atomId('a', 2), a1, {});
    //         const a3 = atom(atomId('a', 3), a2, {});
    //         const a4 = atom(atomId('a', 4), a2, {});
    //         const a5 = atom(atomId('a', 5), a2, {});
    //         const a6 = atom(atomId('a', 6), a2, {});

    //         const idx1 = index(a1, a2, a3);
    //         const idx2 = index(a1, a2, a4, a5);
    //         const c1 = commit('message', new Date(2019, 9, 4), idx1, null);
    //         const c2 = commit('message2', new Date(2019, 9, 4), idx2, c1);
    //         const b = branch('testBranch', c2);

    //         await storeData(store, 'testBranch', idx1.data.hash, [
    //             a1,
    //             a2,
    //             a3,
    //             idx1,
    //         ]);
    //         await storeData(store, 'testBranch', idx2.data.hash, [
    //             a1,
    //             a2,
    //             a4,
    //             a5,
    //             idx2,
    //         ]);
    //         await storeData(store, 'testBranch', null, [c1, c2]);
    //         await updateBranch(store, b);

    //         watchBranch2.next({
    //             branch: 'testBranch',
    //         });
    //         watchBranch3.next({
    //             branch: 'testBranch',
    //         });

    //         await waitAsync();

    //         devices.next('testBranch');
    //         await waitAsync();

    //         expect(device.messages).toEqual([
    //             {
    //                 name: DEVICES,
    //                 data: {
    //                     devices: [device2Info, device3Info],
    //                 },
    //             },
    //         ]);
    //     });
    // });
});
