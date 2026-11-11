export const HOST_ID = "aiworkspace-root";

const createHost = (): HTMLElement => {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.pointerEvents = "none";
  host.style.zIndex = "999999";

  //
  document.body.appendChild(host);

  return host;
};

export default createHost;
