export {};

declare global {
  interface PromiseConstructor {
    /** ES2024 Promise.withResolvers；目标 lib 为 ES2022，此处显式声明。 */
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }

  interface Window {
    __ROOT_MOUNTED__?: boolean;
    __PREBOOT_ERROR__?: string | null;
  }
}
