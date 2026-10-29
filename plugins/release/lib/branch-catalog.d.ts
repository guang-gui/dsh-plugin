import type { GitExecutor, RemoteRef } from './git.js';
import type { Project } from './types.js';
export interface BranchOption {
    name: string;
    projects: string[];
    projectIds: string[];
}
/** Local refs first; one remote read per repository, shared by both inputs and all searches. */
export declare class BranchCatalog {
    private readonly git;
    private readonly remoteReader?;
    private entries;
    private local;
    private remote;
    private running;
    constructor(git: GitExecutor, remoteReader?: ((p: Project) => Promise<RemoteRef[]>) | undefined);
    view(projects: Project[], concurrency: number, ttlSec: number, refresh?: boolean): Promise<{
        options: BranchOption[];
        totalProjects: number;
        remoteProjects: number;
        loading: boolean;
        errors: {
            project: string;
            message: string;
        }[];
    }>;
    wait(): Promise<void>;
    matches(projects: Project[], keyword: string, limit: number): {
        projectId: string;
        project: string;
        namespace: string;
        branch: string;
        sha: string;
        gitlabPath: string;
    }[];
    snapshot(projects: Project[], keyword?: string): {
        options: BranchOption[];
        totalProjects: number;
        remoteProjects: number;
        loading: boolean;
        errors: {
            project: string;
            message: string;
        }[];
    };
    private each;
    private readLocal;
    private readRemote;
}
