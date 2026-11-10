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
  selected?: boolean;
  onToggleSelected?: () => void;
}

const ConversationItem = ({
  conversation,
  defaultExpanded = false,
  isProviderGroupStart = false,
  onSelectMessage,
  selected = false,
  onToggleSelected,
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
      <div
        className="conversation-item__header"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={isExpanded ? messagesId : undefined}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsExpanded((expanded) => !expanded);
          }
        }}
      >
        {onToggleSelected && (
          <input
            className="conversation-item__checkbox"
            type="checkbox"
            checked={selected}
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelected();
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${title}`}
          />
        )}
        <ProviderIcon platform={provider} />
        <span className="conversation-item__title">
          {conversation.titleSegments.map((segment, index) => (
            segment.highlight
              ? <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
              : <span key={`${segment.text}-${index}`}>{segment.text}</span>
          ))}
        </span>
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
      </div>

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
