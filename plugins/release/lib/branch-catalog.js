import { fuzzyScore } from './search.js';
/** Local refs first; one remote read per repository, shared by both inputs and all searches. */
export class BranchCatalog {
    git;
    remoteReader;
    entries = new Map();
    local;
    remote;
    running = false;
    constructor(git, remoteReader) {
        this.git = git;
        this.remoteReader = remoteReader;
    }
    async view(projects, concurrency, ttlSec, refresh = false) {
        this.local ??= this.readLocal(projects, concurrency);
        await this.local;
        const stale = projects.filter((p) => {
            const entry = this.entries.get(p.id);
            return refresh || !entry?.remoteAt || Date.now() - entry.remoteAt >= Math.max(10, ttlSec) * 1000;
        });
        if (stale.length && !this.running) {
            this.running = true;
            this.remote = this.readRemote(stale, concurrency).finally(() => { this.running = false; });
        }
        return this.snapshot(projects);
    }
    async wait() { await this.remote; }
    matches(projects, keyword, limit) {
        return projects.flatMap((project) => (this.entries.get(project.id)?.refs ?? [])
            .filter((ref) => Number.isFinite(fuzzyScore(ref.name, keyword)))
            .map((ref) => ({ projectId: project.id, project: project.name, namespace: project.namespace,
            branch: ref.name, sha: ref.sha, gitlabPath: project.gitlabPath })))
            .sort((a, b) => fuzzyScore(a.branch, keyword) - fuzzyScore(b.branch, keyword) || a.branch.localeCompare(b.branch))
            .slice(0, limit);
    }
    snapshot(projects, keyword = '') {
        const groups = new Map();
        const errors = [];
        let remoteProjects = 0;
        for (const project of projects) {
            const entry = this.entries.get(project.id);
            if (entry?.error)
                errors.push({ project: project.name, message: entry.error });
            if (entry?.remoteAt && !entry.error)
                remoteProjects++;
            for (const ref of entry?.refs ?? []) {
                if (!Number.isFinite(fuzzyScore(ref.name, keyword)))
                    continue;
                let option = groups.get(ref.name);
                if (!option) {
                    option = { name: ref.name, projects: [], projectIds: [] };
                    groups.set(ref.name, option);
                }
                option.projects.push(project.name);
                option.projectIds.push(project.id);
            }
        }
        return {
            options: [...groups.values()].sort((a, b) => fuzzyScore(a.name, keyword) - fuzzyScore(b.name, keyword)
                || b.projectIds.length - a.projectIds.length || a.name.localeCompare(b.name)),
            totalProjects: projects.length,
            remoteProjects,
            loading: this.running,
            errors,
        };
    }
    async each(projects, concurrency, fn) {
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), projects.length) }, async () => {
            while (cursor < projects.length) {
                const project = projects[cursor++];
                if (project)
                    await fn(project);
            }
        }));
    }
    async readLocal(projects, concurrency) {
        await this.each(projects, concurrency, async (project) => {
            try {
                const refs = project.localPath ? await this.git.localRemoteHeads(project.localPath) : [];
                this.entries.set(project.id, { refs, remoteAt: 0 });
            }
            catch (e) {
                this.entries.set(project.id, { refs: [], remoteAt: 0, error: e instanceof Error ? e.message : String(e) });
            }
        });
    }
    async readRemote(projects, concurrency) {
        await this.each(projects, concurrency, async (project) => {
            try {
                const refs = this.remoteReader ? await this.remoteReader(project)
                    : await this.git.lsRemoteHeads(project.localPath ?? undefined, project.localPath ? 'origin' : project.remoteUrl);
                this.entries.set(project.id, { refs, remoteAt: Date.now() });
            }
            catch (e) {
                const old = this.entries.get(project.id);
                this.entries.set(project.id, { refs: old?.refs ?? [], remoteAt: Date.now(),
                    error: e instanceof Error ? e.message : String(e) });
            }
        });
    }
}
//# sourceMappingURL=branch-catalog.js.map