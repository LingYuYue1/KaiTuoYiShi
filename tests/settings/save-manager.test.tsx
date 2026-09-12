// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { SaveCatalogRepairState, SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import type { SaveManagerCallerActions } from '@/hooks/useSaveManager';
import { SaveManager } from '@/components/features/SaveLoad/SaveManager';
import { pickSavePackageFile } from '@/components/features/SaveLoad/pickSaveFile';

vi.mock('@/components/features/SaveLoad/pickSaveFile', () => ({
  pickSavePackageFile: vi.fn(),
}));

type Variant = 'modal' | 'settingsTab';

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
    lastSummary: '刚刚抵达',
    sizeBytes: 4096,
    ...overrides,
  };
  if (leaf) save.unsealedHead = true;
  return save;
}

function createActions(snapshot: SaveCatalogSnapshot = baseSnapshot) {
  return {
    showAutoArchives: true,
    onLoad: vi.fn(() => Promise.resolve(true)),
    onBranch: vi.fn(() => Promise.resolve(true)),
    onDeleteSave: vi.fn(() => Promise.resolve(true)),
    onDeleteSaveTree: vi.fn(() => Promise.resolve()),
    onClearActiveSaveTreeMeta: vi.fn(),
    onGetSaveCatalogSnapshot: vi.fn(() => Promise.resolve(snapshot)),
    onStartSaveCatalogRepair: vi.fn(() => Promise.resolve({ total: 0, processed: 0, failed: 0, skippedForLease: false })),
    onSubscribeSaveCatalogRepair: vi.fn<(listener: (state: SaveCatalogRepairState) => void) => () => void>(),
    onRepairSaveDatabase: vi.fn(() => Promise.resolve()),
    onDeleteLegacyBackupSaves: vi.fn(() => Promise.resolve(1)),
    onExportSavePackage: vi.fn(() => Promise.resolve()),
    onExportSaveTreePackage: vi.fn(() => Promise.resolve()),
    onImportSaveFileAsMany: vi.fn(() => Promise.resolve(1)),
  };
}

function renderManager(
  variant: Variant,
  actions: SaveManagerCallerActions,
): ReturnType<typeof render> {
  if (variant === 'modal') {
    return render(
      <SaveManager
        variant="modal"
        {...actions}
        onExportActiveLeafPackage={() => Promise.resolve(1)}
        onClose={() => {}}
      />,
    );
  }
  return render(
    <SaveManager
      variant="settingsTab"
      {...actions}
      onContinue={() => Promise.resolve(true)}
    />,
  );
}

const variantLabels: Record<Variant, { import: string; legacyClear: RegExp; deleteTree: string }> = {
  modal: { import: '导入存档包', legacyClear: /清理全部旧恢复点/, deleteTree: '删除整树' },
  settingsTab: { import: '导入存档', legacyClear: /清理历史恢复点/, deleteTree: '删除整棵存档树' },
};

let confirmSpy: MockInstance<typeof window.confirm>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each<[Variant]>([['modal'], ['settingsTab']])('存档管理变体 %s', (variant) => {
  const labels = variantLabels[variant];

  it('载入目录后展示存档节点', async () => {
    const actions = createActions({ ...baseSnapshot, items: [makeSave({ id: 7 })] });
    renderManager(variant, actions);

    expect((await screen.findAllByText('开拓者')).length).toBeGreaterThan(0);
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(1));
  });

  it('读取前弹未保存提示；取消则不改动会话', async () => {
    const save = makeSave({ id: 7 });
    const actions = createActions({ ...baseSnapshot, items: [save] });
    renderManager(variant, actions);

    const loadButton = await screen.findByRole('button', { name: '读取' });
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(loadButton);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith('读取这个存档会替换当前未保存的进度，是否继续？'));
    expect(actions.onLoad).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(loadButton);
    await waitFor(() => expect(actions.onLoad).toHaveBeenCalledWith(7));
  });

  it('未注入 onBranch 时检查点回退 onLoad', async () => {
    const checkpoint = makeSave({ id: 9, saveTree: { rootId: 'root-1', nodeId: 'node-2', parentNodeId: 'node-1', createdAt: 2 } }, false);
    const actions = createActions({ ...baseSnapshot, items: [checkpoint] });
    const branchSpy = actions.onBranch;
    renderManager(variant, { ...actions, onBranch: undefined });

    fireEvent.click(await screen.findByRole('button', { name: '分支' }));
    await waitFor(() => expect(actions.onLoad).toHaveBeenCalledWith(9));
    expect(branchSpy).not.toHaveBeenCalled();
  });

  it('删除节点走门面用例动作', async () => {
    const save = makeSave({ id: 7 });
    const actions = createActions({ ...baseSnapshot, items: [save] });
    renderManager(variant, actions);

    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    await waitFor(() => expect(actions.onDeleteSave).toHaveBeenCalledWith(save));
  });

  it('导入存档后切到导入过滤维度', async () => {
    const imported = makeSave({ id: 11, type: 'imported' });
    const actions = createActions({ ...baseSnapshot, items: [makeSave({ id: 7 }), imported] });
    vi.mocked(pickSavePackageFile).mockResolvedValueOnce(new File(['x'], 'a.ktysave'));
    renderManager(variant, actions);

    fireEvent.click(await screen.findByRole('button', { name: labels.import }));
    await waitFor(() => expect(actions.onImportSaveFileAsMany).toHaveBeenCalledTimes(1));
    expect(actions.onImportSaveFileAsMany).toHaveBeenCalledWith(expect.any(File));
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(2));
  });

  it('导出单节点走门面用例动作', async () => {
    const save = makeSave({ id: 7 });
    const actions = createActions({ ...baseSnapshot, items: [save] });
    renderManager(variant, actions);

    const idLabels = await screen.findAllByText(/#7/);
    const row = idLabels.map((label) => label.closest('article')).find((article): article is HTMLElement => article !== null);
    if (!row) throw new Error('未找到存档行');
    fireEvent.click(within(row).getByRole('button', { name: '导出' }));
    await waitFor(() => expect(actions.onExportSavePackage).toHaveBeenCalledWith(7));
  });

  it('历史恢复点批量清理逐条收敛元信息', async () => {
    const backup = makeSave({ id: 21, type: 'backup', saveTree: { rootId: 'legacy-root', nodeId: 'legacy-node-21', createdAt: 3 } }, false);
    const actions = createActions({ ...baseSnapshot, items: [makeSave({ id: 7 })], legacyBackups: [backup] });
    renderManager(variant, actions);

    fireEvent.click(await screen.findByRole('button', { name: labels.legacyClear }));
    await waitFor(() => expect(actions.onDeleteLegacyBackupSaves).toHaveBeenCalledTimes(1));
    expect(actions.onClearActiveSaveTreeMeta).toHaveBeenCalledWith({ nodeId: 'legacy-node-21' });
  });

  it('修复存档索引走门面用例动作', async () => {
    const actions = createActions({ ...baseSnapshot, items: [makeSave({ id: 7 })] });
    renderManager(variant, actions);

    fireEvent.click(await screen.findByRole('button', { name: '修复存档索引' }));
    await waitFor(() => expect(actions.onRepairSaveDatabase).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(2));
  });
});

describe('存档修复进度', () => {
  it('目录缺失时自动触发 missing-only 补齐并二次刷新', async () => {
    const actions = createActions({ ...baseSnapshot, pendingIds: [7] });
    renderManager('modal', actions);

    await waitFor(() => expect(actions.onStartSaveCatalogRepair).toHaveBeenCalledWith('missing-only'));
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(2));
  });

  it.each<[Variant]>([['modal'], ['settingsTab']])('%s 订阅修复进度并在完成后刷新', async (variant) => {
    let emitRepair: ((state: SaveCatalogRepairState) => void) | null = null;
    const actions = createActions({ ...baseSnapshot, pendingIds: [7] });
    actions.onSubscribeSaveCatalogRepair.mockImplementation((listener) => {
      emitRepair = listener;
      return () => {};
    });
    renderManager(variant, actions);

    await waitFor(() => expect(actions.onStartSaveCatalogRepair).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(2));

    act(() => {
      emitRepair?.({ phase: 'repairing', scope: 'missing-only', total: 4, processed: 2, failed: 0 });
    });
    const progressPattern = variant === 'modal' ? /正在恢复节点详情 2 \/ 4/ : /正在修复存档索引：2\/4/;
    expect(await screen.findByText(progressPattern)).toBeInTheDocument();

    act(() => {
      emitRepair?.({ phase: 'completed', scope: 'missing-only', total: 4, processed: 4, failed: 0 });
    });
    await waitFor(() => expect(actions.onGetSaveCatalogSnapshot).toHaveBeenCalledTimes(3));
  });
});
