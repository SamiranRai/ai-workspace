import type { ConversationMatch, MessageMatch } from "../../types";
import ConversationItem from "../conversation-item";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./ConversationList.css?inline";

registerStyles(css);

interface ConversationListProps {
  results: readonly ConversationMatch[];
  onSelectMessage?: (
    conversation: ConversationMatch,
    message: MessageMatch,
  ) => void;
  selectedIds?: ReadonlySet<string>;
  onToggleSelected?: (id: string) => void;
}

const ConversationList = ({
  results,
  onSelectMessage,
  selectedIds,
  onToggleSelected,
}: ConversationListProps) => (
  <ul className="conversation-list">
    {results.map((conversation, index) => (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        isProviderGroupStart={
          index === 0 || results[index - 1]?.provider !== conversation.provider
        }
        onSelectMessage={onSelectMessage}
        selected={selectedIds?.has(conversation.id)}
        onToggleSelected={
          onToggleSelected ? () => onToggleSelected(conversation.id) : undefined
        }
      />
    ))}
  </ul>
);

export default ConversationList;
