/**
 * Deliver post-compaction audit warning to a configured channel (ref #22868).
 * Parses compaction.audit.channel (e.g. "telegram:-1003741251889" or "-1003741251889") and sends the text.
 */

import { resolveSessionAgentId } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/config.js";
import type { CompactionAuditConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { isDeliverableMessageChannel, normalizeMessageChannel } from "../utils/message-channel.js";
import { deliverOutboundPayloads } from "./outbound/deliver.js";

const log = createSubsystemLogger("post-compaction-audit-delivery");

/**
 * Parse compaction.audit.channel into { channel, to, threadId? }.
 * Formats: "telegram:-1003741251889", "telegram:-100:topic:42", "-1003741251889" (default telegram).
 */
function parseAuditChannelOption(
  raw: string,
): { channel: string; to: string; threadId?: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const firstColon = trimmed.indexOf(":");
  if (firstColon > 0) {
    const prefix = trimmed.slice(0, firstColon).trim().toLowerCase();
    const rest = trimmed.slice(firstColon + 1).trim();
    if (isDeliverableMessageChannel(prefix) && rest) {
      const topicMatch = /^(.+?):topic:(\d+)$/.exec(rest);
      if (topicMatch) {
        return {
          channel: prefix,
          to: topicMatch[1],
          threadId: Number.parseInt(topicMatch[2], 10),
        };
      }
      return { channel: prefix, to: rest };
    }
  }
  // Default: treat as Telegram to (e.g. "-1003741251889" or "-100:topic:42")
  if (/^-?\d+$/.test(trimmed) || trimmed.startsWith("-100")) {
    const topicMatch = /^(.+?):topic:(\d+)$/.exec(trimmed);
    if (topicMatch) {
      return {
        channel: "telegram",
        to: topicMatch[1],
        threadId: Number.parseInt(topicMatch[2], 10),
      };
    }
    return { channel: "telegram", to: trimmed };
  }
  return null;
}

/**
 * Deliver the audit warning text to the channel specified in compaction.audit.channel.
 * Returns true if delivery was attempted (and did not throw), false if channel option was invalid or skipped.
 */
export async function deliverPostCompactionAuditToChannel(params: {
  cfg: OpenClawConfig;
  audit: CompactionAuditConfig;
  text: string;
  sessionKey?: string;
}): Promise<boolean> {
  const channelOpt = params.audit.channel?.trim();
  if (!channelOpt) {
    return false;
  }

  const parsed = parseAuditChannelOption(channelOpt);
  if (!parsed || !isDeliverableMessageChannel(parsed.channel)) {
    log.warn(`post-compaction audit channel invalid or unsupported: ${channelOpt}`);
    return false;
  }

  const normalizedChannel = normalizeMessageChannel(parsed.channel) ?? parsed.channel;
  if (!isDeliverableMessageChannel(normalizedChannel)) {
    return false;
  }

  try {
    await deliverOutboundPayloads({
      cfg: params.cfg,
      channel: normalizedChannel,
      to: parsed.to,
      threadId: parsed.threadId,
      payloads: [{ text: params.text }],
      agentId: params.sessionKey
        ? resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg })
        : undefined,
    });
    return true;
  } catch (err) {
    log.warn(`post-compaction audit delivery failed: ${String(err)}`);
    return false;
  }
}
