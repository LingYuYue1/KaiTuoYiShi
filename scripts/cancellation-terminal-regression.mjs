import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const runner = read('src/kernel/application/CommandRunner.ts');
const durable = read('src/kernel/application/executeDurableJob.ts');
const kernel = read('src/kernel/NativeKernel.ts');
const composition = read('src/kernel/composition/appKernel.ts');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(runner.includes("isAbortError(error) || input.isCancelRequested() ? 'cancelled' : 'unknown'"),
  'command runner must normalize abort failures to cancelled');
assert(durable.includes('if (dependencies.signal.aborted || isAbortError(error))'),
  'durable jobs must detect cancellation in their failure path');
assert(durable.includes('const cancelled = cancelJob(job, errorMessage(error), dependencies.clock.now())'),
  'durable job cancellation must persist the cancelled state');
assert(!durable.includes('retryJob(job, errorMessage(error), now + retryDelay(job.attempt))\n    yield'),
  'abort failures must not be persisted as retry');
assert(kernel.includes("event: 'cancel.requested'"), 'kernel must log cancellation requests');
assert(kernel.includes("event: 'cancelled'"), 'kernel must log normalized cancellation terminals');
assert(composition.includes('logger: kernelLogger'), 'application composition must wire the kernel logger');

console.log('cancellation terminal normalization regression ok');
