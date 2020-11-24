import {
    AddAtomsEvent,
    ADD_ATOMS,
    ATOMS_RECEIVED,
    device,
    deviceError,
    DeviceInfo,
    deviceResult,
    DeviceSelector,
    DEVICE_CONNECTED_TO_BRANCH,
    DEVICE_DISCONNECTED_FROM_BRANCH,
    DEVICE_ID_CLAIM,
    RECEIVE_EVENT,
    RemoteAction,
    RemoteActionError,
    RemoteActionResult,
    SendRemoteActionEvent,
    SESSION_ID_CLAIM,
    USERNAME_CLAIM,
    WatchBranchEvent,
} from '@casual-simulation/causal-trees';
import { ApiaryAtomStore } from './ApiaryAtomStore';
// import { ApiaryAtomStore } from './ApiaryAtomStore';
import {
    ApiaryConnectionStore,
    DeviceConnection,
} from './ApiaryConnectionStore';
import { ApiaryMessenger } from './ApiaryMessenger';
import { MessagePacket } from './Events';
/**
 * Defines a class that is able to serve causal repos in realtime.
 */
export class CausalRepoServer {
    private _atomStore: ApiaryAtomStore;
    private _connectionStore: ApiaryConnectionStore;
    private _messenger: ApiaryMessenger;

    // private _connectionServer: ConnectionServer;
    // private _deviceManager: DeviceManager;
    // private _store: CausalRepoStore;
    // private _stage: CausalRepoStageStore;
    // private _repos: Map<string, RepoData>;
    // private _repoPromises: Map<string, Promise<RepoData>>;
    /**
     * The map of branch and device IDs to their site ID.
     */
    // private _branchSiteIds: Map<string, string>;
    // private _branches: Map<string, WatchBranchEvent>;

    // /**
    //  * A map of branches to the list of devices that are authenticated.
    //  */
    // private _branchAuthentications: Map<string, Set<DeviceConnection<any>>>;

    // /**
    //  * A map of device IDs to the list of branches they are authenticated in.
    //  */
    // private _deviceAuthentications: Map<string, Set<string>>;

    /**
     * Gets or sets the default device selector that should be used
     * for events that are sent without a selector.
     */
    defaultDeviceSelector: DeviceSelector;

    constructor(
        connectionStore: ApiaryConnectionStore,
        atomStore: ApiaryAtomStore,
        messenger: ApiaryMessenger
    ) {
        this._connectionStore = connectionStore;
        this._atomStore = atomStore;
        this._messenger = messenger;
        // this._connectionServer = server;
        // this._store = store;
        // this._deviceManager = new DeviceManagerImpl();
        // this._repos = new Map();
        // this._repoPromises = new Map();
        // this._branches = new Map();
        // this._branchSiteIds = new Map();
        // this._branchAuthentications = new Map();
        // this._deviceAuthentications = new Map();
        // this._stage = stageStore;
    }

    init() {
        this._setupServer();
    }

    async connect(connection: DeviceConnection): Promise<void> {
        await this._connectionStore.saveConnection(connection);
    }

    async disconnect(connectionId: string) {
        const loadedConnections = await this._connectionStore.getConnections(
            connectionId
        );
        await this._connectionStore.clearConnection(connectionId);

        for (let connection of loadedConnections) {
            if (isBranchConnection(connection.namespace)) {
                if (connection.temporary) {
                    const count = await this._connectionStore.countConnectionsByNamespace(
                        connection.namespace
                    );

                    if (count <= 0) {
                        // unload namespace
                        await this._atomStore.clearNamespace(
                            connection.namespace
                        );
                    }
                }

                const branch = branchFromNamespace(connection.namespace);
                const watchingDevices = await this._connectionStore.getConnectionsByNamespace(
                    watchBranchNamespace(branch)
                );

                await this._messenger.sendMessage(
                    watchingDevices.map((d) => d.connectionId),
                    {
                        name: DEVICE_DISCONNECTED_FROM_BRANCH,
                        data: {
                            broadcast: false,
                            branch: branch,
                            device: deviceInfo(connection),
                        },
                    }
                );
            }
        }
    }

    async handlePacket(connectionId: string, packet: MessagePacket) {}

    async watchBranch(connectionId: string, event: WatchBranchEvent) {
        if (!event) {
            console.warn(
                '[CasualRepoServer] Trying to watch branch with a null event!'
            );
            return;
        }

        const namespace = branchNamespace(event.branch);
        console.log(
            `[CausalRepoServer] [${namespace}] [${connectionId}] Watch`
        );

        const connection = await this._connectionStore.getConnection(
            connectionId
        );
        await this._connectionStore.saveNamespaceConnection({
            ...connection,
            namespace: namespace,
            temporary: event.temporary || false,
        });

        const atoms = await this._atomStore.loadAtoms(namespace);
        const watchingDevices = await this._connectionStore.getConnectionsByNamespace(
            watchBranchNamespace(event.branch)
        );

        console.log(
            `[CausalRepoServer] [${event.branch}] [${connectionId}] Connected.`
        );
        const promises = [
            this._messenger.sendMessage(
                watchingDevices.map((d) => d.connectionId),
                {
                    name: DEVICE_CONNECTED_TO_BRANCH,
                    data: {
                        broadcast: false,
                        branch: event,
                        device: deviceInfo(connection),
                    },
                }
            ),
            this._messenger.sendMessage([connection.connectionId], {
                name: ADD_ATOMS,
                data: {
                    branch: event.branch,
                    atoms: atoms,
                },
            }),
        ];
        await Promise.all(promises);
    }

    async unwatchBranch(connectionId: string, branch: string) {
        if (!branch) {
            console.warn(
                '[CasualRepoServer] Trying to unwatch branch with a null event!'
            );
            return;
        }

        const namespace = branchNamespace(branch);
        console.log(
            `[CausalRepoServer] [${namespace}] [${connectionId}] Unwatch`
        );

        const connection = await this._connectionStore.getNamespaceConnection(
            connectionId,
            namespace
        );
        if (connection) {
            await this._connectionStore.deleteNamespaceConnection(
                connectionId,
                namespace
            );
            if (connection.temporary) {
                const count = await this._connectionStore.countConnectionsByNamespace(
                    namespace
                );
                if (count <= 0) {
                    await this._atomStore.clearNamespace(connection.namespace);
                }
            }

            const watchingDevices = await this._connectionStore.getConnectionsByNamespace(
                watchBranchNamespace(branch)
            );

            await this._messenger.sendMessage(
                watchingDevices.map((d) => d.connectionId),
                {
                    name: DEVICE_DISCONNECTED_FROM_BRANCH,
                    data: {
                        broadcast: false,
                        branch: branch,
                        device: deviceInfo(connection),
                    },
                }
            );
        }
    }

    async addAtoms(connectionId: string, event: AddAtomsEvent) {
        if (!event) {
            console.warn(
                '[CasualRepoServer] Trying to add atoms with a null event!'
            );
            return;
        }

        const namespace = branchNamespace(event.branch);
        if (event.atoms) {
            await this._atomStore.saveAtoms(namespace, event.atoms);
        }
        if (event.removedAtoms) {
            await this._atomStore.deleteAtoms(namespace, event.removedAtoms);
        }

        const hasAdded = event.atoms && event.atoms.length > 0;
        const hasRemoved = event.removedAtoms && event.removedAtoms.length > 0;
        if (hasAdded || hasRemoved) {
            const connectedDevices = await this._connectionStore.getConnectionsByNamespace(
                namespace
            );

            let ret: AddAtomsEvent = {
                branch: event.branch,
            };

            if (hasAdded) {
                ret.atoms = event.atoms;
            }
            if (hasRemoved) {
                ret.removedAtoms = event.removedAtoms;
            }

            await this._messenger.sendMessage(
                connectedDevices.map((c) => c.connectionId),
                {
                    name: ADD_ATOMS,
                    data: ret,
                },
                connectionId
            );
        }

        const addedAtomHashes = (event.atoms || []).map((a) => a.hash);
        const removedAtomHashes = event.removedAtoms || [];
        await this._messenger.sendMessage([connectionId], {
            name: ATOMS_RECEIVED,
            data: {
                branch: event.branch,
                hashes: [...addedAtomHashes, ...removedAtomHashes],
            },
        });
    }

    async sendEvent(connectionId: string, event: SendRemoteActionEvent) {
        if (!event) {
            console.warn(
                '[CasualRepoServer] Trying to send event with a null event!'
            );
            return;
        }

        const namespace = branchNamespace(event.branch);
        const connectedDevices = await this._connectionStore.getConnectionsByNamespace(
            namespace
        );

        let finalAction: RemoteAction | RemoteActionResult | RemoteActionError;
        if (
            event.action.deviceId ||
            event.action.sessionId ||
            event.action.username ||
            (typeof event.action.broadcast !== 'undefined' &&
                event.action.broadcast !== null)
        ) {
            finalAction = event.action;
        } else {
            // TODO: Replace with system that selects target devices with better uniformity
            // than Math.random().
            const randomDeviceIndex = Math.min(
                connectedDevices.length - 1,
                Math.max(Math.floor(Math.random() * connectedDevices.length), 0)
            );
            const randomDevice = connectedDevices[randomDeviceIndex];
            finalAction = {
                ...event.action,
                sessionId: randomDevice.sessionId,
            };
        }

        const currentConnection = await this._connectionStore.getConnection(
            connectionId
        );

        if (!finalAction) {
            return;
        }
        const targetedDevices = connectedDevices.filter((d) =>
            isEventForDevice(finalAction, d)
        );
        const dEvent =
            finalAction.type === 'remote'
                ? device(
                      deviceInfo(currentConnection),
                      finalAction.event,
                      finalAction.taskId
                  )
                : finalAction.type === 'remote_result'
                ? deviceResult(
                      deviceInfo(currentConnection),
                      finalAction.result,
                      finalAction.taskId
                  )
                : deviceError(
                      deviceInfo(currentConnection),
                      finalAction.error,
                      finalAction.taskId
                  );

        await this._messenger.sendMessage(
            targetedDevices.map((c) => c.connectionId),
            {
                name: RECEIVE_EVENT,
                data: {
                    branch: event.branch,
                    action: dEvent,
                },
            }
        );
    }

    async watchBranchDevices(connectionId: string, branch: string) {
        const namespace = watchBranchNamespace(branch);
        console.log(
            `[CausalRepoServer] [${namespace}] [${connectionId}] Watch devices for branch`
        );

        const connection = await this._connectionStore.getConnection(
            connectionId
        );
        await this._connectionStore.saveNamespaceConnection({
            ...connection,
            namespace: namespace,
            temporary: true,
        });

        const currentDevices = await this._connectionStore.getConnectionsByNamespace(
            branchNamespace(branch)
        );
        const promises = currentDevices.map((device) =>
            this._messenger.sendMessage([connectionId], {
                name: DEVICE_CONNECTED_TO_BRANCH,
                data: {
                    broadcast: false,
                    branch: {
                        branch: branch,
                        temporary: device.temporary,
                    },
                    device: deviceInfo(device),
                },
            })
        );

        await Promise.all(promises);
    }

    private _setupServer() {
        // this._connectionServer.connection.subscribe(
        // async (conn: CausalRepoSession) => {
        //     const id = conn.device.claims[SESSION_ID_CLAIM];
        //     console.log(`[CausalRepoServer] Got Connection: ${id}`);
        //     const device = null as any;
        // await this._deviceManager.connectDevice(
        //     id,
        //     conn
        // );
        //     handleEvents(conn, {
        //         [WATCH_BRANCH]: async event => {
        //             if (!event) {
        //                 console.warn(
        //                     '[CasualRepoServer] Trying to watch branch with a null event!'
        //                 );
        //                 return;
        //             }
        //             const branch = event.branch;
        //             console.log(
        //                 `[CausalRepoServer] [${branch}] [${
        //                     device.id
        //                 }] Watch`
        //             );
        //             const info = infoForBranch(branch);
        //             // await this._deviceManager.joinChannel(device, info);
        //             let currentBranch = this._branches.get(branch);
        //             if (!currentBranch) {
        //                 this._branches.set(branch, event);
        //             }
        //             if (!event.temporary && event.siteId) {
        //                 this._branchSiteIds.set(
        //                     branchSiteIdKey(branch, device.id),
        //                     event.siteId
        //                 );
        //                 await this._store.logSite(
        //                     event.branch,
        //                     event.siteId,
        //                     'WATCH',
        //                     'watch_branch'
        //                 );
        //             }
        //             const repo = await this._getOrLoadRepo(
        //                 branch,
        //                 true,
        //                 event.temporary
        //             );
        //             const atoms = repo.repo.getAtoms();
        //             this._sendConnectedToBranch(device, branch);
        //             conn.send(ADD_ATOMS, {
        //                 branch: branch,
        //                 atoms: atoms,
        //             });
        //         },
        //         [GET_BRANCH]: async branch => {
        //             const info = infoForBranch(branch);
        //             const repo = await this._getOrLoadRepo(
        //                 branch,
        //                 true,
        //                 false
        //             );
        //             const atoms = repo.repo.getAtoms();
        //             conn.send(ADD_ATOMS, {
        //                 branch: branch,
        //                 atoms: atoms,
        //             });
        //             await this._tryUnloadBranch(info);
        //         },
        //         [ADD_ATOMS]: async event => {
        //             if (!event || !event.branch) {
        //                 return;
        //             }
        //             const branchEvent = this._branches.get(event.branch);
        //             const isTemp = branchEvent
        //                 ? branchEvent.temporary
        //                 : false;
        //             try {
        //                 const repo = await this._getOrLoadRepo(
        //                     event.branch,
        //                     false,
        //                     isTemp
        //                 );
        //                 // const authenticatedDevices = setForKey(
        //                 //     this._branchAuthentications,
        //                 //     event.branch
        //                 // );
        //                 // if (
        //                 //     repo.settings.passwordHash &&
        //                 //     !authenticatedDevices.has(device)
        //                 // ) {
        //                 //     sendToDevices([device], ATOMS_RECEIVED, {
        //                 //         branch: event.branch,
        //                 //         hashes: [],
        //                 //     });
        //                 //     return;
        //                 // }
        //                 let added: Atom<any>[];
        //                 let removed: Atom<any>[];
        //                 if (event.atoms) {
        //                     // Only allow adding atoms that were valid
        //                     // This lets us keep track of the special logic for cardinality.
        //                     let addable = event.atoms.filter(a => {
        //                         const result = repo.weave.insert(a);
        //                         return (
        //                             result.type === 'atom_added' ||
        //                             result.type === 'atom_already_added' ||
        //                             result.type === 'nothing_happened' ||
        //                             (result.type === 'conflict' &&
        //                                 result.winner === a)
        //                         );
        //                     });
        //                     added = repo.repo.add(...addable);
        //                     if (!isTemp) {
        //                         await this._stage.addAtoms(
        //                             event.branch,
        //                             added
        //                         );
        //                         await storeData(
        //                             this._store,
        //                             event.branch,
        //                             null,
        //                             added
        //                         );
        //                     }
        //                 }
        //                 if (event.removedAtoms) {
        //                     // Only allow removing atoms that are not part of a cardinality tree.
        //                     let removable = event.removedAtoms.filter(
        //                         hash => {
        //                             let node = repo.weave.getNodeByHash(
        //                                 hash
        //                             );
        //                             if (!node) {
        //                                 return true;
        //                             }
        //                             let chain = repo.weave.referenceChain(
        //                                 node.atom.id
        //                             );
        //                             return chain.every(
        //                                 node => !node.atom.id.cardinality
        //                             );
        //                         }
        //                     );
        //                     removed = repo.repo.remove(...removable);
        //                     if (!isTemp) {
        //                         await this._stage.removeAtoms(
        //                             event.branch,
        //                             removed
        //                         );
        //                     }
        //                 }
        //                 const hasAdded = added && added.length > 0;
        //                 const hasRemoved = removed && removed.length > 0;
        //                 if (hasAdded || hasRemoved) {
        //                     const info = infoForBranch(event.branch);
        //                     // const devices = this._deviceManager.getConnectedDevices(
        //                     //     info
        //                     // );
        //                     // let ret: AddAtomsEvent = {
        //                     //     branch: event.branch,
        //                     // };
        //                     // if (hasAdded) {
        //                     //     ret.atoms = added;
        //                     // }
        //                     // if (hasRemoved) {
        //                     //     ret.removedAtoms = removed.map(r => r.hash);
        //                     // }
        //                     // sendToDevices(devices, ADD_ATOMS, ret, device);
        //                 }
        //                 const addedAtomHashes = (event.atoms || []).map(
        //                     a => a.hash
        //                 );
        //                 const removedAtomHashes = event.removedAtoms || [];
        //                 sendToDevices([device], ATOMS_RECEIVED, {
        //                     branch: event.branch,
        //                     hashes: [
        //                         ...addedAtomHashes,
        //                         ...removedAtomHashes,
        //                     ],
        //                 });
        //             } catch (err) {
        //                 console.error(
        //                     `Error while adding atoms to ${event.branch}: `,
        //                     err
        //                 );
        //             }
        //         },
        //         [COMMIT]: async event => {
        //             const repo = await this._getOrLoadRepo(
        //                 event.branch,
        //                 false,
        //                 false
        //             );
        //             if (!repo) {
        //                 // TODO: Send an error event to the device
        //                 return;
        //             }
        //             if (repo.repo.hasChanges()) {
        //                 await this._commitToRepo(event, repo.repo);
        //                 sendToDevices([device], COMMIT_CREATED, {
        //                     branch: event.branch,
        //                 });
        //             }
        //         },
        //         [WATCH_COMMITS]: async branch => {
        //             const info = infoForBranchCommits(branch);
        //             await this._deviceManager.joinChannel(device, info);
        //             const repo = await this._getOrLoadRepo(
        //                 branch,
        //                 false,
        //                 false
        //             );
        //             if (!repo) {
        //                 return;
        //             }
        //             if (!repo.repo.currentCommit) {
        //                 return;
        //             }
        //             const commits = await listCommits(
        //                 this._store,
        //                 repo.repo.currentCommit.commit.hash
        //             );
        //             let e: AddCommitsEvent = {
        //                 branch: branch,
        //                 commits: commits,
        //             };
        //             conn.send(ADD_COMMITS, e);
        //         },
        //         [CHECKOUT]: async event => {
        //             const repo = await this._getOrLoadRepo(
        //                 event.branch,
        //                 true,
        //                 false
        //             );
        //             console.log(
        //                 `[CausalRepoServer] [${event.branch}] [${
        //                     event.commit
        //                 }] Checking out`
        //             );
        //             const current = repo.repo.currentCommit;
        //             await repo.repo.reset(event.commit);
        //             await this._stage.clearStage(event.branch);
        //             const after = repo.repo.currentCommit;
        //             // Reset the weave so that cardinality is properly calculated.
        //             repo.weave = new Weave();
        //             for (let atom of repo.repo.getAtoms()) {
        //                 repo.weave.insert(atom);
        //             }
        //             this._sendReset(after, event.branch);
        //         },
        //         [RESTORE]: async event => {
        //             const repo = await this._getOrLoadRepo(
        //                 event.branch,
        //                 true,
        //                 false
        //             );
        //             console.log(
        //                 `[CausalRepoServer] [${event.branch}] [${
        //                     event.commit
        //                 }] Restoring`
        //             );
        //             if (repo.repo.hasChanges()) {
        //                 await this._commitToRepo(
        //                     {
        //                         branch: event.branch,
        //                         message: `Save ${
        //                             event.branch
        //                         } before restore`,
        //                     },
        //                     repo.repo
        //                 );
        //             }
        //             const current = repo.repo.currentCommit;
        //             const oldCommit = await this._store.getObject(
        //                 event.commit
        //             );
        //             if (!oldCommit || oldCommit.type !== 'commit') {
        //                 console.log(
        //                     `[CausalRepoServer] [${event.branch}] [${
        //                         event.commit
        //                     }] Could not restore because it does not exist!`
        //                 );
        //                 return;
        //             }
        //             const newCommit = commit(
        //                 `Restore to ${event.commit}`,
        //                 new Date(),
        //                 oldCommit.index,
        //                 current ? current.commit : null
        //             );
        //             await storeData(this._store, event.branch, null, [
        //                 newCommit,
        //             ]);
        //             await repo.repo.reset(newCommit);
        //             const after = repo.repo.currentCommit;
        //             // Reset the weave so that cardinality is properly calculated.
        //             repo.weave = new Weave();
        //             for (let atom of repo.repo.getAtoms()) {
        //                 repo.weave.insert(atom);
        //             }
        //             this._sendCommits(event.branch, [newCommit]);
        //             this._sendReset(after, event.branch);
        //             sendToDevices([device], RESTORED, {
        //                 branch: event.branch,
        //             });
        //         },
        //         [SEND_EVENT]: async event => {
        //             const info = infoForBranch(event.branch);
        //             const connectedDevices = this._deviceManager.getConnectedDevices(
        //                 info
        //             );
        //             const devices = connectedDevices.map(
        //                 d => [d, d.extra.device as DeviceInfo] as const
        //             );
        //             let finalAction:
        //                 | RemoteAction
        //                 | RemoteActionResult
        //                 | RemoteActionError;
        //             if (
        //                 event.action.deviceId ||
        //                 event.action.sessionId ||
        //                 event.action.username ||
        //                 (typeof event.action.broadcast !== 'undefined' &&
        //                     event.action.broadcast !== null)
        //             ) {
        //                 finalAction = event.action;
        //             } else if (this.defaultDeviceSelector) {
        //                 finalAction = {
        //                     ...event.action,
        //                     ...this.defaultDeviceSelector,
        //                 };
        //             }
        //             if (!finalAction) {
        //                 return;
        //             }
        //             const targetedDevices = devicesForEvent(
        //                 finalAction,
        //                 devices
        //             );
        //             const dEvent =
        //                 finalAction.type === 'remote'
        //                     ? deviceEvent(
        //                           conn.device,
        //                           finalAction.event,
        //                           finalAction.taskId
        //                       )
        //                     : finalAction.type === 'remote_result'
        //                     ? deviceResult(
        //                           conn.device,
        //                           finalAction.result,
        //                           finalAction.taskId
        //                       )
        //                     : deviceError(
        //                           conn.device,
        //                           finalAction.error,
        //                           finalAction.taskId
        //                       );
        //             sendToDevices(targetedDevices, RECEIVE_EVENT, {
        //                 branch: event.branch,
        //                 action: dEvent,
        //             });
        //         },
        //         [UNWATCH_BRANCH]: async branch => {
        //             const info = infoForBranch(branch);
        //             const devices = this._deviceManager.getConnectedDevices(
        //                 info
        //             );
        //             if (devices.length <= 0) {
        //                 return;
        //             }
        //             await this._deviceManager.leaveChannel(device, info);
        //             const reason = 'unwatch_branch';
        //             await this._logDisconnectedFromBranch(
        //                 device,
        //                 branch,
        //                 reason
        //             );
        //             this._sendDisconnectedFromBranch(
        //                 device,
        //                 branch,
        //                 reason
        //             );
        //             await this._tryUnloadBranch(info);
        //         },
        //         [WATCH_BRANCHES]: async () => {
        //             const info = branchesInfo();
        //             await this._deviceManager.joinChannel(device, info);
        //             for (let branch of this._repos.keys()) {
        //                 conn.send(LOAD_BRANCH, loadBranchEvent(branch));
        //             }
        //         },
        //         [WATCH_DEVICES]: async () => {
        //             console.log(
        //                 `[CausalRepoServer] [${device.id}] Watch devices`
        //             );
        //             const info = devicesInfo();
        //             await this._deviceManager.joinChannel(device, info);
        //             const branches = this._repos.keys();
        //             for (let branch of branches) {
        //                 const branchEvent = this._branches.get(branch);
        //                 if (!branchEvent) {
        //                     continue;
        //                 }
        //                 const branchInfo = infoForBranch(branch);
        //                 const devices = this._deviceManager.getConnectedDevices(
        //                     branchInfo
        //                 );
        //                 for (let device of devices) {
        //                     conn.send(DEVICE_CONNECTED_TO_BRANCH, {
        //                         broadcast: true,
        //                         branch: branchEvent,
        //                         device: device.extra.device,
        //                     });
        //                 }
        //             }
        //         },
        //         [WATCH_BRANCH_DEVICES]: async branch => {
        //             console.log(
        //                 `[CausalRepoServer] [${branch}] [${
        //                     device.id
        //                 }] Watch devices for branch`
        //             );
        //             const info = devicesBranchInfo(branch);
        //             await this._deviceManager.joinChannel(device, info);
        //             const branches = this._repos.keys();
        //             const branchInfo = infoForBranch(branch);
        //             const devices = this._deviceManager.getConnectedDevices(
        //                 branchInfo
        //             );
        //             const branchEvent = this._branches.get(branch);
        //             if (!branchEvent) {
        //                 return;
        //             }
        //             for (let device of devices) {
        //                 conn.send(DEVICE_CONNECTED_TO_BRANCH, {
        //                     broadcast: false,
        //                     branch: branchEvent,
        //                     device: device.extra.device,
        //                 });
        //             }
        //         },
        //         [BRANCH_INFO]: async branch => {
        //             const branches = await this._store.getBranches(branch);
        //             const exists = branches.some(b => b.name === branch);
        //             conn.send(BRANCH_INFO, {
        //                 branch: branch,
        //                 exists: exists,
        //             });
        //         },
        //         [BRANCHES]: async () => {
        //             const branches = await this._store.getBranches(null);
        //             conn.send(BRANCHES, {
        //                 branches: branches.map(b => b.name),
        //             });
        //         },
        //         [BRANCHES_STATUS]: async () => {
        //             const branches = await this._store.getBranches(null);
        //             const sorted = orderBy(
        //                 branches,
        //                 [b => b.time || new Date(0, 1, 1)],
        //                 ['desc']
        //             );
        //             conn.send(BRANCHES_STATUS, {
        //                 branches: sorted.map(b => ({
        //                     branch: b.name,
        //                     lastUpdateTime: b.time || null,
        //                 })),
        //             });
        //         },
        //         [DEVICES]: async branch => {
        //             let devices: DeviceConnection<any>[];
        //             if (typeof branch !== 'undefined' && branch !== null) {
        //                 const info = infoForBranch(branch);
        //                 devices = this._deviceManager.getConnectedDevices(
        //                     info
        //                 );
        //             } else {
        //                 devices = this._deviceManager.connectedDevices;
        //             }
        //             conn.send(DEVICES, {
        //                 devices: devices.map(d => d.extra.device),
        //             });
        //         },
        //         [SET_BRANCH_PASSWORD]: async event => {
        //             const repo = this._repos.get(event.branch);
        //             const settings = !!repo
        //                 ? repo.settings
        //                 : (await this._store.getBranchSettings(
        //                       event.branch
        //                   )) || branchSettings(event.branch);
        //             let updateBranch = false;
        //             if (settings) {
        //                 if (!settings.passwordHash) {
        //                     if (event.oldPassword === '3342') {
        //                         updateBranch = true;
        //                     }
        //                 } else if (
        //                     verifyPassword(
        //                         event.oldPassword,
        //                         settings.passwordHash
        //                     ) === true
        //                 ) {
        //                     updateBranch = true;
        //                 }
        //             }
        //             if (updateBranch) {
        //                 console.log(
        //                     `[CausalRepoServer] [${
        //                         event.branch
        //                     }] Changing password.`
        //                 );
        //                 const newHash = hashPassword(event.newPassword);
        //                 const newSettings = {
        //                     ...settings,
        //                     passwordHash: newHash,
        //                 };
        //                 await this._store.saveSettings(newSettings);
        //                 if (repo) {
        //                     const authenticatedDevices = setForKey(
        //                         this._branchAuthentications,
        //                         event.branch
        //                     );
        //                     const authenticatedBranches = setForKey(
        //                         this._deviceAuthentications,
        //                         device.id
        //                     );
        //                     const unauthenticatedDevices = [
        //                         ...authenticatedDevices,
        //                     ];
        //                     authenticatedDevices.clear();
        //                     authenticatedBranches.delete(event.branch);
        //                     repo.settings = newSettings;
        //                     sendToDevices(
        //                         unauthenticatedDevices,
        //                         AUTHENTICATED_TO_BRANCH,
        //                         {
        //                             branch: event.branch,
        //                             authenticated: false,
        //                         } as AuthenticatedToBranchEvent
        //                     );
        //                 }
        //             }
        //         },
        //         [AUTHENTICATE_BRANCH_WRITES]: async event => {
        //             const info = infoForBranch(event.branch);
        //             let repo = await this._getOrLoadRepo(
        //                 event.branch,
        //                 false,
        //                 false
        //             );
        //             let valid = false;
        //             if (repo) {
        //                 const settings = repo.settings;
        //                 if (
        //                     (settings.passwordHash &&
        //                         verifyPassword(
        //                             event.password,
        //                             settings.passwordHash
        //                         ) === true) ||
        //                     (!settings.passwordHash &&
        //                         event.password === '3342')
        //                 ) {
        //                     const authenticatedDevices = setForKey(
        //                         this._branchAuthentications,
        //                         event.branch
        //                     );
        //                     const authenticatedBranches = setForKey(
        //                         this._deviceAuthentications,
        //                         device.id
        //                     );
        //                     authenticatedDevices.add(device);
        //                     authenticatedBranches.add(event.branch);
        //                     valid = true;
        //                 }
        //                 sendToDevices([device], AUTHENTICATED_TO_BRANCH, {
        //                     branch: event.branch,
        //                     authenticated: valid,
        //                 } as AuthenticatedToBranchEvent);
        //                 await this._tryUnloadBranch(info);
        //             }
        //         },
        //         [UNWATCH_BRANCHES]: async () => {},
        //         [UNWATCH_DEVICES]: async () => {},
        //         [UNWATCH_BRANCH_DEVICES]: async branch => {
        //             const info = devicesBranchInfo(branch);
        //             await this._deviceManager.leaveChannel(device, info);
        //         },
        //         [UNWATCH_COMMITS]: async () => {},
        //     }).subscribe();
        //     conn.disconnect.subscribe(async reason => {
        //         var channels = this._deviceManager.getConnectedChannels(
        //             device
        //         );
        //         this._deviceManager.disconnectDevice(device);
        //         for (let channel of channels) {
        //             await this._logDisconnectedFromBranch(
        //                 device,
        //                 channel.info.id,
        //                 reason
        //             );
        //             this._sendDisconnectedFromBranch(
        //                 device,
        //                 channel.info.id,
        //                 reason
        //             );
        //             await this._tryUnloadBranch(channel.info);
        //         }
        //     });
        // }
        // );
    }

    // private _sendReset(after: CommitData, branch: string) {
    //     const info = infoForBranch(branch);
    //     const devices = this._deviceManager.getConnectedDevices(info);
    //     let ret: ResetEvent = {
    //         branch: branch,
    //         atoms: [...after.atoms.values()],
    //     };
    //     sendToDevices(devices, RESET, ret);
    // }

    // private async _commitToRepo(event: CommitEvent, repo: CausalRepo) {
    //     try {
    //         console.log(
    //             `[CausalRepoServer] [${
    //                 event.branch
    //             }] Committing with message '${event.message}'...`
    //         );
    //         const commit = await repo.commit(event.message);
    //         if (commit) {
    //             await this._stage.clearStage(event.branch);
    //             console.log(`[CausalRepoServer] [${event.branch}] Committed.`);
    //             this._sendCommits(event.branch, [commit]);
    //         } else {
    //             console.log(
    //                 `[CausalRepoServer] [${event.branch}] No Commit Created.`
    //             );
    //         }
    //     } catch (err) {
    //         console.error(
    //             `[CausalRepoServer] [${
    //                 event.branch
    //             }] Unable to commit to branch.`,
    //             err
    //         );
    //     }
    // }

    // private _sendCommits(branch: string, commits: CausalRepoCommit[]) {
    //     const info = infoForBranchCommits(branch);
    //     const devices = this._deviceManager.getConnectedDevices(info);
    //     let e: AddCommitsEvent = {
    //         branch: branch,
    //         commits: commits,
    //     };
    //     sendToDevices(devices, ADD_COMMITS, e);
    // }

    // private _sendConnectedToBranch(
    //     device: DeviceConnection<Connection>,
    //     branch: string
    // ) {
    //     console.log(`[CausalRepoServer] [${branch}] [${device.id}] Connected.`);
    //     const branchEvent = this._branches.get(branch);
    //     if (!branchEvent) {
    //         throw new Error(
    //             'Unable to send connected to branch event because the branch does not exist!'
    //         );
    //     }
    //     const event = {
    //         broadcast: false,
    //         branch: branchEvent,
    //         device: device.extra.device,
    //     };
    //     let info = devicesInfo();
    //     let devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, DEVICE_CONNECTED_TO_BRANCH, {
    //         ...event,
    //         broadcast: true,
    //     });

    //     info = devicesBranchInfo(branch);
    //     devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, DEVICE_CONNECTED_TO_BRANCH, event);
    // }

    // private _sendDisconnectedFromBranch(
    //     device: DeviceConnection<Connection>,
    //     branch: string,
    //     reason: DisconnectionReason | UnwatchReason
    // ) {
    //     console.log(
    //         `[CausalRepoServer] [${branch}] [${
    //             device.id
    //         }] [${reason}] Disconnected.`
    //     );
    //     const event = {
    //         broadcast: false,
    //         branch: branch,
    //         device: device.extra.device,
    //     };
    //     let info = devicesInfo();
    //     let devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, DEVICE_DISCONNECTED_FROM_BRANCH, {
    //         ...event,
    //         broadcast: true,
    //     });

    //     info = devicesBranchInfo(branch);
    //     devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, DEVICE_DISCONNECTED_FROM_BRANCH, event);
    // }

    // private async _logDisconnectedFromBranch(
    //     device: DeviceConnection<Connection>,
    //     branch: string,
    //     reason: DisconnectionReason | UnwatchReason
    // ) {
    //     const siteId = this._branchSiteIds.get(
    //         branchSiteIdKey(branch, device.id)
    //     );
    //     if (siteId) {
    //         this._store.logSite(branch, siteId, 'UNWATCH', reason);
    //     }
    //     this._branchSiteIds.delete(branchSiteIdKey(branch, device.id));
    // }

    // private async _tryUnloadBranch(info: RealtimeChannelInfo) {
    //     const devices = this._deviceManager.getConnectedDevices(info);
    //     if (devices.length <= 0) {
    //         await this._unloadBranch(info.id);
    //         this._branches.delete(info.id);
    //     }
    // }

    // private async _unloadBranch(branch: string) {
    //     console.log(`[CausalRepoServer] [${branch}] Unloading.`);
    //     const repo = await this._repoPromises.get(branch);
    //     this._repoPromises.delete(branch);
    //     if (repo && repo.repo.hasChanges()) {
    //         try {
    //             console.log(
    //                 `[CausalRepoServer] [${branch}] Committing before unloading...`
    //             );
    //             const c = await repo.repo.commit(
    //                 `Save ${branch} before unload`
    //             );

    //             if (c) {
    //                 console.log(
    //                     `[CausalRepoServer] [${branch}] [${c.hash}] Committed!`
    //                 );
    //                 await this._stage.clearStage(branch);
    //             } else {
    //                 console.log(
    //                     `[CausalRepoServer] [${branch}] No commit created due to no changes.`
    //                 );
    //             }
    //         } catch (err) {
    //             console.error(
    //                 `[CausalRepoServer] [${branch}] Unable to commit to branch during unload.`,
    //                 err
    //             );
    //         }
    //     }
    //     this._repos.delete(branch);
    //     this._branchUnloaded(branch);
    // }

    // private async _getOrLoadRepo(
    //     branch: string,
    //     createBranch: boolean,
    //     temporary: boolean
    // ) {
    //     let repo = this._repos.get(branch);

    //     if (!repo) {
    //         let finalPromise: Promise<RepoData>;
    //         let repoPromise = this._repoPromises.get(branch);
    //         if (repoPromise) {
    //             finalPromise = repoPromise;
    //         } else {
    //             if (!temporary) {
    //                 finalPromise = this._loadRepo(branch, createBranch);
    //             } else {
    //                 finalPromise = this._createEmptyRepo(branch);
    //             }
    //             this._repoPromises.set(branch, finalPromise);
    //         }

    //         repo = await finalPromise;

    //         this._repos.set(branch, repo);
    //         this._branchLoaded(branch);
    //     }

    //     return repo;
    // }

    // private async _createEmptyRepo(branch: string): Promise<RepoData> {
    //     console.log(`[CausalRepoServer] [${branch}] Creating temp`);
    //     const emptyStore = new MemoryCausalRepoStore();
    //     const repo = new CausalRepo(emptyStore);
    //     await repo.checkout(branch, {
    //         createIfDoesntExist: {
    //             hash: null,
    //         },
    //     });

    //     const weave = new Weave<any>();
    //     const authenticatedDevices = new Set<string>();
    //     const settings = branchSettings(branch);

    //     return {
    //         repo,
    //         weave,
    //         settings,
    //     };
    // }

    // private async _loadRepo(
    //     branch: string,
    //     createBranch: boolean
    // ): Promise<RepoData> {
    //     const startTime = process.hrtime();
    //     try {
    //         console.log(`[CausalRepoServer] [${branch}] Loading`);
    //         const repo = new CausalRepo(this._store);
    //         await repo.checkout(branch, {
    //             createIfDoesntExist: createBranch
    //                 ? {
    //                       hash: null,
    //                   }
    //                 : null,
    //         });
    //         const stage = await this._stage.getStage(branch);
    //         repo.addMany(stage.additions);
    //         const hashes = Object.keys(stage.deletions);
    //         repo.removeMany(hashes);
    //         const weave = new Weave<any>();

    //         for (let atom of repo.getAtoms()) {
    //             weave.insert(atom);
    //         }

    //         const settings =
    //             (await this._store.getBranchSettings(branch)) ||
    //             branchSettings(branch);

    //         return {
    //             repo,
    //             weave,
    //             settings,
    //         };
    //     } finally {
    //         const [seconds, nanoseconds] = process.hrtime(startTime);
    //         console.log(
    //             `[CausalRepoServer] [${branch}] Loading took %d seconds and %d nanoseconds`,
    //             seconds,
    //             nanoseconds
    //         );
    //     }
    // }

    // private _branchLoaded(branch: string) {
    //     const info = branchesInfo();
    //     const devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, LOAD_BRANCH, loadBranchEvent(branch));
    // }

    // private _branchUnloaded(branch: string) {
    //     const info = branchesInfo();
    //     const devices = this._deviceManager.getConnectedDevices(info);
    //     sendToDevices(devices, UNLOAD_BRANCH, unloadBranchEvent(branch));
    // }
}

// function loadBranchEvent(branch: string) {
//     return {
//         branch: branch,
//     };
// }

// function unloadBranchEvent(branch: string) {
//     return {
//         branch,
//     };
// }

// function sendToDevices(
//     devices: DeviceConnection<any>[],
//     eventName: string,
//     data: any,
//     excludeDevice?: DeviceConnection<any>
// ) {
//     for (let device of devices) {
//         if (excludeDevice && excludeDevice.id === device.id) {
//             continue;
//         }
//         device.extra.send(eventName, data);
//     }
// }

// function infoForBranch(branch: any): RealtimeChannelInfo {
//     return {
//         id: branch,
//         type: 'aux-branch',
//     };
// }

// function infoForBranchCommits(branch: any): RealtimeChannelInfo {
//     return {
//         id: `${branch}-commits`,
//         type: 'aux-branch-commits',
//     };
// }

// function branchesInfo(): RealtimeChannelInfo {
//     return {
//         id: 'branches',
//         type: 'aux-branches',
//     };
// }

// function devicesInfo(): RealtimeChannelInfo {
//     return {
//         id: 'devices',
//         type: 'aux-devices',
//     };
// }

// function devicesBranchInfo(branch: string): RealtimeChannelInfo {
//     return {
//         id: `${branch}-devices`,
//         type: 'aux-devices',
//     };
// }

// function handleEvents(
//     conn: GenericSession,
//     handlers: CausalRepoMessageHandlerMethods
// ): Observable<any> {
//     let observables = [] as Observable<readonly [string, any]>[];
//     for (let key of Object.keys(handlers)) {
//         const obs = conn
//             .event<any>(key)
//             .pipe(map(value => [key, value] as const));
//         observables.push(obs);
//     }

//     return merge(...observables).pipe(
//         concatMap(([event, value]) => {
//             const callback = (<any>handlers)[event];
//             return callback(value);
//         })
//     );
// }

// function branchSiteIdKey(branch: string, deviceId: string): string {
//     return `${branch}-${deviceId}`;
// }

// interface RepoData {
//     repo: CausalRepo;
//     weave: Weave<any>;
//     settings: CausalRepoBranchSettings;
// }

// function setForKey<TKey, TVal>(
//     map: Map<TKey, Set<TVal>>,
//     key: TKey
// ): Set<TVal> {
//     let set = map.get(key);
//     if (!set) {
//         set = new Set();
//         map.set(key, set);
//     }
//     return set;
// }

export function deviceInfo(device: DeviceConnection): DeviceInfo {
    return {
        claims: {
            [SESSION_ID_CLAIM]: device.sessionId,
            [USERNAME_CLAIM]: device.username,
            [DEVICE_ID_CLAIM]: device.username,
        },
        roles: [],
    };
}

/**
 * Determines if the given event targets the given device connection.
 * @param event The event to check.
 * @param device The device to check.
 */
export function isEventForDevice(
    event: DeviceSelector,
    device: DeviceConnection
): boolean {
    if (event.broadcast === true) {
        return true;
    }
    if (event.username === device.username) {
        return true;
    } else if (event.sessionId === device.sessionId) {
        return true;
    } else if (event.deviceId === device.username) {
        return true;
    }
    return false;
}

/**
 * Gets the namespace that the given branch should use.
 * @param branch The branch.
 */
export function branchNamespace(branch: string) {
    return `/branch/${branch}`;
}

/**
 * Gets the namespace that should be used for watching devices connected to branches.
 * @param branch The branch to watch.
 */
export function watchBranchNamespace(branch: string) {
    return `/watched_branch/${branch}`;
}

export function branchFromNamespace(namespace: string) {
    return namespace.slice('/branch/'.length);
}

export function isBranchConnection(namespace: string) {
    return namespace.startsWith('/branch/');
}
