import type { MergeStrategy } from './types.js';
export declare const SETTINGS_FILE = "settings.json";
export interface PluginSettings {
    /** GitLab 实例地址，例如 https://git.example.com；空表示未配置 */
    gitlabBaseUrl: string;
    /** Account label; authentication always uses the personal access token. */
    gitlabAccount?: string;
    /** 个人访问令牌（scope: api）；空表示改用环境变量 */
    gitlabToken: string;
    /** 令牌所在环境变量名 */
    tokenEnv: string;
    /** 本地仓库根目录，插件递归扫描并识别 Git 仓库 */
    roots: string[];
    /** 扫描深度 */
    scanDepth: number;
    /** 默认目标分支 */
    defaultTarget: string;
    /** 预检并发数 */
    concurrency: number;
    /** 分支 SHA 缓存有效期（秒） */
    headCacheTtlSec: number;
    /** Git 直接合并策略 */
    mergeStrategy: MergeStrategy;
    /** 合并后是否删除源分支 */
    deleteSourceBranch: boolean;
}
/** 界面提交的补丁：字段缺省表示「不改」，空字符串表示「清空」。 */
export type SettingsPatch = Partial<PluginSettings>;
export interface NormalizeResult {
    settings: PluginSettings;
    errors: string[];
    warnings: string[];
}
/**
 * 把补丁合并到基线配置上，并逐项校验。
 *
 * @param patch 界面提交的改动
 * @param base  当前生效设置（作为缺省值）
 * @returns 校验后的设置；`errors` 非空时调用方应拒绝保存
 */
export declare function normalizeSettings(patch: SettingsPatch, base: PluginSettings): NormalizeResult;
/** 把任意来源的原始对象收敛成完整设置（缺字段用基线补齐，不做报错） */
export declare function coerceSettings(raw: unknown, base: PluginSettings): PluginSettings;
/** 令牌脱敏：只暴露末四位，用来确认「填的是不是那一把」 */
export declare function maskToken(token: string): string;
export declare class SettingsStore {
    private readonly dir;
    constructor(dir: string);
    get file(): string;
    /** 读不到或格式坏了都当成「没有保存过」，不让坏文件阻塞插件启动 */
    load(): Record<string, unknown> | null;
    save(settings: PluginSettings): void;
}
export interface DirEntry {
    name: string;
    path: string;
    /** 该目录本身是一个 Git 仓库（含 .git） */
    isRepo: boolean;
    /** 已经是配置里的扫描根目录 */
    selected: boolean;
}
export interface DirListing {
    path: string;
    parent: string | null;
    /** 当前目录自身是否为 Git 仓库 */
    isRepo: boolean;
    selected: boolean;
    entries: DirEntry[];
    error?: string;
}
/** 列出某个目录下的子目录；只读，不跟随符号链接到目录外。 */
export declare function listDirectories(rawPath: string, selectedRoots: string[]): DirListing;
