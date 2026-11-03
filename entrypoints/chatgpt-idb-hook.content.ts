import { installChatGPTIdbWriteHook } from "../src/providers/chatgpt/idb-write-hook";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    installChatGPTIdbWriteHook();
  },
});
