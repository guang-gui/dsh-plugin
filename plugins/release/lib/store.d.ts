import type { MergePlan, Project } from './types.js';
export declare class JsonStore {
    private readonly dir;
    private projects;
    private savedAt;
    private plans;
    constructor(dir: string);
    get projectsFile(): string;
    get plansFile(): string;
    load(): void;
    get list(): Project[];
    get lastSavedAt(): string;
    replaceProjects(projects: Project[]): void;
    savePlan(plan: MergePlan): void;
    getPlan(id: string): MergePlan | undefined;
    latestPlan(): MergePlan | undefined;
    /** 只保留未过期、且总量受限的计划 */
    prunePlans(): void;
}
