import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('@/utils/devLog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/devLog')>();
  return {
    ...actual,
    devLog: vi.fn(),
    devLogError: vi.fn(),
  };
});

afterEach(cleanup);
