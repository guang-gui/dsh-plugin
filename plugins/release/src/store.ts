/**
 * 轻量持久化：项目清单与预检计划各存一个 JSON 文件。
 *
 * 刻意不用 SQLite —— 插件要能在任何 dsh 安装里跑起来，
 * 不引入需要编译的原生模块，安装时不会卡在构建脚本授权上。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MergePlan, Project, TaskRecord } from './types.js';

const MAX_PLANS = 30;
const MAX_TASKS = 50;

interface ProjectsFile {
  savedAt: string;
  projects: Project[];
}

interface PlansFile {
  plans: MergePlan[];
}

interface TasksFile {
  tasks: TaskRecord[];
}

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, file);
}

export class JsonStore {
  private projects: Project[] = [];
  private savedAt = '';
  private plans = new Map<string, MergePlan>();
  private tasks: TaskRecord[] = [];

  constructor(private readonly dir: string) {}

  get projectsFile(): string {
    return join(this.dir, 'projects.json');
  }

  get plansFile(): string {
    return join(this.dir, 'plans.json');
  }

  get tasksFile(): string {
    return join(this.dir, 'tasks.json');
  }

  load(): void {
    const p = readJson<ProjectsFile>(this.projectsFile);
    if (p?.projects?.length) {
      this.projects = p.projects;
      this.savedAt = p.savedAt ?? '';
    }
    const plans = readJson<PlansFile>(this.plansFile);
    for (const plan of plans?.plans ?? []) {
      if (plan?.id) this.plans.set(plan.id, plan);
    }
    this.prunePlans();
    const tasks = readJson<TasksFile>(this.tasksFile);
    if (Array.isArray(tasks?.tasks)) {
      this.tasks = tasks.tasks.filter((t) => t?.id).slice(0, MAX_TASKS);
    }
  }

  get list(): Project[] {
    return this.projects;
  }

  get lastSavedAt(): string {
    return this.savedAt;
  }

  replaceProjects(projects: Project[]): void {
    this.projects = projects;
    this.savedAt = new Date().toISOString();
    writeJson(this.projectsFile, { savedAt: this.savedAt, projects });
  }

  savePlan(plan: MergePlan): void {
    this.plans.set(plan.id, plan);
    this.prunePlans();
    writeJson(this.plansFile, { plans: [...this.plans.values()] });
  }

  getPlan(id: string): MergePlan | undefined {
    return this.plans.get(id);
  }

  latestPlan(): MergePlan | undefined {
    const all = [...this.plans.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all[0];
  }

  /** 只保留未过期、且总量受限的计划 */
  prunePlans(): void {
    const now = Date.now();
    const alive = [...this.plans.values()]
      .filter((p) => Date.parse(p.expiresAt) > now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_PLANS);
    this.plans = new Map(alive.map((p) => [p.id, p]));
  }

  /* ------------------------------------------------------------------ */
  /* 任务中心                                                            */
  /* ------------------------------------------------------------------ */

  /** 最近的执行记录，新的在前 */
  get taskList(): TaskRecord[] {
    return this.tasks;
  }

  addTask(task: TaskRecord): void {
    this.tasks = [task, ...this.tasks.filter((t) => t.id !== task.id)].slice(0, MAX_TASKS);
    writeJson(this.tasksFile, { tasks: this.tasks });
  }
}
