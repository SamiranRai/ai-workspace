import type { ConversationMatch, MessageMatch } from "../../types";
import ConversationItem from "../conversation-item";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./ConversationList.css?inline";

registerStyles(css);

interface ConversationListProps {
  results: readonly ConversationMatch[];
  expandFirst: boolean;
  onSelectMessage?: (
    conversation: ConversationMatch,
    message: MessageMatch,
  ) => void;
}

const ConversationList = ({
  results,
  expandFirst,
  onSelectMessage,
}: ConversationListProps) => (
  <ul className="conversation-list">
    {results.map((conversation, index) => (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        defaultExpanded={expandFirst && index === 0}
        onSelectMessage={onSelectMessage}
      />
    ))}
  </ul>
);

export default ConversationList;
