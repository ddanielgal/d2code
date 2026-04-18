import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { DEFAULT_INTERACTION_MODE, type SidebarThreadSummary } from "./types";
import {
  buildSidebarWorktreeGroups,
  flattenVisibleWorktreeGroupThreadKeys,
  sidebarWorktreeGroupKey,
} from "./sidebarWorktreeGrouping";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-1");

function makeSidebarThreadSummary(
  overrides: Partial<SidebarThreadSummary> &
    Pick<SidebarThreadSummary, "id" | "environmentId" | "projectId" | "title">,
): SidebarThreadSummary {
  return {
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

describe("buildSidebarWorktreeGroups", () => {
  it("groups null and blank worktree paths into Root", () => {
    const groups = buildSidebarWorktreeGroups({
      threads: [
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-1"),
          environmentId,
          projectId,
          title: "Root A",
          worktreePath: null,
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-2"),
          environmentId,
          projectId,
          title: "Root B",
          worktreePath: "   ",
        }),
      ],
      threadSortOrder: "created_at",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Root");
    expect(groups[0]?.threads.map((thread) => thread.id).sort()).toEqual([
      ThreadId.make("thread-1"),
      ThreadId.make("thread-2"),
    ]);
  });

  it("groups matching worktree paths together and sorts root first", () => {
    const groups = buildSidebarWorktreeGroups({
      threads: [
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-1"),
          environmentId,
          projectId,
          title: "Root",
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-2"),
          environmentId,
          projectId,
          title: "WT A",
          worktreePath: "/repo/.worktrees/feature-a",
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-3"),
          environmentId,
          projectId,
          title: "WT B",
          worktreePath: "/repo/.worktrees/feature-a",
        }),
      ],
      threadSortOrder: "created_at",
    });

    expect(groups.map((group) => group.label)).toEqual(["Root", "feature-a"]);
    expect(groups[1]?.threads.map((thread) => thread.id).sort()).toEqual([
      ThreadId.make("thread-2"),
      ThreadId.make("thread-3"),
    ]);
  });

  it("sorts worktree groups alphabetically by display label", () => {
    const groups = buildSidebarWorktreeGroups({
      threads: [
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-1"),
          environmentId,
          projectId,
          title: "B",
          worktreePath: "/repo/.worktrees/zebra",
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-2"),
          environmentId,
          projectId,
          title: "A",
          worktreePath: "/repo/.worktrees/alpha",
        }),
      ],
      threadSortOrder: "created_at",
    });

    expect(groups.map((group) => group.label)).toEqual(["alpha", "zebra"]);
  });

  it("preserves thread sorting inside each group", () => {
    const groups = buildSidebarWorktreeGroups({
      threads: [
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-1"),
          environmentId,
          projectId,
          title: "Older",
          worktreePath: "/repo/.worktrees/feature-a",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-2"),
          environmentId,
          projectId,
          title: "Newer",
          worktreePath: "/repo/.worktrees/feature-a",
          createdAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
      threadSortOrder: "created_at",
    });

    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual([
      ThreadId.make("thread-2"),
      ThreadId.make("thread-1"),
    ]);
  });
});

describe("flattenVisibleWorktreeGroupThreadKeys", () => {
  it("excludes threads from collapsed worktree groups", () => {
    const groups = buildSidebarWorktreeGroups({
      threads: [
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-1"),
          environmentId,
          projectId,
          title: "Root",
        }),
        makeSidebarThreadSummary({
          id: ThreadId.make("thread-2"),
          environmentId,
          projectId,
          title: "WT",
          worktreePath: "/repo/.worktrees/feature-a",
        }),
      ],
      threadSortOrder: "created_at",
    });

    const visibleKeys = flattenVisibleWorktreeGroupThreadKeys({
      projectKey: "project-key",
      groups,
      expandedByGroupKey: {
        [sidebarWorktreeGroupKey("project-key", "/repo/.worktrees/feature-a")]: false,
      },
    });

    expect(visibleKeys).toEqual(["environment-local:thread-1"]);
  });
});
