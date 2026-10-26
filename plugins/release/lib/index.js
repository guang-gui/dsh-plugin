/**
 * DeepSeek Harness 插件入口：把「跨仓库批量发版」注册成模型可调用的工具。
 *
 * 这是一个组合包（bundle）：package.json 里的 `dsh.bundle.patch` 指向
 * cordis.patch.yml，安装到 profile 后由 Loader 插入本插件行。
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { GitExecutor } from './git.js';
import { ReleaseService } from './service.js';
import { buildResolved, createSettingsBridge, initialSettings } from './settings-bridge.js';
import { SettingsStore } from './settings.js';
import { registerTools } from './tools.js';
import { registerWebUi } from './web.js';
export const name = 'release';
// webServer 不放进 inject：headless 环境没有它，放进来会让整个插件不激活。
// 发版控制台的挂载在 registerWebUi 里用 ctx.inject 延迟完成。
export const inject = ['tools'];
export const Config = Schema.object({
    roots: Schema.array(Schema.string()).default([]),
    scanDepth: Schema.number().default(3),
    defaultTarget: Schema.string().default('master'),
    gitlab: Schema.object({
        baseUrl: Schema.string().default(''),
        token: Schema.string().default(''),
        tokenEnv: Schema.string().default('GITLAB_TOKEN'),
    }).default({ baseUrl: '', token: '', tokenEnv: 'GITLAB_TOKEN' }),
    projects: Schema.array(Schema.object({
        path: Schema.string(),
        remoteUrl: Schema.string(),
        name: Schema.string(),
        localPath: Schema.string(),
        defaultTarget: Schema.string(),
        enabled: Schema.boolean(),
    })).default([]),
    concurrency: Schema.number().min(1).max(16).default(8),
    headCacheTtlSec: Schema.number().min(0).default(300),
    mergeStrategy: Schema.union(['merge', 'ff-only', 'no-ff']).default('merge'),
    deleteSourceBranch: Schema.boolean().default(false),
    dataDir: Schema.string().default(''),
    gitPath: Schema.string().default('git'),
});
function dshHome() {
    return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
}
function createLogger() {
    const debug = process.env.DSH_RELEASE_DEBUG === '1';
    const emit = (level, message, detail) => {
        if (level === 'debug' && !debug)
            return;
        const line = `[release] ${message}`;
        const payload = detail && Object.keys(detail).length ? detail : undefined;
        if (level === 'warn')
            console.warn(line, payload ?? '');
        else if (level === 'debug')
            console.debug(line, payload ?? '');
        else
            console.info(line, payload ?? '');
    };
    return {
        info: (m, d) => emit('info', m, d),
        warn: (m, d) => emit('warn', m, d),
        debug: (m, d) => emit('debug', m, d),
    };
}
export function apply(ctx, config) {
    const base = resolveConfig(config);
    const store = new SettingsStore(base.dataDir);
    const initial = initialSettings(base, store.load());
    const effective = buildResolved(base, initial);
    const service = new ReleaseService(effective, new GitExecutor(effective.gitPath), createLogger());
    const { bridge } = createSettingsBridge({ service, store, base, initial });
    // 注册是 effect 语义：插件卸载时工具自动撤销，不需要手工反注册
    registerTools(ctx, service);
    // 同一套服务再挂一个浏览器页面，日常操作不必经过模型
    registerWebUi(ctx, { service, settings: bridge });
    ctx.effect(() => () => service.dispose());
}
function resolveConfig(config) {
    const tokenEnv = config.gitlab?.tokenEnv?.trim() || 'GITLAB_TOKEN';
    const token = config.gitlab?.token?.trim() || process.env[tokenEnv]?.trim() || process.env.GITLAB_TOKEN?.trim() || '';
    const baseUrl = (config.gitlab?.baseUrl ?? '').trim().replace(/\/+$/, '');
    const dataDir = config.dataDir?.trim() || join(dshHome(), 'release-plugin');
    return {
        roots: (config.roots ?? []).map((r) => r.trim()).filter(Boolean),
        scanDepth: clamp(config.scanDepth ?? 3, 1, 8),
        gitlabBaseUrl: baseUrl,
        gitlabToken: token,
        projects: config.projects ?? [],
        defaultTarget: config.defaultTarget?.trim() || 'master',
        concurrency: clamp(config.concurrency ?? 8, 1, 16),
        headCacheTtlSec: Math.max(0, config.headCacheTtlSec ?? 300),
        mergeStrategy: config.mergeStrategy ?? 'merge',
        deleteSourceBranch: config.deleteSourceBranch ?? false,
        dataDir,
        gitPath: config.gitPath?.trim() || 'git',
    };
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
//# sourceMappingURL=index.js.map