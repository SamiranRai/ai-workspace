import type { AIProvider } from "../../../../../shared/models/conversation";
import {
  ChatgptIcon,
  ClaudeIcon,
  GeminiIcon,
  GrokIcon,
} from "../../../../shared/components/Icons";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./ProviderIcon.css?inline";

registerStyles(css);

const ICONS: Record<AIProvider, typeof ChatgptIcon> = {
  chatgpt: ChatgptIcon,
  claude: ClaudeIcon,
  gemini: GeminiIcon,
  grok: GrokIcon,
};

const VIEW_BOXES: Record<AIProvider, string> = {
  chatgpt: "0 0 22 22",
  claude: "0 0 36 36",
  gemini: "0 0 13.5 13.5",
  grok: "0 0 36 36",
};

type ProviderIconProps = {
  platform: AIProvider;
};

const ProviderIcon = ({ platform }: ProviderIconProps) => {
  const Icon = ICONS[platform];

  return (
    <Icon
      className="search-box__provider-icon"
      aria-hidden="true"
      width={14}
      height={14}
      viewBox={VIEW_BOXES[platform]}
    />
  );
};

export default ProviderIcon;
