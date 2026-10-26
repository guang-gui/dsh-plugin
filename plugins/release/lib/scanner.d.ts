import type { GitExecutor } from './git.js';
import type { Project } from './types.js';
export interface ScannedProject extends Project {
    /** 同一项目的全部本地副本 */
    paths: string[];
    worktreeCount: number;
}
export interface ScanResult {
    projects: ScannedProject[];
    roots: string[];
    scannedDirs: number;
    errors: Array<{
        path: string;
        message: string;
    }>;
    scannedAt: string;
    durationMs: number;
}
export declare function projectId(remoteKey: string): string;
export declare function scanRoots(roots: string[], depth: number, git: GitExecutor): Promise<ScanResult>;
