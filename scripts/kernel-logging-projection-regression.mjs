import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const useGame = read('hooks/useGame.ts');
const projectionStore = read('src/adaptations/projections/projectionStore.ts');
const logger = read('src/kernel/observability/kernelLogger.ts');
const appKernel = read('src/kernel/composition/appKernel.ts');
const diagnostics = read('src/kernel/contract/rootCapabilities.ts');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const currentRead = useGame.indexOf('const initialView = await session.projection.current();');
const initialize = useGame.indexOf('projectionStore.initialize(initialView)', currentRead);
const subscribe = useGame.indexOf('session.projection.subscribe', initialize);
const resync = useGame.indexOf('const synchronizedView = await session.projection.resync()', subscribe);

assert(currentRead >= 0, 'session connection must read the initial projection');
assert(initialize > currentRead, 'session connection must initialize the projection from the initial read');
assert(subscribe > initialize, 'session connection must subscribe only after projection initialization');
assert(resync > subscribe, 'session connection must resync after subscription to close the read-subscribe race');
assert(projectionStore.includes("throw new Error('Kernel projection is not initialized')"), 'projection store must retain its fail-fast invariant');
assert(logger.includes('BoundedKernelLogTarget'), 'kernel logging must provide a bounded in-memory target');
assert(logger.includes('normalizeError'), 'kernel logging must normalize errors into structured entries');
assert(appKernel.includes('BrowserConsoleLogTarget') && appKernel.includes('kernelLogBuffer'), 'app composition must prepare console and buffered log targets');
assert(diagnostics.includes('subscribeKernelLogs') && diagnostics.includes('clearKernelLogs'), 'diagnostics must expose a future UI log reader seam');

console.log('kernel logging and projection initialization regression checks passed');
