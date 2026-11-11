const DEV_MODE = import.meta.env.DEV;

export const logger = {
  debug(...args: unknown[]): void {
    if (DEV_MODE) console.debug(...args);
  },
  info(...args: unknown[]): void {
    console.info(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
