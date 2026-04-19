# Plan: First-Class Worktree Grouping in the Sidebar

## Summary

Add a first-class sidebar UI that groups threads into worktrees under each project, using the existing `thread.worktreePath` field as the source of truth.

This plan intentionally avoids server-side model changes. The simplest implementation is:

- keep `Project` as the repo root
- keep `Thread` as the work unit
- derive `WorktreeGroup` entirely in the web app from existing `SidebarThreadSummary[]`
- render a nested structure in the sidebar: `Project -> Worktree group -> Thread`
- treat threads with `worktreePath === null` as a root/local bucket under the project

This preserves the current orchestration and store model while making the workflow visually first-class.

## Goals

- Make worktrees visible and legible in the main sidebar.
- Group sibling threads that point at the same `worktreePath`.
- Keep root-repo threads visible under the same project without pretending they are in a worktree.
- Preserve existing project grouping across environments.
- Minimize implementation risk by keeping the change local to web selectors and sidebar rendering.

## Non-Goals

- No server contract changes.
- No orchestration schema changes.
- No new persisted server state.
- No worktree locking or exclusive ownership enforcement in this phase.
- No new top-level `Workspace` abstraction.

## Why This Is the Simplest Correct Change

The current code already has all required data:

- `ThreadShell` and `SidebarThreadSummary` already carry `branch` and `worktreePath`.
- The sidebar already groups projects across environments using logical project keys.
- Threads are already selected per project with `selectSidebarThreadsForProjectRefs(...)`.

Relevant current code:

- `apps/web/src/types.ts`
- `apps/web/src/store.ts`
- `apps/web/src/sidebarProjectGrouping.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/worktreeCleanup.ts`

Because `worktreePath` is already present in the client state, the missing piece is not plumbing from the server. The missing piece is a derived grouping layer and UI.

## Desired UX

Inside each sidebar project row:

- show a `Root` group for threads with no `worktreePath`
- show one group per distinct `worktreePath`
- label worktree groups using the leaf folder name, with path available in tooltip/context menu
- allow expanding/collapsing worktree groups independently
- keep current thread sorting, but apply it within each worktree group
- preserve project-level collapse behavior

Example:

```text
app
  Root
    housekeeping
    release notes
  feature/auth-refresh
    auth cleanup
    auth bug follow-up
  pr-182
    review comments

infra
  Root
    terraform drift check
  feature/eks-upgrade
    eks rollout
```

## Proposed Data Model Changes

No server-side or contract changes.

Add only web-local derived types.

Suggested location:

- `apps/web/src/sidebarWorktreeGrouping.ts`

```ts
import type { SidebarThreadSummary } from "./types";

export type SidebarWorktreeGroupKind = "root" | "worktree";

export interface SidebarWorktreeGroup {
  key: string;
  kind: SidebarWorktreeGroupKind;
  label: string;
  worktreePath: string | null;
  threadCount: number;
  threads: readonly SidebarThreadSummary[];
}
```

This keeps the abstraction lightweight and entirely derived.

## Grouping Rules

### Group membership

- If `thread.worktreePath` is `null`, empty, or whitespace-only, the thread belongs to the `root` group.
- Otherwise, the thread belongs to the worktree group keyed by normalized `worktreePath`.

### Group labels

- `root` group label: `Root`
- worktree group label: `formatWorktreePathForDisplay(worktreePath)`

### Group order

Use a stable, simple order:

1. `Root` first, if present
2. worktree groups sorted alphabetically by display label

This is simpler and more predictable than trying to rank groups by activity in the first pass.

### Thread order inside a group

Reuse the existing thread sorting logic:

```ts
sortThreads(groupThreads, sidebarThreadSortOrder)
```

That keeps the current behavior intact and avoids introducing a second sorting policy.

## Implementation Plan

### 1. Add a dedicated worktree grouping helper

Create `apps/web/src/sidebarWorktreeGrouping.ts`.

Responsibilities:

- normalize `worktreePath`
- derive `SidebarWorktreeGroup[]` from `SidebarThreadSummary[]`
- produce deterministic group order
- avoid duplicating sidebar component logic

Suggested implementation:

```ts
import { sortThreads } from "./lib/threadSort";
import type { SidebarThreadSortOrder } from "@t3tools/contracts/settings";
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

function normalizeWorktreePath(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildSidebarWorktreeGroups(input: {
  threads: readonly SidebarThreadSummary[];
  threadSortOrder: SidebarThreadSortOrder;
}): SidebarWorktreeGroup[] {
  const byKey = new Map<string, SidebarThreadSummary[]>();

  for (const thread of input.threads) {
    const worktreePath = normalizeWorktreePath(thread.worktreePath);
    const key = worktreePath ? `worktree:${worktreePath}` : "root";
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(thread);
    } else {
      byKey.set(key, [thread]);
    }
  }

  const groups: SidebarWorktreeGroup[] = [...byKey.entries()].map(([key, threads]) => {
    const first = threads[0];
    const worktreePath = normalizeWorktreePath(first?.worktreePath ?? null);
    const sortedThreads = sortThreads([...threads], input.threadSortOrder);
    return {
      key,
      kind: worktreePath ? "worktree" : "root",
      label: worktreePath ? formatWorktreePathForDisplay(worktreePath) : "Root",
      worktreePath,
      threadCount: sortedThreads.length,
      threads: sortedThreads,
    };
  });

  return groups.sort((left, right) => {
    if (left.kind === "root" && right.kind !== "root") return -1;
    if (left.kind !== "root" && right.kind === "root") return 1;
    return left.label.localeCompare(right.label);
  });
}
```

Notes:

- This helper is intentionally stateless.
- It composes existing sorting instead of replacing it.
- It does not try to infer repo-relative worktree names. The leaf folder display is enough for v1.

### 2. Add persisted UI state for worktree expansion

Project collapse already lives in `uiStateStore`. Worktree collapse should follow the same pattern.

Minimal additive change:

- add `worktreeGroupExpandedById: Record<string, boolean>` to `UiState`
- add `toggleWorktreeGroup(groupKey: string)`
- do not attempt cwd-based migration/preservation for v1

Suggested shape:

```ts
export interface UiWorktreeState {
  worktreeGroupExpandedById: Record<string, boolean>;
}

export interface UiState extends UiProjectState, UiThreadState, UiWorktreeState {}
```

Suggested store action:

```ts
export function toggleWorktreeGroup(state: UiState, groupKey: string): UiState {
  const expanded = state.worktreeGroupExpandedById[groupKey] ?? true;
  return {
    ...state,
    worktreeGroupExpandedById: {
      ...state.worktreeGroupExpandedById,
      [groupKey]: !expanded,
    },
  };
}
```

Persistence can be added to the existing localStorage blob with no migration complexity beyond a new optional field.

### 3. Keep store selectors unchanged

Do not change `apps/web/src/store.ts` for the first implementation.

Reason:

- `selectSidebarThreadsForProjectRefs(...)` already returns the exact raw material needed.
- derived worktree grouping belongs at the view-model layer, not the global store layer

This keeps the scope much smaller and avoids accidental regressions in other consumers of thread selectors.

### 4. Introduce a small sidebar subcomponent for worktree groups

Add a local subcomponent inside `apps/web/src/components/Sidebar.tsx` or extract to:

- `apps/web/src/components/sidebar/SidebarWorktreeGroup.tsx`

I would start with a local subcomponent in `Sidebar.tsx` to keep the change small.

Suggested props:

```ts
interface SidebarWorktreeGroupSectionProps {
  projectKey: string;
  group: SidebarWorktreeGroup;
  activeRouteThreadKey: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  // ...reuse existing callbacks needed by thread rows
}
```

### 5. Replace flat project thread rendering with grouped rendering

Today, `SidebarProjectListRow` treats `projectThreads` as a flat array. Replace that with:

1. build `worktreeGroups`
2. compute visible groups based on project expansion and per-group expansion
3. render each group header, then its visible thread rows

Pseudo-code:

```ts
const visibleProjectThreads = sortThreads(
  projectThreads.filter((thread) => thread.archivedAt === null),
  threadSortOrder,
);

const worktreeGroups = buildSidebarWorktreeGroups({
  threads: visibleProjectThreads,
  threadSortOrder,
});
```

Then render:

```tsx
{shouldShowThreadPanel && (
  <SidebarMenuSub>
    {worktreeGroups.map((group) => (
      <SidebarWorktreeGroupSection
        key={group.key}
        projectKey={project.projectKey}
        group={group}
        activeRouteThreadKey={activeRouteThreadKey}
        threadJumpLabelByKey={visibleThreadJumpLabelByKey}
        archiveThread={archiveThread}
        deleteThread={deleteThread}
      />
    ))}
  </SidebarMenuSub>
)}
```

### 6. Worktree group key design

The group key should be stable and unique within the UI state.

Suggested format:

```ts
function sidebarWorktreeGroupKey(projectKey: string, worktreePath: string | null): string {
  return worktreePath ? `${projectKey}::worktree:${worktreePath}` : `${projectKey}::root`;
}
```

This avoids collisions between projects that may coincidentally use similarly named worktrees.

### 7. Group header design

Use a subtle sub-row with:

- chevron for collapse/expand
- label: `Root` or worktree leaf name
- count badge
- optional tooltip for full path when `worktreePath !== null`

Example:

```tsx
<SidebarMenuSubItem>
  <SidebarMenuSubButton onClick={() => toggleWorktreeGroup(groupUiKey)}>
    <ChevronRightIcon className={cn("size-3 transition-transform", expanded && "rotate-90")} />
    <span className="truncate">{group.label}</span>
    <span className="ml-auto text-[10px] text-muted-foreground">{group.threadCount}</span>
  </SidebarMenuSubButton>
</SidebarMenuSubItem>
```

For worktree groups only, wrap the label with a tooltip showing `group.worktreePath`.

### 8. Thread rows stay unchanged

Do not redesign thread rows.

The thread row component and its status logic already encode a lot of mature behavior:

- unread state
- jump hints
- archive/delete actions
- active route highlighting
- selection behavior

Reuse the existing thread row rendering exactly as much as possible; only change the parent list structure.

### 9. Keyboard navigation strategy

Keep thread-level keyboard navigation unchanged.

The existing sidebar computes `visibleSidebarThreadKeys` from flat project thread lists. Update that computation to flatten only the rendered threads from expanded worktree groups.

Current behavior should remain:

- next/previous thread traversal only visits visible rows
- jump hints apply to visible thread rows

Minimal approach:

- derive `visibleSidebarThreadKeys` from grouped sections instead of directly from `projectThreads`
- do not add keyboard navigation for group headers in v1

### 10. Empty-state behavior

Project-level empty state should remain simple:

- if a project has no non-archived threads, show `No threads yet`

Do not render an empty `Root` group with no rows.

### 11. Context menu and destructive actions

No change needed in v1.

Project-level delete warnings already count threads by project. Because threads remain attached to projects and not to a new worktree entity, those flows continue to work unchanged.

Future improvement:

- add worktree group context menu actions such as `Copy worktree path` or `Collapse others`

Not required for first-class grouping.

## Concrete File Changes

### New file

- `apps/web/src/sidebarWorktreeGrouping.ts`

### Updated files

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/uiStateStore.ts`
- `apps/web/src/uiStateStore.test.ts`
- `apps/web/src/worktreeCleanup.ts` optionally, if we decide to share normalization helpers
- `apps/web/src/components/Sidebar.logic.ts` only if some visibility logic is better extracted there

### Optional tests

- `apps/web/src/sidebarWorktreeGrouping.test.ts`

## Detailed UI Wiring

### Current flow

Today:

- `Sidebar.tsx` builds `sidebarProjects`
- `SidebarProjectListRow` loads `projectThreads`
- project thread rows are rendered as one flat list

### Proposed flow

After change:

- `Sidebar.tsx` still builds `sidebarProjects`
- `SidebarProjectListRow` still loads `projectThreads`
- `SidebarProjectListRow` derives `worktreeGroups`
- the thread panel renders:
  - project header
  - zero or more worktree group headers
  - thread rows nested beneath each header

This preserves the current ownership boundaries.

## Example Sidebar Refactor

Illustrative sketch inside `SidebarProjectListRow`:

```ts
const visibleProjectThreads = useMemo(
  () => sortThreads(projectThreads.filter((thread) => thread.archivedAt === null), threadSortOrder),
  [projectThreads, threadSortOrder],
);

const worktreeGroups = useMemo(
  () =>
    buildSidebarWorktreeGroups({
      threads: visibleProjectThreads,
      threadSortOrder,
    }),
  [visibleProjectThreads, threadSortOrder],
);
```

Then derive rendered groups:

```ts
const renderedWorktreeGroups = useMemo(() => {
  if (!projectExpanded) {
    return [];
  }

  return worktreeGroups.map((group) => {
    const uiKey = sidebarWorktreeGroupKey(project.projectKey, group.worktreePath);
    const expanded = useUiStateStore.getState().worktreeGroupExpandedById[uiKey] ?? true;
    return {
      ...group,
      uiKey,
      expanded,
      renderedThreads: expanded ? group.threads : [],
    };
  });
}, [project.projectKey, projectExpanded, worktreeGroups]);
```

And render:

```tsx
<SidebarMenuSub>
  {renderedWorktreeGroups.map((group) => (
    <React.Fragment key={group.uiKey}>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton onClick={() => toggleWorktreeGroup(group.uiKey)}>
          <ChevronRightIcon className={group.expanded ? "rotate-90" : ""} />
          <span>{group.label}</span>
          <span className="ml-auto">{group.threadCount}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      {group.expanded &&
        group.renderedThreads.map((thread) => (
          <ExistingThreadRow key={thread.id} thread={thread} />
        ))}
    </React.Fragment>
  ))}
</SidebarMenuSub>
```

This is intentionally schematic, not copy-paste ready. The real edit should reuse the existing row component and selection handlers.

## Visible Thread Key Computation

One subtle area is `visibleSidebarThreadKeys`, because it powers:

- thread jump hints
- keyboard traversal
- detail prewarming

Today it flattens a project’s preview threads directly.

After grouping, update it to flatten visible threads group-by-group.

Suggested helper:

```ts
function flattenVisibleWorktreeGroupThreadKeys(input: {
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

    return group.threads.map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)));
  });
}
```

This keeps the keyboard model aligned with what the user can actually see.

## Test Plan

### Unit tests for grouping helper

Add `apps/web/src/sidebarWorktreeGrouping.test.ts`.

Cover:

1. groups `null` and empty `worktreePath` into `Root`
2. groups equal `worktreePath` values together
3. sorts `Root` before worktrees
4. sorts worktree groups by label
5. preserves thread sorting inside each group
6. handles mixed projects cleanly because grouping is done per project input array

Example:

```ts
it("groups root and worktree threads separately", () => {
  const groups = buildSidebarWorktreeGroups({
    threads: [
      makeThread({ id: "t1", title: "root a", worktreePath: null }),
      makeThread({ id: "t2", title: "wt a", worktreePath: "/repo/.worktrees/feature-a" }),
      makeThread({ id: "t3", title: "wt b", worktreePath: "/repo/.worktrees/feature-a" }),
    ],
    threadSortOrder: "created_at",
  });

  expect(groups.map((group) => group.label)).toEqual(["Root", "feature-a"]);
  expect(groups[0]?.threads.map((thread) => thread.id)).toEqual(["t1"]);
  expect(groups[1]?.threads.map((thread) => thread.id)).toEqual(["t2", "t3"]);
});
```

### UI state tests

Add tests in `apps/web/src/uiStateStore.test.ts`:

1. `toggleWorktreeGroup` defaults to expanded and toggles to collapsed
2. persisted state round-trips `worktreeGroupExpandedById`
3. unknown group ids are harmless

### Sidebar behavior tests

If existing sidebar tests are practical, cover:

1. a project with root-only threads renders one `Root` section
2. a project with multiple worktrees renders multiple group headers
3. collapsed worktree groups hide their thread rows
4. visible thread jump mapping excludes threads in collapsed worktree groups

If `Sidebar.tsx` is too heavy to test directly, keep tests concentrated in the new helper plus `uiStateStore`, and rely on manual verification for the initial pass.

## Manual Verification Checklist

1. Create a project with only root threads. Confirm one `Root` section appears.
2. Create two threads sharing the same `worktreePath`. Confirm they group together.
3. Create threads on two different worktrees. Confirm separate group headers appear.
4. Collapse a worktree group. Confirm its thread rows disappear.
5. Collapse a whole project. Confirm existing project behavior still works.
6. Use thread keyboard traversal. Confirm only visible thread rows participate.
7. Switch thread sort order. Confirm sorting changes within each worktree group.
8. Group the same repo across environments. Confirm logical project grouping still works and worktree grouping happens inside the grouped project row.

## Risks and Mitigations

### Risk: Sidebar complexity increases in a large component

`Sidebar.tsx` is already large.

Mitigation:

- keep grouping logic in `sidebarWorktreeGrouping.ts`
- add one focused render helper or small subcomponent for worktree sections
- avoid moving unrelated code during this change

### Risk: Keyboard traversal diverges from rendered rows

Mitigation:

- derive `visibleSidebarThreadKeys` from grouped rendered rows, not from the old flat list
- add a targeted test for collapsed-group exclusion

### Risk: Too much new persisted UI state complexity

Mitigation:

- keep worktree-group state as a simple `Record<string, boolean>`
- no migration logic beyond optional persisted field parsing

### Risk: Ambiguous worktree labels

Two different paths can share the same leaf name.

Mitigation:

- keep full path in tooltip/context actions
- use full `worktreePath` in the internal key
- defer richer labels until real UX feedback warrants it

## Future Enhancements

These are intentionally out of scope for the first implementation but become much easier after this change:

1. Worktree-level context menu actions
2. Worktree occupancy warnings when multiple active threads share one worktree
3. Worktree badges for dirty state, branch divergence, or PR linkage
4. A project-level switch between flat and grouped thread views
5. A richer abstraction where worktree groups become first-class selectable entities

## Recommended Execution Order

1. Add `sidebarWorktreeGrouping.ts` and tests.
2. Add `worktreeGroupExpandedById` and `toggleWorktreeGroup(...)` to `uiStateStore.ts` with tests.
3. Refactor `SidebarProjectListRow` to derive and render worktree groups.
4. Update `visibleSidebarThreadKeys` to flatten only visible grouped threads.
5. Run `bun fmt`, `bun lint`, and `bun typecheck`.
6. Perform the manual verification checklist.

## Acceptance Criteria

- Threads in the same project and same `worktreePath` render under one worktree header.
- Threads with `worktreePath === null` render under a `Root` header.
- Project grouping across environments still works.
- Existing thread row behavior remains unchanged.
- Collapsing a worktree group hides its thread rows.
- Keyboard traversal and jump hints only target visible thread rows.
- No server or contract changes are required.

## Bottom Line

The minimal first-class implementation is a pure web-app view-model and sidebar change.

The server already provides the right information. The store already preserves it. The simplest way to make your workflow first-class is to derive worktree groups from existing `SidebarThreadSummary.worktreePath` values and render them as an extra level under each project row.
