import type { Context } from '@deepseek-ai/cordis';
import type { ReleaseService } from './service.js';
import type { DirListing, SettingsPatch } from './settings.js';
import type { MergeStrategy } from './types.js';
/** 页面与 API 共用的路径前缀。 */
export declare const WEB_UI_PATH = "/release-ui";
/** 对外的设置视图：令牌只给「是否已设置 + 末四位」，永不回传明文。 */
export interface SettingsView {
    gitlabBaseUrl: string;
    gitlabAccount?: string;
    tokenSet: boolean;
    tokenHint: string;
    /** saved=界面保存的；env=来自 YAML 或环境变量；none=都没有 */
    tokenSource: 'saved' | 'env' | 'none';
    tokenEnv: string;
    roots: string[];
    scanDepth: number;
    defaultTarget: string;
    concurrency: number;
    headCacheTtlSec: number;
    mergeStrategy: MergeStrategy;
    deleteSourceBranch: boolean;
    dataDir: string;
    gitlabReady: boolean;
}
export interface SaveResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    settings: SettingsView;
    /** 扫描参数变化时触发的重扫结果 */
    rescan?: {
        total: number;
    };
}
export interface GitLabTestResult {
    ok: boolean;
    ms: number;
    account?: string;
    version?: string;
    error?: string;
    note?: string;
}
export interface SettingsBridge {
    view(): SettingsView;
    save(patch: SettingsPatch): Promise<SaveResult>;
    test(override?: {
        baseUrl?: string;
        token?: string;
    }): Promise<GitLabTestResult>;
    browse(path: string): DirListing;
}
export interface WebUiDeps {
    service: ReleaseService;
    settings: SettingsBridge;
}
/**
 * 把发版控制台挂到当前 profile 的 web 服务上。
 * @param ctx 插件上下文
 * @param deps 与工具共用的发版服务 + 设置桥
 */
export declare function registerWebUi(ctx: Context, deps: WebUiDeps): void;
