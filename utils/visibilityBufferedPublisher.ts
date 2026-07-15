export interface VisibilitySource {
  isHidden: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

interface VisibilityBufferedPublisherOptions {
  source: VisibilitySource;
  commit: (text: string) => void;
}

export interface VisibilityBufferedPublisher {
  /** Returns true when the value was buffered because the page is hidden. */
  bufferWhenHidden: (text: string) => boolean;
  flush: () => void;
  dispose: () => void;
}

export function createDocumentVisibilitySource(doc: Document): VisibilitySource {
  return {
    isHidden: () => doc.hidden,
    subscribe: (listener) => {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
  };
}

export function createVisibilityBufferedPublisher(
  options: VisibilityBufferedPublisherOptions,
): VisibilityBufferedPublisher {
  let latestText = '';
  let pending = false;
  let disposed = false;

  const flush = () => {
    if (disposed || !pending || options.source.isHidden()) return;
    pending = false;
    options.commit(latestText);
  };

  const unsubscribe = options.source.subscribe(flush);

  return {
    bufferWhenHidden(text) {
      if (disposed || !options.source.isHidden()) return false;
      latestText = text;
      pending = true;
      return true;
    },
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = false;
      unsubscribe();
    },
  };
}
