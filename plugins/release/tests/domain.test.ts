import { describe, expect, it } from 'vitest';
import {
  branchCategory,
  computePlanHash,
  isValidBranchName,
  mergeCommitMessage,
  normalizeRemoteUrl,
  parseRemoteUrl,
  summarizePlan,
} from '../src/domain.js';
import type { PlanItem } from '../src/types.js';

function item(patch: Partial<PlanItem> = {}): PlanItem {
  return {
    projectId: 'p_1',
    name: 'common-base',
    namespace: 'group',
    order: 0,
    sourceBranch: 'release/20261022',
    targetBranch: 'master',
    sourceSha: 'a'.repeat(40),
    targetSha: 'b'.repeat(40),
    ahead: 3,
    behind: 0,
    checks: [],
    blockers: [],
    warnings: [],
    mr: null,
    executable: true,
    noop: false,
    cachedAgeMs: null,
    ...patch,
  };
}

describe('remote 解析', () => {
  it('解析 https 与 ssh 两种形态', () => {
    expect(parseRemoteUrl('https://git.example.com/group/subgroup/api-service.git')).toEqual({
      host: 'git.example.com',
      path: 'group/subgroup/api-service',
      name: 'api-service',
      namespace: 'group/subgroup',
    });
    expect(parseRemoteUrl('git@git.example.com:group/common-base.git')).toEqual({
      host: 'git.example.com',
      path: 'group/common-base',
      name: 'common-base',
      namespace: 'group',
    });
  });

  it('同一个仓库的不同写法归一化后相同', () => {
    const a = normalizeRemoteUrl('https://git.example.com/backend/common-base.git');
    const b = normalizeRemoteUrl('git@git.example.com:backend/common-base.git');
    expect(a).toBe(b);
  });

  it('本地路径没有 host，取上一级目录名当命名空间', () => {
    expect(parseRemoteUrl('C:\\work\\common-base')?.namespace).toBe('work');
  });
});

describe('分支名校验', () => {
  it('接受中文与斜杠', () => {
    expect(isValidBranchName('feature/PROJ-123_账单模块调整')).toBe(true);
    expect(isValidBranchName('release/20261022')).toBe(true);
  });

  it('拒绝会破坏 refspec 的名字', () => {
    for (const bad of ['a b', 'a..b', 'a~1', '-x', '/x', 'x/', 'x.lock', 'a//b', '']) {
      expect(isValidBranchName(bad), bad).toBe(false);
    }
  });
});

describe('计划摘要', () => {
  const base = {
    mode: 'merge-git' as const,
    sourceBranch: 'release/20261022',
    targetBranch: 'master',
    mergeStrategy: 'merge' as const,
    deleteSourceBranch: false,
    title: 't',
    items: [item()],
  };

  it('相同输入摘要稳定', () => {
    expect(computePlanHash(base)).toBe(computePlanHash({ ...base }));
  });

  it('源提交变化会改变摘要', () => {
    const changed = { ...base, items: [item({ sourceSha: 'c'.repeat(40) })] };
    expect(computePlanHash(changed)).not.toBe(computePlanHash(base));
  });

  it('标题变化会改变摘要', () => {
    expect(computePlanHash({ ...base, title: 'other' })).not.toBe(computePlanHash(base));
  });

  it('删除源分支选项会改变摘要', () => {
    expect(computePlanHash({ ...base, deleteSourceBranch: true })).not.toBe(computePlanHash(base));
  });

  it('可执行状态变化会改变摘要', () => {
    const blocked = { ...base, items: [item({ executable: false })] };
    expect(computePlanHash(blocked)).not.toBe(computePlanHash(base));
  });
});

describe('计划汇总', () => {
  it('分别统计可执行、阻塞、无需合并与未知', () => {
    const summary = summarizePlan([
      item(),
      item({ projectId: 'p_2', executable: false, blockers: ['源分支不存在'] }),
      item({ projectId: 'p_3', ahead: 0, executable: false, noop: true }),
      item({ projectId: 'p_4', checks: [{ id: 'x', label: 'x', status: 'unknown' }] }),
    ]);
    expect(summary).toEqual({ total: 4, executable: 2, blocked: 1, noop: 1, unknown: 1 });
  });
});

describe('合并提交信息', () => {
  it('没有标题时回落到 Git 惯例写法', () => {
    expect(mergeCommitMessage('common-base', 'release/x', 'master')).toBe("Merge branch 'release/x' into 'master'");
  });

  it('标题作 subject，说明作正文', () => {
    expect(mergeCommitMessage('common-base', 'release/x', 'master', 'feat: 发版', '详见 PROJ-1')).toBe(
      'feat: 发版\n\n详见 PROJ-1',
    );
  });

  it('只有空白说明时不产生多余空行', () => {
    expect(mergeCommitMessage('common-base', 'release/x', 'master', 'feat: 发版', '   ')).toBe('feat: 发版');
  });
});

describe('分支分类', () => {
  it('识别主干、发布、特性与修复分支', () => {
    expect(branchCategory('master')).toBe('trunk');
    expect(branchCategory('release/20261022')).toBe('release');
    expect(branchCategory('feature/PROJ-1')).toBe('feature');
    expect(branchCategory('bugfix/PROJ-2')).toBe('hotfix');
    expect(branchCategory('whatever')).toBe('other');
  });
});
