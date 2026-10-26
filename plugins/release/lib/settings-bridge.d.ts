import type { ReleaseService, ResolvedConfig } from './service.js';
import { SettingsStore, type PluginSettings } from './settings.js';
import type { SettingsBridge, SettingsView } from './web.js';
export interface BridgeOptions {
    service: ReleaseService;
    store: SettingsStore;
    /** 来自 cordis.patch.yml 的解析结果，作为设置的缺省值 */
    base: ResolvedConfig;
    /** 启动时从 settings.json 读到的设置 */
    initial: PluginSettings;
}
export interface Bridge {
    bridge: SettingsBridge;
    /** 当前生效的设置（保存后会变） */
    current(): PluginSettings;
}
/** ResolvedConfig → 可持久化设置（不含 dataDir/gitPath 这类部署参数） */
export declare function toPluginSettings(r: ResolvedConfig, tokenEnv?: string): PluginSettings;
/**
 * 设置 → 生效配置。
 * 令牌回落顺序：界面保存的 > YAML/环境变量（已由 resolveConfig 合并）。
 */
export declare function buildResolved(base: ResolvedConfig, s: PluginSettings): ResolvedConfig;
/** 对外的设置视图：令牌只给「是否已设置 + 末四位」 */
export declare function settingsView(base: ResolvedConfig, s: PluginSettings): SettingsView;
/** 启动时算出初始设置：settings.json 优先，缺字段用 YAML 结果补齐 */
export declare function initialSettings(base: ResolvedConfig, stored: Record<string, unknown> | null): PluginSettings;
export declare function createSettingsBridge(opts: BridgeOptions): Bridge;
