import clsx from "clsx";

import type { MessageMatch, MessageRole } from "../../types";
import { formatMessageDate } from "../../utils/format";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./MessageRow.css?inline";

registerStyles(css);

const ROLE_AVATARS: Record<MessageRole, { letter: string; label: string }> = {
  user: { letter: "Q", label: "You" },
  assistant: { letter: "A", label: "Assistant" },
};

interface MessageRowProps {
  message: MessageMatch;
  onSelect: () => void;
}

const MessageRow = ({ message, onSelect }: MessageRowProps) => {
  const { letter, label } = ROLE_AVATARS[message.role];

  return (
    <li>
      <button className="message-row" type="button" onClick={onSelect}>
        <span
          className={clsx(
            "message-row__avatar",
            `message-row__avatar--${message.role}`,
          )}
          role="img"
          aria-label={label}
        >
          {letter}
        </span>
        <span className="message-row__snippet">{message.snippet}</span>
        <time className="message-row__date" dateTime={message.createdAt}>
          {formatMessageDate(message.createdAt)}
        </time>
      </button>
    </li>
  );
};

export default MessageRow;
