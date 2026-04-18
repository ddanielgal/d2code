import type { SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";

import { sortThreads } from "./lib/threadSort";
import type { SidebarThreadSummary } from "./types";
import { formatWorktreePathForDisplay } from "./worktreeCleanup";

export type SidebarWorktreeGroupKind = "root" | "worktree";

export interface SidebarWorktreeGroup {
  key: string;
  kind: SidebarWorktreeGroupKind;
  label: string;
  worktreePath: string | null;
  threadCount: number;
  threads: readonly SidebarThreadSummary[];
}

export function normalizeSidebarWorktreePath(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function sidebarWorktreeGroupKey(projectKey: string, worktreePath: string | null): string {
  const normalizedPath = normalizeSidebarWorktreePath(worktreePath);
  return normalizedPath ? `${projectKey}::worktree:${normalizedPath}` : `${projectKey}::root`;
}

export function buildSidebarWorktreeGroups(input: {
  threads: readonly SidebarThreadSummary[];
  threadSortOrder: SidebarThreadSortOrder;
}): SidebarWorktreeGroup[] {
  const byKey = new Map<string, SidebarThreadSummary[]>();

  for (const thread of input.threads) {
    const worktreePath = normalizeSidebarWorktreePath(thread.worktreePath);
    const key = worktreePath ? `worktree:${worktreePath}` : "root";
    const existing = byKey.get(key);
    if (existing) {
      existing.push(thread);
      continue;
    }
    byKey.set(key, [thread]);
  }

  return [...byKey.entries()]
    .map(([key, threads]) => {
      const worktreePath = normalizeSidebarWorktreePath(threads[0]?.worktreePath ?? null);
      const sortedThreads = sortThreads([...threads], input.threadSortOrder);
      return {
        key,
        kind: worktreePath ? "worktree" : "root",
        label: worktreePath ? formatWorktreePathForDisplay(worktreePath) : "Root",
        worktreePath,
        threadCount: sortedThreads.length,
        threads: sortedThreads,
      } satisfies SidebarWorktreeGroup;
    })
    .toSorted((left, right) => {
      if (left.kind === "root" && right.kind !== "root") {
        return -1;
      }
      if (left.kind !== "root" && right.kind === "root") {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
}

export function flattenVisibleWorktreeGroupThreadKeys(input: {
  projectKey: string;
  groups: readonly SidebarWorktreeGroup[];
  expandedByGroupKey: Readonly<Record<string, boolean>>;
}): string[] {
  return input.groups.flatMap((group) => {
    const groupKey = sidebarWorktreeGroupKey(input.projectKey, group.worktreePath);
    const expanded = input.expandedByGroupKey[groupKey] ?? true;
    if (!expanded) {
      return [];
    }
    return group.threads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    );
  });
}
