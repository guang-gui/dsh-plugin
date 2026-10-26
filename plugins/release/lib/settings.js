/**
 * 插件运行时设置：把原本只能写 YAML 的参数（GitLab 地址、令牌、扫描目录……）
 * 搬到界面上配置。
 *
 * 优先级：`settings.json`（界面保存）> `cordis.patch.yml`（部署默认值）> 内置默认。
 * 界面保存过一次之后就以 `settings.json` 为准，YAML 只剩首次安装的引导作用。
 *
 * 令牌单独处理：只写不读——对外接口永远只回传「是否已设置」和末四位，
 * 文件权限设为 0600。这不是加密存储，只是把明文限制在只有当前用户可读的文件里；
 * 若要更严格，把令牌留在环境变量里、这里不填即可。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isValidBranchName } from './domain.js';
export const SETTINGS_FILE = 'settings.json';
const MERGE_STRATEGIES = ['merge', 'ff-only', 'no-ff'];
function clampInt(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}
function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** 目录去重：Windows 下大小写不敏感，统一用规范化后的绝对路径比较 */
function dedupePaths(paths) {
    const seen = new Set();
    const out = [];
    for (const raw of paths) {
        const abs = resolve(raw);
        const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(abs);
    }
    return out;
}
/**
 * 把补丁合并到基线配置上，并逐项校验。
 *
 * @param patch 界面提交的改动
 * @param base  当前生效设置（作为缺省值）
 * @returns 校验后的设置；`errors` 非空时调用方应拒绝保存
 */
export function normalizeSettings(patch, base) {
    const errors = [];
    const warnings = [];
    const next = {
        ...base,
        roots: [...base.roots],
    };
    if (patch.gitlabBaseUrl !== undefined) {
        const raw = asString(patch.gitlabBaseUrl).replace(/\/+$/, '');
        if (raw && !/^https?:\/\/[^\s]+$/i.test(raw)) {
            errors.push('GitLab 地址必须是以 http:// 或 https:// 开头的完整地址');
        }
        else {
            next.gitlabBaseUrl = raw;
        }
    }
    if (patch.gitlabToken !== undefined) {
        // 空字符串是有意义的：表示清空已保存的令牌，回落到环境变量
        next.gitlabToken = asString(patch.gitlabToken);
    }
    if (patch.tokenEnv !== undefined) {
        const raw = asString(patch.tokenEnv);
        if (raw && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
            errors.push('环境变量名只能包含字母、数字和下划线，且不能以数字开头');
        }
        else {
            next.tokenEnv = raw || 'GITLAB_TOKEN';
        }
    }
    if (patch.roots !== undefined) {
        if (!Array.isArray(patch.roots)) {
            errors.push('扫描目录必须是字符串数组');
        }
        else {
            const cleaned = [];
            for (const item of patch.roots) {
                const raw = asString(item);
                if (!raw)
                    continue;
                const abs = resolve(raw);
                if (!existsSync(abs)) {
                    errors.push(`目录不存在：${abs}`);
                    continue;
                }
                if (!statSync(abs).isDirectory()) {
                    errors.push(`不是目录：${abs}`);
                    continue;
                }
                cleaned.push(abs);
            }
            if (!errors.length)
                next.roots = dedupePaths(cleaned);
        }
    }
    if (patch.scanDepth !== undefined) {
        const raw = Number(patch.scanDepth);
        if (!Number.isFinite(raw) || raw < 1 || raw > 8)
            errors.push('扫描深度必须在 1 到 8 之间');
        else
            next.scanDepth = Math.trunc(raw);
    }
    if (patch.defaultTarget !== undefined) {
        const raw = asString(patch.defaultTarget);
        if (!raw)
            errors.push('默认目标分支不能为空');
        else if (!isValidBranchName(raw))
            errors.push(`默认目标分支不合法：${raw}`);
        else
            next.defaultTarget = raw;
    }
    if (patch.concurrency !== undefined) {
        const raw = Number(patch.concurrency);
        if (!Number.isFinite(raw) || raw < 1 || raw > 16)
            errors.push('并发数必须在 1 到 16 之间');
        else
            next.concurrency = Math.trunc(raw);
    }
    if (patch.headCacheTtlSec !== undefined) {
        const raw = Number(patch.headCacheTtlSec);
        if (!Number.isFinite(raw) || raw < 0 || raw > 86_400)
            errors.push('缓存有效期必须在 0 到 86400 秒之间');
        else
            next.headCacheTtlSec = Math.trunc(raw);
    }
    if (patch.mergeStrategy !== undefined) {
        const raw = asString(patch.mergeStrategy);
        if (!MERGE_STRATEGIES.includes(raw))
            errors.push('合并策略只能是 merge、ff-only 或 no-ff');
        else
            next.mergeStrategy = raw;
    }
    if (patch.deleteSourceBranch !== undefined) {
        next.deleteSourceBranch = patch.deleteSourceBranch === true;
    }
    if (!next.gitlabBaseUrl)
        warnings.push('未配置 GitLab 地址：只能做 Git 直接合并，无法创建或合并 MR');
    if (!next.gitlabToken && !process.env[next.tokenEnv] && !process.env.GITLAB_TOKEN) {
        warnings.push(`未配置令牌：请在此填写，或设置环境变量 ${next.tokenEnv}`);
    }
    if (!next.roots.length)
        warnings.push('未配置扫描目录：仓库列表会是空的');
    return { settings: next, errors, warnings };
}
/** 把任意来源的原始对象收敛成完整设置（缺字段用基线补齐，不做报错） */
export function coerceSettings(raw, base) {
    if (!raw || typeof raw !== 'object')
        return { ...base, roots: [...base.roots] };
    const input = raw;
    const merged = {};
    if (typeof input.gitlabBaseUrl === 'string')
        merged.gitlabBaseUrl = input.gitlabBaseUrl;
    if (typeof input.gitlabToken === 'string')
        merged.gitlabToken = input.gitlabToken;
    if (typeof input.tokenEnv === 'string')
        merged.tokenEnv = input.tokenEnv;
    if (Array.isArray(input.roots))
        merged.roots = input.roots.filter((r) => typeof r === 'string');
    if (input.scanDepth !== undefined)
        merged.scanDepth = clampInt(input.scanDepth, 1, 8, base.scanDepth);
    if (typeof input.defaultTarget === 'string')
        merged.defaultTarget = input.defaultTarget;
    if (input.concurrency !== undefined)
        merged.concurrency = clampInt(input.concurrency, 1, 16, base.concurrency);
    if (input.headCacheTtlSec !== undefined) {
        merged.headCacheTtlSec = clampInt(input.headCacheTtlSec, 0, 86_400, base.headCacheTtlSec);
    }
    if (typeof input.mergeStrategy === 'string' && MERGE_STRATEGIES.includes(input.mergeStrategy)) {
        merged.mergeStrategy = input.mergeStrategy;
    }
    if (typeof input.deleteSourceBranch === 'boolean')
        merged.deleteSourceBranch = input.deleteSourceBranch;
    // 读盘时不做存在性校验：目录暂时不在（例如移动硬盘没插）不应该让整份设置作废
    const next = { ...base, roots: [...base.roots] };
    for (const [key, value] of Object.entries(merged)) {
        if (key === 'roots') {
            const list = value.map((r) => asString(r)).filter(Boolean);
            next.roots = list.length ? dedupePaths(list) : [];
            continue;
        }
        if (key === 'gitlabBaseUrl') {
            const url = asString(value).replace(/\/+$/, '');
            if (!url || /^https?:\/\/[^\s]+$/i.test(url))
                next.gitlabBaseUrl = url;
            continue;
        }
        if (key === 'gitlabToken') {
            next.gitlabToken = asString(value);
            continue;
        }
        if (key === 'tokenEnv') {
            const env = asString(value);
            if (!env || /^[A-Za-z_][A-Za-z0-9_]*$/.test(env))
                next.tokenEnv = env || 'GITLAB_TOKEN';
            continue;
        }
        if (key === 'defaultTarget') {
            const branch = asString(value);
            if (branch && isValidBranchName(branch))
                next.defaultTarget = branch;
            continue;
        }
        if (key === 'scanDepth')
            next.scanDepth = clampInt(value, 1, 8, base.scanDepth);
        else if (key === 'concurrency')
            next.concurrency = clampInt(value, 1, 16, base.concurrency);
        else if (key === 'headCacheTtlSec')
            next.headCacheTtlSec = clampInt(value, 0, 86_400, base.headCacheTtlSec);
        else if (key === 'mergeStrategy') {
            if (MERGE_STRATEGIES.includes(value))
                next.mergeStrategy = value;
        }
        else if (key === 'deleteSourceBranch')
            next.deleteSourceBranch = value === true;
    }
    return next;
}
/** 令牌脱敏：只暴露末四位，用来确认「填的是不是那一把」 */
export function maskToken(token) {
    if (!token)
        return '';
    if (token.length <= 4)
        return '••••';
    return `••••${token.slice(-4)}`;
}
/* ------------------------------------------------------------------ */
/* 持久化                                                              */
/* ------------------------------------------------------------------ */
export class SettingsStore {
    dir;
    constructor(dir) {
        this.dir = dir;
    }
    get file() {
        return join(this.dir, SETTINGS_FILE);
    }
    /** 读不到或格式坏了都当成「没有保存过」，不让坏文件阻塞插件启动 */
    load() {
        try {
            if (!existsSync(this.file))
                return null;
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            return parsed && typeof parsed === 'object' ? parsed : null;
        }
        catch {
            return null;
        }
    }
    save(settings) {
        mkdirSync(this.dir, { recursive: true });
        const tmp = `${this.file}.tmp`;
        // 0600：只有当前用户可读写（Windows 上由 ACL 继承，chmod 仅对 POSIX 生效）
        writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        renameSync(tmp, this.file);
    }
}
const MAX_ENTRIES = 500;
/** 列出某个目录下的子目录；只读，不跟随符号链接到目录外。 */
export function listDirectories(rawPath, selectedRoots) {
    const target = resolve(rawPath || process.cwd());
    const selectedKeys = new Set(selectedRoots.map((r) => (process.platform === 'win32' ? resolve(r).toLowerCase() : resolve(r))));
    const keyOf = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
    if (!existsSync(target)) {
        return { path: target, parent: null, isRepo: false, selected: false, entries: [], error: `目录不存在：${target}` };
    }
    if (!statSync(target).isDirectory()) {
        return { path: target, parent: null, isRepo: false, selected: false, entries: [], error: `不是目录：${target}` };
    }
    const entries = [];
    try {
        for (const dirent of readdirSync(target, { withFileTypes: true })) {
            if (entries.length >= MAX_ENTRIES)
                break;
            if (!dirent.isDirectory())
                continue;
            // 跳过 .git 等隐藏目录，避免噪声
            if (dirent.name.startsWith('.'))
                continue;
            const child = join(target, dirent.name);
            entries.push({
                name: dirent.name,
                path: child,
                isRepo: existsSync(join(child, '.git')),
                selected: selectedKeys.has(keyOf(child)),
            });
        }
    }
    catch (e) {
        return {
            path: target,
            parent: parentOf(target),
            isRepo: existsSync(join(target, '.git')),
            selected: selectedKeys.has(keyOf(target)),
            entries: [],
            error: e instanceof Error ? e.message : String(e),
        };
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return {
        path: target,
        parent: parentOf(target),
        isRepo: existsSync(join(target, '.git')),
        selected: selectedKeys.has(keyOf(target)),
        entries,
    };
}
function parentOf(path) {
    const parent = resolve(path, '..');
    return parent === resolve(path) ? null : parent;
}
//# sourceMappingURL=settings.js.map