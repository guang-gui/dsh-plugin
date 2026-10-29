/**
 * 设置桥：把「界面提交的设置」翻译成「服务实际生效的配置」。
 *
 * 单独成文件是为了可测——这里不依赖 cordis，只依赖服务与设置模块，
 * 因此可以用一个桩服务在测试里跑完整的保存/重扫流程。
 */
import { homedir } from 'node:os';
import { coerceSettings, listDirectories, maskToken, normalizeSettings, } from './settings.js';
/** ResolvedConfig → 可持久化设置（不含 dataDir/gitPath 这类部署参数） */
export function toPluginSettings(r, tokenEnv = 'GITLAB_TOKEN') {
    return {
        gitlabBaseUrl: r.gitlabBaseUrl,
        gitlabAccount: r.gitlabAccount ?? '',
        gitlabToken: r.gitlabToken,
        tokenEnv,
        roots: r.roots,
        scanDepth: r.scanDepth,
        defaultTarget: r.defaultTarget,
        concurrency: r.concurrency,
        headCacheTtlSec: r.headCacheTtlSec,
        mergeStrategy: r.mergeStrategy,
        deleteSourceBranch: r.deleteSourceBranch,
    };
}
/**
 * 设置 → 生效配置。
 * 令牌回落顺序：界面保存的 > YAML/环境变量（已由 resolveConfig 合并）。
 */
export function buildResolved(base, s) {
    return {
        ...base,
        roots: s.roots,
        scanDepth: s.scanDepth,
        gitlabBaseUrl: s.gitlabBaseUrl,
        gitlabToken: s.gitlabToken || process.env[s.tokenEnv]?.trim() || base.gitlabToken,
        gitlabAccount: s.gitlabAccount ?? '',
        defaultTarget: s.defaultTarget,
        concurrency: s.concurrency,
        headCacheTtlSec: s.headCacheTtlSec,
        mergeStrategy: s.mergeStrategy,
        deleteSourceBranch: s.deleteSourceBranch,
    };
}
/** 对外的设置视图：令牌只给「是否已设置 + 末四位」 */
export function settingsView(base, s) {
    const fallback = process.env[s.tokenEnv]?.trim() || base.gitlabToken;
    const token = s.gitlabToken || fallback;
    return {
        gitlabBaseUrl: s.gitlabBaseUrl,
        gitlabAccount: s.gitlabAccount ?? '',
        tokenSet: Boolean(token),
        tokenHint: maskToken(token),
        tokenSource: s.gitlabToken ? 'saved' : fallback ? 'env' : 'none',
        tokenEnv: s.tokenEnv,
        roots: s.roots,
        scanDepth: s.scanDepth,
        defaultTarget: s.defaultTarget,
        concurrency: s.concurrency,
        headCacheTtlSec: s.headCacheTtlSec,
        mergeStrategy: s.mergeStrategy,
        deleteSourceBranch: s.deleteSourceBranch,
        dataDir: base.dataDir,
        gitlabReady: Boolean(s.gitlabBaseUrl && token),
    };
}
/** 启动时算出初始设置：settings.json 优先，缺字段用 YAML 结果补齐 */
export function initialSettings(base, stored) {
    // 令牌只认 settings.json 里的值：绝不把环境变量/YAML 里的令牌反向落盘。
    return coerceSettings(stored, { ...toPluginSettings(base), gitlabToken: '' });
}
export function createSettingsBridge(opts) {
    const { service, store, base } = opts;
    let current = opts.initial;
    const save = async (patch) => {
        const result = normalizeSettings(patch, current);
        if (result.errors.length) {
            return { ok: false, errors: result.errors, warnings: result.warnings, settings: settingsView(base, current) };
        }
        const before = { roots: current.roots.join('\u0000'), depth: current.scanDepth };
        store.save(result.settings);
        current = result.settings;
        service.reconfigure(buildResolved(base, current));
        const needsRescan = before.roots !== current.roots.join('\u0000') || before.depth !== current.scanDepth;
        if (!needsRescan) {
            return { ok: true, errors: [], warnings: result.warnings, settings: settingsView(base, current) };
        }
        try {
            const list = await service.refreshProjects(true);
            return {
                ok: true,
                errors: [],
                warnings: result.warnings,
                settings: settingsView(base, current),
                rescan: { total: list.length },
            };
        }
        catch (e) {
            // 扫描失败不回滚设置：目录是用户刚填的，保留下来让他修
            return {
                ok: true,
                errors: [],
                warnings: [...result.warnings, `设置已保存，但重新扫描失败：${e instanceof Error ? e.message : String(e)}`],
                settings: settingsView(base, current),
            };
        }
    };
    return {
        current: () => current,
        bridge: {
            view: () => settingsView(base, current),
            save,
            test: (override) => service.testGitLab(override),
            browse: (path) => listDirectories(path || current.roots[0] || homedir(), current.roots),
        },
    };
}
//# sourceMappingURL=settings-bridge.js.map