import { scopeProjectRef } from "@t3tools/client-runtime";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  applyThreadWorkspaceModeFromContext,
  canApplyThreadWorkspaceModeFromContext,
  resolveThreadActionProjectRef,
  startNewLocalThreadFromContext,
  startNewThreadFromContext,
  type ChatThreadActionContext,
} from "./chatThreadActions";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const PROJECT_ID = ProjectId.make("project-1");
const FALLBACK_PROJECT_ID = ProjectId.make("project-2");

function createContext(overrides: Partial<ChatThreadActionContext> = {}): ChatThreadActionContext {
  return {
    activeDraftThread: null,
    activeThread: undefined,
    defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, FALLBACK_PROJECT_ID),
    defaultThreadEnvMode: "local",
    handleNewThread: async () => {},
    ...overrides,
  };
}

describe("chatThreadActions", () => {
  it("prefers the active draft thread project when resolving thread actions", () => {
    const projectRef = resolveThreadActionProjectRef(
      createContext({
        activeDraftThread: {
          threadId: "thread-1" as never,
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: "feature/refactor",
          worktreePath: "/tmp/worktree",
          envMode: "worktree",
        },
      }),
    );

    expect(projectRef).toEqual(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID));
  });

  it("falls back to the default project ref when there is no active thread context", () => {
    const projectRef = resolveThreadActionProjectRef(
      createContext({
        defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID),
      }),
    );

    expect(projectRef).toEqual(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID));
  });

  it("starts a contextual new thread from the active draft thread", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewThreadFromContext(
      createContext({
        activeDraftThread: {
          threadId: "thread-1" as never,
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: "feature/refactor",
          worktreePath: "/tmp/worktree",
          envMode: "worktree",
        },
        handleNewThread,
      }),
    );

    expect(didStart).toBe(true);
    expect(handleNewThread).toHaveBeenCalledWith(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), {
      branch: "feature/refactor",
      worktreePath: "/tmp/worktree",
      envMode: "worktree",
    });
  });

  it("starts a local thread with the configured default env mode", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewLocalThreadFromContext(
      createContext({
        defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID),
        defaultThreadEnvMode: "worktree",
        handleNewThread,
      }),
    );

    expect(didStart).toBe(true);
    expect(handleNewThread).toHaveBeenCalledWith(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), {
      envMode: "worktree",
    });
  });

  it("does not start a thread when there is no project context", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewThreadFromContext(
      createContext({
        defaultProjectRef: null,
        handleNewThread,
      }),
    );

    expect(didStart).toBe(false);
    expect(handleNewThread).not.toHaveBeenCalled();
  });

  it("applies workspace mode changes to draft threads", () => {
    const setDraftThreadContext = vi.fn();

    const didApply = applyThreadWorkspaceModeFromContext({
      activeThread: undefined,
      activeDraftThread: {
        threadId: "thread-1" as never,
        environmentId: ENVIRONMENT_ID,
        projectId: PROJECT_ID,
        branch: "feature/refactor",
        worktreePath: "/tmp/worktree",
        envMode: "worktree",
      },
      nextEnvMode: "local",
      setDraftThreadContext,
    });

    expect(didApply).toBe(true);
    expect(setDraftThreadContext).toHaveBeenCalledWith(
      {
        environmentId: ENVIRONMENT_ID,
        threadId: expect.any(String),
      },
      {
        envMode: "local",
      },
    );
  });

  it("clears a draft worktree path when switching back to new-worktree mode", () => {
    const setDraftThreadContext = vi.fn();

    applyThreadWorkspaceModeFromContext({
      activeThread: undefined,
      activeDraftThread: {
        threadId: "thread-1" as never,
        environmentId: ENVIRONMENT_ID,
        projectId: PROJECT_ID,
        branch: "feature/refactor",
        worktreePath: "/tmp/worktree",
        envMode: "local",
      },
      nextEnvMode: "worktree",
      setDraftThreadContext,
    });

    expect(setDraftThreadContext).toHaveBeenCalledWith(
      {
        environmentId: ENVIRONMENT_ID,
        threadId: expect.any(String),
      },
      {
        envMode: "worktree",
        worktreePath: null,
      },
    );
  });

  it("allows empty server-thread routes with a backing draft session to change workspace mode", () => {
    expect(
      canApplyThreadWorkspaceModeFromContext({
        activeThread: {
          threadId: "thread-1" as never,
          messages: [],
          session: null,
          worktreePath: null,
        },
        activeDraftThread: {
          threadId: "thread-1" as never,
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: null,
          worktreePath: null,
          envMode: "local",
        },
      }),
    ).toBe(true);
  });

  it("does not allow workspace mode changes once a server thread has started", () => {
    expect(
      canApplyThreadWorkspaceModeFromContext({
        activeThread: {
          threadId: "thread-1" as never,
          messages: [{}],
          session: { status: "running" },
          worktreePath: null,
        },
        activeDraftThread: {
          threadId: "thread-1" as never,
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: null,
          worktreePath: null,
          envMode: "local",
        },
      }),
    ).toBe(false);
  });
});
