import { WEB_PAGE } from './web-page.js';
/** 页面与 API 共用的路径前缀。 */
export const WEB_UI_PATH = '/release-ui';
/** 请求体上限，预检参数远小于此值。 */
const MAX_BODY_BYTES = 256 * 1024;
/**
 * 把发版控制台挂到当前 profile 的 web 服务上。
 * @param ctx 插件上下文
 * @param service 与工具共用的发版服务
 */
export function registerWebUi(ctx, service) {
    ctx.inject(['webServer'], (webCtx) => {
        const server = webCtx.get('webServer');
        if (!server)
            return;
        // register 返回 disposer，交给 effect 在插件卸载时自动撤销
        webCtx.effect(() => server.register({
            kind: 'prefix',
            path: WEB_UI_PATH,
            handler: (req, res) => handle(req, res, service),
        }));
        console.info(`[release] 发版控制台已挂载：${WEB_UI_PATH}`);
    });
}
/* ------------------------------------------------------------------ */
/* 路由分发                                                            */
/* ------------------------------------------------------------------ */
async function handle(req, res, service) {
    try {
        if (!isLoopbackHost(req.headers.host)) {
            json(res, 403, { error: '发版控制台只允许从本机访问' });
            return;
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const path = url.pathname.replace(/\/+$/, '') || WEB_UI_PATH;
        const method = req.method ?? 'GET';
        if ((method === 'GET' || method === 'HEAD') && (path === WEB_UI_PATH || path === `${WEB_UI_PATH}/index.html`)) {
            sendHtml(res, WEB_PAGE);
            return;
        }
        if (method === 'GET' && path === `${WEB_UI_PATH}/api/projects`) {
            await listProjects(res, service, url.searchParams.get('refresh') === '1');
            return;
        }
        if (method === 'GET' && path === `${WEB_UI_PATH}/api/branches`) {
            await searchBranches(res, service, url.searchParams.get('keyword') ?? '');
            return;
        }
        if (method === 'GET' && path === `${WEB_UI_PATH}/api/mrs`) {
            const planId = url.searchParams.get('planId') ?? undefined;
            json(res, 200, await service.refreshMrs(planId));
            return;
        }
        if (method === 'POST' && path === `${WEB_UI_PATH}/api/check`) {
            await runCheck(req, res, service);
            return;
        }
        if (method === 'POST' && path === `${WEB_UI_PATH}/api/apply`) {
            await runApply(req, res, service);
            return;
        }
        json(res, 404, { error: `未知接口：${method} ${path}` });
    }
    catch (error) {
        json(res, 500, { error: errorMessage(error) });
    }
}
async function listProjects(res, service, refresh) {
    await service.ready();
    const projects = refresh ? await service.refreshProjects(true) : service.projects;
    json(res, 200, {
        total: projects.length,
        enabled: projects.filter((p) => p.enabled).length,
        roots: service.roots,
        projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            namespace: p.namespace,
            gitlabPath: p.gitlabPath,
            localPath: p.localPath,
            defaultTarget: p.defaultTarget,
            enabled: p.enabled,
        })),
    });
}
async function searchBranches(res, service, keyword) {
    const matches = await service.findBranches(keyword.trim());
    json(res, 200, {
        total: matches.length,
        matches: matches.map((m) => ({
            projectId: m.projectId,
            project: m.project,
            branch: m.branch,
            sha: m.sha ?? null,
        })),
    });
}
async function runCheck(req, res, service) {
    const body = await readJson(req);
    const mode = body.mode;
    if (mode !== 'create-mr' && mode !== 'merge-mr' && mode !== 'merge-git') {
        throw new Error('mode 必须是 create-mr、merge-mr 或 merge-git');
    }
    const sourceBranch = text(body.sourceBranch);
    if (!sourceBranch)
        throw new Error('sourceBranch 必填');
    const plan = await service.planMerge({
        mode,
        sourceBranch,
        targetBranch: text(body.targetBranch) || undefined,
        projectIds: stringArray(body.projects),
        title: text(body.title) || undefined,
        description: text(body.description) || undefined,
        refresh: body.refresh === true,
    });
    json(res, 200, plan);
}
async function runApply(req, res, service) {
    const body = await readJson(req);
    const planId = text(body.planId);
    const planHash = text(body.planHash);
    if (!planId || !planHash)
        throw new Error('planId 与 planHash 必填（先预检）');
    const result = await service.applyPlan({
        planId,
        planHash,
        title: text(body.title) || undefined,
        description: text(body.description) || undefined,
    });
    json(res, 200, result);
}
/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */
/** Host 头只允许回环地址，防止 DNS rebinding 把本地接口暴露给外部页面。 */
function isLoopbackHost(host) {
    if (!host)
        return false;
    const name = host.replace(/:\d+$/, '').trim().toLowerCase();
    return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1';
}
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function stringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = value.filter((item) => typeof item === 'string' && item.length > 0);
    return items.length ? items : undefined;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_BODY_BYTES)
            throw new Error('请求体过大');
        chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw)
        return {};
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error('请求体不是合法 JSON');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('请求体必须是 JSON 对象');
    }
    return value;
}
function sendHtml(res, html) {
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(body.length),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
    });
    res.end(body);
}
function json(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(body.length),
        'cache-control': 'no-store',
    });
    res.end(body);
}
//# sourceMappingURL=web.js.map