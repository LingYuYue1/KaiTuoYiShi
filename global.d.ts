// 全局类型声明（脚本文件，非模块）：顶层 interface Window 直接合并进全局作用域，
// 等价于 `export {}` + `declare global` 的写法，且不触发 no-restricted-syntax 的 namespace 禁令。
interface Window {
  __ROOT_MOUNTED__?: boolean;
  __PREBOOT_ERROR__?: string | null;
}
