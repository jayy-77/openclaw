/**
 * Turn-taking for multi-agent group chats: enforces max depth and cooldown
 * so agents do not reply indefinitely. Used when messages.groupChat.turnTaking is set.
 */

import type { GroupChatTurnTakingConfig } from "../config/types.messages.js";

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

type GroupState = {
  depth: number;
  lastReplyAt: number;
};

const groupStateByKey = new Map<string, GroupState>();

function getState(key: string): GroupState {
  let s = groupStateByKey.get(key);
  if (!s) {
    s = { depth: 0, lastReplyAt: 0 };
    groupStateByKey.set(key, s);
  }
  return s;
}

/**
 * Returns true if this agent is allowed to reply in the group under turn-taking rules:
 * depth < maxDepth and cooldown has elapsed since last reply.
 */
export function shouldReplyWithTurnTaking(params: {
  groupKey: string;
  config?: GroupChatTurnTakingConfig | null;
}): boolean {
  const cfg = params.config;
  if (!cfg?.maxDepth && cfg?.cooldownMs === undefined) {
    return true;
  }
  const maxDepth = cfg.maxDepth ?? DEFAULT_MAX_DEPTH;
  const cooldownMs = cfg.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const state = getState(params.groupKey);
  const now = Date.now();
  if (state.depth >= maxDepth) {
    return false;
  }
  if (state.lastReplyAt > 0 && now - state.lastReplyAt < cooldownMs) {
    return false;
  }
  return true;
}

/**
 * Call after this agent has sent a reply in the group so depth and cooldown are updated.
 */
export function recordTurnTakingReply(params: { groupKey: string }): void {
  const state = getState(params.groupKey);
  state.depth += 1;
  state.lastReplyAt = Date.now();
}

/**
 * Reset state for a group (e.g. when conversation is cleared). Exposed for tests.
 */
export function resetTurnTakingState(params: { groupKey?: string }): void {
  if (params.groupKey !== undefined) {
    groupStateByKey.delete(params.groupKey);
  } else {
    groupStateByKey.clear();
  }
}
