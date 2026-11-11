import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { attachStyles } from "../../shared/shadow-styles";
import createHost, { HOST_ID } from "./create-host";
import App from "../App";

export const ownerToken = crypto.randomUUID();
const ownerAttribute = "data-ai-workspace-owner";

const renderInto = (host: HTMLElement, initialOpen: boolean) => {
  const shadowRoot = host.attachShadow({ mode: "open" });

  // Every component registered its own stylesheet on import — see shadow-styles.
  attachStyles(shadowRoot);

  const container = document.createElement("div");
  container.className = "ai-workspace-root";
  shadowRoot.appendChild(container);

  const root = createRoot(container);
  root.render(createElement(App, { initialOpen }));
};

export const ensureApp = (initialOpen = false) => {
  const documentOwner = document.documentElement.getAttribute(ownerAttribute);
  if (documentOwner && documentOwner !== ownerToken) return;

  document.documentElement.setAttribute(ownerAttribute, ownerToken);

  if (document.getElementById(HOST_ID)) return;

  renderInto(createHost(), initialOpen);
};

export const openSearch = () => {
  const host = document.getElementById(HOST_ID);
  if (!host) {
    ensureApp(true);
    return;
  }

  host.dispatchEvent(new CustomEvent("ai-workspace:open-search"));
};

export const resetApp = () => {
  document.documentElement.setAttribute(ownerAttribute, ownerToken);
  document.getElementById(HOST_ID)?.remove();
};
