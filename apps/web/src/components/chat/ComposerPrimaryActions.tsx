import { memo } from "react";
import { ChevronDownIcon, ChevronLeftIcon, CornerDownLeftIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

const SEND_SHORTCUT_LABEL = "Ctrl+Enter";

export const formatSendPrimaryActionAriaLabel = (input: {
  isConnecting: boolean;
  isPreparingWorktree: boolean;
  isSendBusy: boolean;
}) => {
  if (input.isConnecting) {
    return "Connecting";
  }
  if (input.isPreparingWorktree) {
    return "Preparing worktree";
  }
  if (input.isSendBusy) {
    return "Sending";
  }
  return `Send message (${SEND_SHORTCUT_LABEL})`;
};

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  isConnecting: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

export const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  isConnecting,
  isPreparingWorktree,
  hasSendableContent,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "px-3" : "px-4")}
          disabled={
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </Button>
      </div>
    );
  }

  if (isRunning) {
    return (
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 sm:h-8 sm:w-8"
        onClick={onInterrupt}
        aria-label="Stop generation"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
        </svg>
      </button>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8")}
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                aria-label="Implementation actions"
                disabled={isSendBusy || isConnecting}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isSendBusy || isConnecting}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  return (
    <button
      type="submit"
      className="flex h-9 enabled:cursor-pointer items-center justify-center gap-2 rounded-full bg-primary/90 pl-3.5 pr-2 text-primary-foreground transition-all duration-150 hover:bg-primary hover:scale-105 disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100 sm:h-8"
      disabled={isSendBusy || isConnecting || !hasSendableContent}
      aria-label={formatSendPrimaryActionAriaLabel({
        isConnecting,
        isPreparingWorktree,
        isSendBusy,
      })}
    >
      {isConnecting || isSendBusy ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="animate-spin"
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="20 12"
          />
        </svg>
      ) : (
        <>
          <span className="text-sm font-medium leading-none">Send</span>
          <kbd
            className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-black/15 px-1.5 font-sans text-[11px] font-medium text-primary-foreground/85 dark:bg-white/12"
            aria-hidden="true"
          >
            <span>Ctrl</span>
            <CornerDownLeftIcon className="size-3" strokeWidth={2.25} />
          </kbd>
        </>
      )}
    </button>
  );
});
