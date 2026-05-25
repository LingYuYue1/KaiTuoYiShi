export {};

declare global {
  interface Window {
    __ROOT_MOUNTED__?: boolean;
    __PREBOOT_ERROR__?: string | null;
  }
}
