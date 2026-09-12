// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import type { SaveManagerCallerActions } from '@/hooks/useSaveManager';
import { SaveManager } from '@/components/features/SaveLoad/SaveManager';

const baseSnapshot: SaveCatalogSnapshot = {
  items: [],
  legacyBackups: [],
  pendingIds: [],
  unreadableIds: [],
  staleCatalogIds: [],
  hiddenBaseCount: 0,
  totalStoredCount: 0,
  catalogComplete: true,
};

function makeSave(overrides: Partial<SaveListItemSummary> = {}, leaf = true): SaveListItemSummary {
  const save: SaveListItemSummary = {
    id: 1,
    type: 'auto',
    timestamp: 1_700_000_000_000,
    saveTree: { rootId: 'root-1', nodeId: 'node-1', createdAt: 1 },
    travelerName: '开拓者',
    turnCount: 3,
    worldPeriodName: '白昼',
    currentDate: '星历 1 日',
    currentTime: '08:00',
    currentLocation: '空间站',
    lastSummary: '自动摘要',
    sizeBytes: 4096,
    ...overrides,
  };
  if (leaf) save.unsealedHead = true;
  return save;
}

function createActions(snapshot: SaveCatalogSnapshot): SaveManagerCallerActions {
  return {
    showAutoArchives: true,
    onLoad: vi.fn(() => Promise.resolve(true)),
    onBranch: vi.fn(() => Promise.resolve(true)),
    onDeleteSave: vi.fn(() => Promise.resolve(true)),
    onDeleteSaveTree: vi.fn(() => Promise.resolve()),
    onClearActiveSaveTreeMeta: vi.fn(),
    onGetSaveCatalogSnapshot: vi.fn(() => Promise.resolve(snapshot)),
    onStartSaveCatalogRepair: vi.fn(() => Promise.resolve({ total: 0, processed: 0, failed: 0, skippedForLease: false })),
    onSubscribeSaveCatalogRepair: vi.fn(() => () => {}),
    onRepairSaveDatabase: vi.fn(() => Promise.resolve()),
    onDeleteLegacyBackupSaves: vi.fn(() => Promise.resolve(0)),
    onExportSavePackage: vi.fn(() => Promise.resolve()),
    onExportSaveTreePackage: vi.fn(() => Promise.resolve()),
    onImportSaveFileAsMany: vi.fn(() => Promise.resolve(0)),
  };
}

const mixedTree: SaveListItemSummary[] = [
  makeSave({ id: 1, lastSummary: '自动摘要' }),
  makeSave({ id: 2, type: 'imported', lastSummary: '导入摘要', saveTree: { rootId: 'root-1', nodeId: 'node-2', parentNodeId: 'node-1', createdAt: 2 } }, false),
];

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeLegacySave(overrides: Partial<SaveListItemSummary>): SaveListItemSummary {
  const save = makeSave(overrides);
  delete save.saveTree;
  return save;
}

describe('过滤语义（4b：两变体各自保留）', () => {
  it('模态按节点过滤：自动维度隐藏同树导入节点', async () => {
    const actions = createActions({ ...baseSnapshot, items: mixedTree });
    render(
      <SaveManager variant="modal" {...actions} onExportActiveLeafPackage={() => Promise.resolve(1)} onClose={() => {}} />,
    );

    await screen.findByText('自动摘要');
    fireEvent.click(screen.getByRole('button', { name: /^自动/ }));

    await waitFor(() => expect(screen.queryByText('导入摘要')).not.toBeInTheDocument());
    expect(screen.getByText('自动摘要')).toBeInTheDocument();
  });

  it('设置页先按类型过滤节点再建树', async () => {
    const actions = createActions({ ...baseSnapshot, items: mixedTree });
    render(
      <SaveManager variant="settingsTab" {...actions} onContinue={() => Promise.resolve(true)} />,
    );

    await screen.findByText('自动摘要');
    fireEvent.click(screen.getByRole('button', { name: '自动' }));

    await waitFor(() => expect(screen.queryByText('导入摘要')).not.toBeInTheDocument());
    expect(screen.getByText('自动摘要')).toBeInTheDocument();
  });

  it('无树元数据的旧档：两变体的过滤顺序差异保持稳定', async () => {
    const legacySaves: SaveListItemSummary[] = [
      makeLegacySave({ id: 1, type: 'auto', turnCount: 5, timestamp: 1000, lastSummary: 'A摘要' }),
      makeLegacySave({ id: 2, type: 'imported', turnCount: 1, timestamp: 2000, lastSummary: 'B摘要' }),
      makeLegacySave({ id: 3, type: 'auto', turnCount: 6, timestamp: 3000, lastSummary: 'C摘要' }),
    ];

    const modalActions = createActions({ ...baseSnapshot, items: legacySaves });
    const modal = render(
      <SaveManager variant="modal" {...modalActions} onExportActiveLeafPackage={() => Promise.resolve(1)} onClose={() => {}} />,
    );
    await screen.findAllByText(/C摘要/);
    fireEvent.click(screen.getByRole('button', { name: /^自动/ }));
    // 模态先建树后过滤：C 所在树被选中，A 所在树不展示。
    await waitFor(() => expect(screen.queryAllByText(/A摘要/)).toHaveLength(0));
    expect(screen.getAllByText(/C摘要/).length).toBeGreaterThan(0);
    modal.unmount();

    const settingsActions = createActions({ ...baseSnapshot, items: legacySaves });
    render(
      <SaveManager variant="settingsTab" {...settingsActions} onContinue={() => Promise.resolve(true)} />,
    );
    await screen.findAllByText(/C摘要/);
    fireEvent.click(screen.getByRole('button', { name: '自动' }));
    // 设置页先过滤后建树：A 与 C 被合并成同一棵旧档树。
    await waitFor(() => expect(screen.getAllByText(/A摘要/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/C摘要/).length).toBeGreaterThan(0);
  });

  it('设置页按整树过滤：无命中类型的树整体隐藏', async () => {
    const importedOnly = [makeSave({ id: 5, type: 'imported', lastSummary: '仅导入' })];
    const actions = createActions({ ...baseSnapshot, items: importedOnly });
    render(
      <SaveManager variant="settingsTab" {...actions} onContinue={() => Promise.resolve(true)} />,
    );

    await screen.findByText('仅导入');
    fireEvent.click(screen.getByRole('button', { name: '自动' }));

    await waitFor(() => expect(screen.getByText('暂无符合条件的存档。')).toBeInTheDocument());
    expect(screen.queryByText('仅导入')).not.toBeInTheDocument();
  });
});
