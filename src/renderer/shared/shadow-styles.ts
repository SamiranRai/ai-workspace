// Style registry for the panel's shadow DOM.

const registered = new Set<string>();
const chunks: string[] = [];
let root: ShadowRoot | null = null;

export function registerStyles(
  css: string,
  priority: "base" | "component" = "component",
) {
  if (registered.has(css)) return;
  registered.add(css);

  if (priority === "base") chunks.unshift(css);
  else chunks.push(css);

  flush();
}

export function attachStyles(shadow: ShadowRoot) {
  root = shadow;
  flush();
}

function flush() {
  if (!root) return;

  let tag = root.querySelector("style[data-sf]") as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.dataset.sf = "";
    root.append(tag);
  }
  tag.textContent = chunks.join("\n");
}
