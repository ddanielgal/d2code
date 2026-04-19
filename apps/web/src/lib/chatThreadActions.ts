import { scopeProjectRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ProjectId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import type { DraftId, DraftThreadEnvMode } from "../composerDraftStore";

type DraftThreadTarget = DraftId | { environmentId: EnvironmentId; threadId: ThreadId };

interface ThreadContextLike {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  branch: string | null;
  worktreePath: string | null;
}

interface DraftThreadContextLike extends ThreadContextLike {
  threadId: ThreadId;
  envMode: DraftThreadEnvMode;
}

interface NewThreadHandler {
  (
    projectRef: ScopedProjectRef,
    options?: {
      branch?: string | null;
      worktreePath?: string | null;
      envMode?: DraftThreadEnvMode;
    },
  ): Promise<void>;
}

type NewThreadOptions = NonNullable<Parameters<NewThreadHandler>[1]>;

export interface ChatThreadActionContext {
  readonly activeDraftThread: DraftThreadContextLike | null;
  readonly activeThread: ThreadContextLike | undefined;
  readonly defaultProjectRef: ScopedProjectRef | null;
  readonly defaultThreadEnvMode: DraftThreadEnvMode;
  readonly handleNewThread: NewThreadHandler;
}

interface ThreadWorkspaceContextLike {
  readonly threadId?: ThreadId;
  readonly messages: ReadonlyArray<unknown>;
  readonly session: { status: string } | null;
  readonly worktreePath: string | null;
}

interface ApplyThreadWorkspaceModeFromContextInput {
  readonly activeThread: ThreadWorkspaceContextLike | null | undefined;
  readonly activeDraftThread: DraftThreadContextLike | null;
  readonly nextEnvMode: DraftThreadEnvMode;
  readonly setDraftThreadContext: (
    threadTarget: DraftThreadTarget,
    options: {
      envMode?: DraftThreadEnvMode;
      worktreePath?: string | null;
    },
  ) => void;
}

export function resolveThreadActionProjectRef(
  context: ChatThreadActionContext,
): ScopedProjectRef | null {
  if (context.activeThread) {
    return scopeProjectRef(context.activeThread.environmentId, context.activeThread.projectId);
  }
  if (context.activeDraftThread) {
    return scopeProjectRef(
      context.activeDraftThread.environmentId,
      context.activeDraftThread.projectId,
    );
  }
  return context.defaultProjectRef;
}

export function canApplyThreadWorkspaceModeFromContext(
  input: Pick<ApplyThreadWorkspaceModeFromContextInput, "activeThread" | "activeDraftThread">,
): boolean {
  const activeThread = input.activeThread;
  if (activeThread) {
    return (
      input.activeDraftThread !== null &&
      activeThread.messages.length === 0 &&
      activeThread.worktreePath === null &&
      (activeThread.session === null || activeThread.session.status === "closed")
    );
  }

  return input.activeDraftThread !== null;
}

export function applyThreadWorkspaceModeFromContext(
  input: ApplyThreadWorkspaceModeFromContextInput,
): boolean {
  if (!canApplyThreadWorkspaceModeFromContext(input)) {
    return false;
  }

  if (input.activeDraftThread) {
    input.setDraftThreadContext(
      {
        environmentId: input.activeDraftThread.environmentId,
        threadId: input.activeDraftThread.threadId,
      },
      {
        envMode: input.nextEnvMode,
        ...(input.nextEnvMode === "worktree" && input.activeDraftThread.worktreePath
          ? { worktreePath: null }
          : {}),
      },
    );
    return true;
  }

  return false;
}

function buildContextualThreadOptions(context: ChatThreadActionContext): NewThreadOptions {
  return {
    branch: context.activeThread?.branch ?? context.activeDraftThread?.branch ?? null,
    worktreePath:
      context.activeThread?.worktreePath ?? context.activeDraftThread?.worktreePath ?? null,
    envMode:
      context.activeDraftThread?.envMode ??
      (context.activeThread?.worktreePath ? "worktree" : "local"),
  };
}

function buildDefaultThreadOptions(context: ChatThreadActionContext): NewThreadOptions {
  return {
    envMode: context.defaultThreadEnvMode,
  };
}

export async function startNewThreadInProjectFromContext(
  context: ChatThreadActionContext,
  projectRef: ScopedProjectRef,
): Promise<void> {
  await context.handleNewThread(projectRef, buildContextualThreadOptions(context));
}

export async function startNewThreadFromContext(
  context: ChatThreadActionContext,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  await startNewThreadInProjectFromContext(context, projectRef);
  return true;
}

export async function startNewLocalThreadFromContext(
  context: ChatThreadActionContext,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  await context.handleNewThread(projectRef, buildDefaultThreadOptions(context));
  return true;
}
