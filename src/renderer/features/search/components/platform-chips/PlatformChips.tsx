import { useLayoutEffect, useRef } from "react";

import type { AIProvider } from "../../../../../types/conversation";
import IconButton from "../../../../shared/components/IconButton";
import { CloseIcon } from "../../../../shared/components/Icons";
import ProviderIcon from "../search-box/ProviderIcon";
import { PROVIDER_LABELS } from "../search-box/provider-labels";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./PlatformChips.css?inline";

registerStyles(css);

interface PlatformChipsProps {
  platforms: readonly AIProvider[];
  onRemove: (platform: AIProvider) => void;
}

const REMOVE_BUTTON_SELECTOR = "button:not(:disabled)";

const PlatformChips = ({ platforms, onRemove }: PlatformChipsProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const focusIndexAfterRemoval = useRef<number | null>(null);
  const canRemove = platforms.length > 1;

  // A removed chip takes keyboard focus with it, so hand focus to its neighbour.
  useLayoutEffect(() => {
    const index = focusIndexAfterRemoval.current;
    if (index === null) return;

    focusIndexAfterRemoval.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      REMOVE_BUTTON_SELECTOR,
    );
    buttons?.[Math.min(index, buttons.length - 1)]?.focus();
  }, [platforms]);

  if (platforms.length === 0) return null;

  const handleRemove = (platform: AIProvider, index: number) => {
    const hadFocus = listRef.current?.contains(document.activeElement) ?? false;
    focusIndexAfterRemoval.current = hadFocus ? index : null;
    onRemove(platform);
  };

  return (
    <ul
      className="platform-chips"
      aria-label="Selected platforms"
      ref={listRef}
    >
      {platforms.map((platform, index) => {
        const label = PROVIDER_LABELS[platform];

        return (
          <li className="platform-chips__chip" key={platform}>
            <span className="platform-chips__chip__content">
              <ProviderIcon platform={platform} />
              <span className="platform-chips__chip__label">{label}</span>
            </span>
            <IconButton
              className="platform-chips__chip__remove"
              ariaLabel={`Remove ${label}`}
              disabled={!canRemove}
              onClick={() => handleRemove(platform, index)}
            >
              <CloseIcon size={16} />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
};

export default PlatformChips;
