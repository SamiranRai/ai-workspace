import { useId, useState } from "react";
import clsx from "clsx";

import { ExpandArrowIcon } from "../../../../shared/components/Icons";
import ProviderIcon from "../search-box/ProviderIcon";
import type { ConversationMatch, MessageMatch } from "../../types";
import { formatConversationDate, pluralize } from "../../utils/format";
import MessageRow from "../message-row";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./ConversationItem.css?inline";

registerStyles(css);

interface ConversationItemProps {
  conversation: ConversationMatch;
  defaultExpanded?: boolean;
  isProviderGroupStart?: boolean;
  onSelectMessage?: (
    conversation: ConversationMatch,
    message: MessageMatch,
  ) => void;
}

const ConversationItem = ({
  conversation,
  defaultExpanded = false,
  isProviderGroupStart = false,
  onSelectMessage,
}: ConversationItemProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const messagesId = useId();
  const { provider, title, updatedAt, messages } = conversation;

  return (
    <li
      className={clsx(
        "conversation-item",
        isProviderGroupStart && "conversation-item--group-start",
      )}
    >
      <button
        className="conversation-item__header"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={isExpanded ? messagesId : undefined}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <ProviderIcon platform={provider} />
        <span className="conversation-item__title">{title}</span>
        <span className="conversation-item__meta">
          <span>{pluralize(messages.length, "Message")}</span>
          <time dateTime={updatedAt}>{formatConversationDate(updatedAt)}</time>
        </span>
        <ExpandArrowIcon
          className={clsx(
            "conversation-item__chevron",
            isExpanded && "conversation-item__chevron--open",
          )}
          aria-hidden="true"
        />
      </button>

      {isExpanded && (
        <ul className="conversation-item__messages" id={messagesId}>
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              onSelect={() => onSelectMessage?.(conversation, message)}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export default ConversationItem;
