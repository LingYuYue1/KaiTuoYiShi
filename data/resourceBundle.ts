// 预置资源的**全成或全败**批量加载：并发取号、按序回填、任一失败即整体失败。
//
// 为什么单独抽：原著正文（27 个 canon 文件）与智库目录（23 个 zhiku 文件）形状相同——
// 一批静态 JSON、需要进度、需要保持预设顺序、缺任何一个都算不完整。两条轨道共用这一份实现，
// 避免「一边 worker pool、一边 allSettled」两种写法各自漂移。

export type ResourceProgress = (done: number, total: number) => void;

export interface LoadAllOrThrowInput<T, R> {
  items: readonly T[];
  /**
   * **网络单元**：必须在响应体读取完成（fetch + res.text()）后才 resolve，抛错即该单元失败。
   * 进度上报点位于本函数的 `finally`，因此落在「响应体读取完成之后」；解析/归一化属于加工段，
   * 不属于这里。
   */
  fetchOne: (item: T) => Promise<R>;
  /** 失败描述用的可读名，例如预设 id 或标题。 */
  label: (item: T) => string;
  onProgress?: ResourceProgress;
  /**
   * 并发上限。默认 4，低于浏览器每主机 6 连接：既拿掉串行 round-trip 的纯延迟，
   * 又不会把同期的其它 boot 请求挤出去。
   */
  concurrency?: number;
}

export async function loadAllOrThrow<T, R>(input: LoadAllOrThrowInput<T, R>): Promise<R[]> {
  const { items, fetchOne, label, onProgress, concurrency = 4 } = input;
  const total = items.length;
  // 按下标回填而不是 push：并发完成顺序不可控，但结果必须保持 items 顺序。
  const loaded = new Array<R>(total);
  const failures: string[] = [];
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (cursor < total) {
      // 取号与自增之间没有 await，单线程下不会重号。
      const index = cursor;
      cursor += 1;
      try {
        loaded[index] = await fetchOne(items[index]);
      } catch (error) {
        failures.push(`${label(items[index])}：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        // finally：抛错也要计数，否则进度会停在中途，而界面正是靠这个数判断还要等多久。
        done += 1;
        onProgress?.(done, total);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

  if (failures.length) {
    throw new Error(`内置预置资源不完整（${failures.length}/${total}）：${failures.join('；')}`);
  }
  return loaded;
}
