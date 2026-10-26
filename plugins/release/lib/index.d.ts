import type { Context } from '@deepseek-ai/cordis';
import { type ConfigProject } from './service.js';
import type { MergeStrategy } from './types.js';
export declare const name = "release";
export declare const inject: string[];
export interface Config {
    /** 本地仓库根目录，插件会递归扫描并识别 Git 仓库 */
    roots: string[];
    /** 扫描深度，默认 3 */
    scanDepth: number;
    /** 默认目标分支，默认 master */
    defaultTarget: string;
    gitlab: {
        /** 实例地址，例如 https://git.example.com */
        baseUrl: string;
        /** 个人访问令牌（scope: api）。留空则读环境变量 */
        token: string;
        /** 令牌所在的环境变量名，默认 GITLAB_TOKEN */
        tokenEnv: string;
    };
    /** 显式声明的仓库：用于补充扫描不到的项目，或覆盖默认目标分支/启用状态 */
    projects: ConfigProject[];
    /** 预检并发数，默认 8（实测 8 是自建 GitLab 的拐点） */
    concurrency: number;
    /** 分支 SHA 缓存有效期（秒），0 表示关闭，默认 300 */
    headCacheTtlSec: number;
    /** Git 直接合并的策略，默认 merge */
    mergeStrategy: MergeStrategy;
    /** 合并后是否删除源分支，默认 false */
    deleteSourceBranch: boolean;
    /** 数据目录（缓存、计划、bare 仓库），默认 $DSH_HOME/release-plugin */
    dataDir: string;
    /** git 可执行文件，默认 git */
    gitPath: string;
}
export declare const Config: import("@deepseek-ai/schemastery").SchemaLike<{
    roots: string[];
    scanDepth: number;
    defaultTarget: string;
    gitlab: {
        baseUrl: /*elided*/ any;
        token: /*elided*/ any;
        tokenEnv: /*elided*/ any;
    };
    projects: {
        path: /*elided*/ any;
        remoteUrl: /*elided*/ any;
        name: /*elided*/ any;
        localPath: /*elided*/ any;
        defaultTarget: /*elided*/ any;
        enabled: /*elided*/ any;
    }[];
    concurrency: number;
    headCacheTtlSec: number;
    mergeStrategy: "merge" | "ff-only" | "no-ff";
    deleteSourceBranch: boolean;
    dataDir: string;
    gitPath: string;
}>;
export declare function apply(ctx: Context, config: Config): void;
