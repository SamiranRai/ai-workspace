import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

import {
  AI_PROVIDERS,
  type AIProvider,
} from "../../../../../shared/models/conversation";
import {
  SearchIcon,
  DropdownIcon,
  CloseIcon,
  DoneAllIcon,
} from "../../../../shared/components/Icons";
import IconButton from "../../../../shared/components/IconButton";
import ProviderIcon from "./ProviderIcon";
import { PROVIDER_LABELS } from "./provider-labels";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./SearchBox.css?inline";
registerStyles(css);

const DEFAULT_PLACEHOLDER = "Search your AI conversations…";

const getPlaceholder = (selectedPlatforms: readonly AIProvider[]): string => {
  if (selectedPlatforms.length === 1) {
    return `Search your ${PROVIDER_LABELS[selectedPlatforms[0]]} conversations…`;
  }
  return DEFAULT_PLACEHOLDER;
};

const getPlatformSummary = (
  selectedPlatforms: readonly AIProvider[],
): string => {
  const count = selectedPlatforms.length;
  if (count === 0) return "No platforms";
  if (count === 1) return PROVIDER_LABELS[selectedPlatforms[0]];
  return `${count} platforms`;
};

const toggleItem = (
  platforms: readonly AIProvider[],
  platform: AIProvider,
): AIProvider[] =>
  platforms.includes(platform)
    ? platforms.filter((p) => p !== platform)
    : [...platforms, platform];

const allPlatformsSelected = (platforms: readonly AIProvider[]) =>
  AI_PROVIDERS.every((platform) => platforms.includes(platform));

const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onDismiss: () => void,
) => {
  useEffect(() => {
    if (!isActive) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target)
      ) {
        onDismiss();
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, isActive, onDismiss]);
};

interface PlatformMenuProps {
  id: string;
  selectedPlatforms: readonly AIProvider[];
  onToggle: (platform: AIProvider) => void;
  onSelectAll: () => void;
}

const PlatformMenu = ({
  id,
  selectedPlatforms,
  onToggle,
  onSelectAll,
}: PlatformMenuProps) => (
  <div
    id={id}
    className="search-box__platform-menu"
    role="group"
    aria-label="Search platforms"
  >
    <>
      {AI_PROVIDERS.map((platform) => (
        <label className="search-box__platform-option" key={platform}>
          <input
            className="search-box__platform-checkbox"
            type="checkbox"
            checked={selectedPlatforms.includes(platform)}
            onChange={() => onToggle(platform)}
          />
          <span className="search-box__platform-checkbox-visual" aria-hidden="true" />
          <ProviderIcon platform={platform} />
          <span>{PROVIDER_LABELS[platform]}</span>
        </label>
      ))}
      <button
        className="search-box__platform-option search-box__platform-select-all"
        type="button"
        onClick={onSelectAll}
      >
        <span
          className={`search-box__platform-checkbox-visual${
            allPlatformsSelected(selectedPlatforms) ? " is-checked" : ""
          }`}
          aria-hidden="true"
        />
        <DoneAllIcon className="search-box__select-all-icon" aria-hidden="true" />
        <span>Select All</span>
      </button>
    </>
  </div>
);

export interface SearchBoxProps {
  selectedPlatforms: readonly AIProvider[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onPlatformsChange: (platforms: AIProvider[]) => void;
  onSearch?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const SearchBox = ({
  selectedPlatforms,
  searchValue,
  onSearchValueChange,
  onPlatformsChange,
  onSearch,
  disabled = false,
  className = "",
}: SearchBoxProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useDismiss(containerRef, isMenuOpen, () => setIsMenuOpen(false));

  useLayoutEffect(() => {
    if (disabled) return;

    inputRef.current?.focus({ preventScroll: true });
  }, [disabled]);

  useEffect(() => {
    if (disabled) setIsMenuOpen(false);
  }, [disabled]);

  const placeholder = getPlaceholder(selectedPlatforms);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchValueChange(event.target.value);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSearch?.(searchValue);
    }
  };

  const handleTogglePlatform = (platform: AIProvider) => {
    onPlatformsChange(toggleItem(selectedPlatforms, platform));
  };

  const handleSelectAll = () => {
    if (!allPlatformsSelected(selectedPlatforms)) {
      onPlatformsChange([...AI_PROVIDERS]);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`search-box ${className}`.trim()}
      data-platform-count={selectedPlatforms.length}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="search-box__input-container">
        {searchValue ? (
          <IconButton
            className="search-box__clear"
            ariaLabel="Clear search"
            onClick={() => {
              onSearchValueChange("");
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <CloseIcon size={18} />
          </IconButton>
        ) : (
          <SearchIcon
            className="search-box__search-icon"
            size={25}
            viewBox="0 0 18 18"
            aria-hidden="true"
          />
        )}
        <input
          ref={inputRef}
          className="search-box__input"
          type="search"
          value={searchValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          autoFocus
        />
      </div>

      <button
        className="search-box__platform-trigger"
        type="button"
        aria-controls={isMenuOpen ? menuId : undefined}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        disabled={disabled}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span className="search-box__platform-content-container">
          {selectedPlatforms.length === 1 && (
            <ProviderIcon platform={selectedPlatforms[0]} />
          )}
          <span className="search-box__platform-summary">
            {getPlatformSummary(selectedPlatforms)}
          </span>
        </span>
        <span
          className="search-box__platform-dropdown"
          aria-hidden="true"
        >
          <DropdownIcon size={16} />
        </span>
      </button>

      {isMenuOpen && (
        <PlatformMenu
          id={menuId}
          selectedPlatforms={selectedPlatforms}
          onToggle={handleTogglePlatform}
          onSelectAll={handleSelectAll}
        />
      )}
    </div>
  );
};

export default SearchBox;
