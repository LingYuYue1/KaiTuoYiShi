import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { 图片是否参考角色 } from '@/models/imageGeneration';
import type { 图片槽位, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import { activeAccentSurface, cardClip, smallClip } from './foundation';
import type { AlbumImportTarget, SceneLibraryFilter } from './foundation';
import {
  buildVisibleCharacterEntries,
  EmptyLibraryBox,
  ImagePreviewModal,
  Panel,
  SafeAlbumImage,
  SlotPickerModal,
  slotLabel,
} from './workspaces';
import type { CharacterLibraryEntry, CharacterLibraryRecord, SceneLibraryEntry } from './workspaces';
import type { AlbumImportMode } from './albumArchive';
import { 解析相册资源地址 } from '@/utils/albumActions';

type GalleryScope = 'character' | Exclude<SceneLibraryFilter, 'all'>;
type GalleryItem = {
  entry: 相册条目;
  src: string;
  character?: CharacterLibraryEntry;
  scene?: SceneLibraryEntry;
};

export function ImageLibraryWorkspace({
  records,
  album,
  activeRecord,
  activeEntryId,
  resourceEntries,
  sceneEntries,
  traveler,
  onSelectRecord,
  onSelectEntry,
  onDeleteEntries,
  onSetSlot,
  onUploadReference,
  onSetReference,
  operationBusy,
  operationLabel,
  onExport,
  onImport,
}: {
  records: CharacterLibraryRecord[];
  album: 相册系统;
  activeRecord: CharacterLibraryRecord | null;
  activeEntryId?: string;
  resourceEntries: CharacterLibraryEntry[];
  sceneEntries: SceneLibraryEntry[];
  traveler: 角色数据结构;
  onSelectRecord: (id: string) => void;
  onSelectEntry: (id: string) => void;
  onDeleteEntries: (entryIds: string[]) => void;
  onSetSlot: (params: { record: CharacterLibraryRecord | null; entryId: string; src: string; slot: 图片槽位 }) => void;
  onUploadReference: (files: FileList | null, record: CharacterLibraryRecord | null) => void;
  onSetReference: (entryId: string, record: CharacterLibraryRecord, enabled: boolean) => void;
  operationBusy: boolean;
  operationLabel: string;
  onExport: () => void;
  onImport: (file: File | null, target: AlbumImportTarget, mode: AlbumImportMode) => void;
}) {
  const [scope, setScope] = useState<GalleryScope>('character');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  const visibleItems = useMemo<GalleryItem[]>(() => {
    if (scope === 'character') {
      const characters = buildVisibleCharacterEntries(activeRecord, resourceEntries, album).map((character) => ({
        entry: character.entry,
        src: character.src,
        character,
      }));
      const assets = new Map(album.assets.map((asset) => [asset.id, asset]));
      const references = activeRecord ? album.entries
        .filter((entry) => 图片是否参考角色(entry, activeRecord.id))
        .map((entry) => {
          const src = 解析相册资源地址(assets.get(entry.assetId)) || '';
          return { entry, src, character: { entry, src } };
        }) : [];
      return Array.from(new Map([...characters, ...references].map((item) => [item.entry.id, item])).values());
    }
    return sceneEntries
      .filter((scene) => scene.kind === scope)
      .map((scene) => ({ entry: scene.entry, src: scene.src, scene }));
  }, [activeRecord, album, resourceEntries, sceneEntries, scope]);
  const visibleIds = useMemo(() => new Set(visibleItems.map((item) => item.entry.id)), [visibleItems]);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.has(id));
  const previewItem = visibleItems.find((item) => item.entry.id === activeEntryId)
    ?? (selectedVisibleIds.length === 1 ? visibleItems.find((item) => item.entry.id === selectedVisibleIds[0]) : undefined);
  const activeItemId = selectedVisibleIds.length === 1 ? selectedVisibleIds[0] : activeEntryId;
  const totals = useMemo(() => ({
    character: records.reduce((sum, record) => sum + record.resourceCount, 0),
    scene: sceneEntries.filter((item) => item.kind === 'scene').length,
    snapshot: sceneEntries.filter((item) => item.kind === 'snapshot').length,
    phone: sceneEntries.filter((item) => item.kind === 'phone').length,
  }), [records, sceneEntries]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleIds]);

  const toggleSelected = (entryId: string) => {
    setSelectedIds((current) => current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]);
  };
  const handleEntryClick = (entryId: string) => {
    onSelectEntry(entryId);
    if (batchMode) toggleSelected(entryId);
  };
  const handleSetSlot = (slot: 图片槽位) => {
    if (!activeItemId || scope !== 'character') return;
    const item = visibleItems.find((candidate) => candidate.entry.id === activeItemId);
    if (!item?.src) return;
    onSetSlot({ record: activeRecord, entryId: activeItemId, src: item.src, slot });
    setSlotPickerOpen(false);
  };
  const activeItem = activeItemId ? visibleItems.find((candidate) => candidate.entry.id === activeItemId) : undefined;
  const filterOptions: Array<{ id: GalleryScope; label: string; count: number }> = [
    { id: 'character', label: '角色', count: totals.character },
    { id: 'scene', label: '场景图', count: totals.scene },
    { id: 'snapshot', label: '故事快照', count: totals.snapshot },
    { id: 'phone', label: '手机背景', count: totals.phone },
  ];

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
      <Panel title="图库筛选" className="h-full min-h-0" contentClassName="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="space-y-1.5">
            {filterOptions.map((option) => {
              const active = scope === option.id;
              return <button key={option.id} type="button" onClick={() => { setScope(option.id); setBatchMode(false); setSelectedIds([]); }} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" style={{ color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.82)', background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.16), rgba(var(--tj-tech-cyan),0.05))' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.46)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}><span className="font-serif text-sm font-bold tracking-[0.14em]">{option.label}</span><span className="text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.62)' }}>{option.count}</span></button>;
            })}
          </div>
          {scope === 'character' && <div className="min-h-0 flex-1 overflow-y-auto border-t pt-3" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.1)' }}>{records.length ? <div className="space-y-1.5">{records.map((record) => <CharacterRecordButton key={record.id} record={record} active={activeRecord?.id === record.id} onClick={() => { onSelectRecord(record.id); onSelectEntry(''); }} />)}</div> : <EmptyLibraryBox title="未找到角色" desc="让剧情写入伙伴档案后，角色会出现在这里。" />}</div>}
        </div>
      </Panel>

      <div className="flex h-full min-h-0 flex-col gap-4">
        <Panel title="图片工具" className="shrink-0" contentClassName="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs leading-relaxed" style={{ color: operationBusy ? 'rgba(var(--tj-tech-cyan),0.94)' : 'rgba(var(--tj-ui-muted),0.72)' }}>
              {operationBusy ? operationLabel : scope === 'character' ? `${activeRecord?.name || '未选择角色'} · 头像、立绘与参考图统一管理` : `${galleryScopeLabel(scope)} · 统一归档与浏览`}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={operationBusy} onClick={() => setImportOpen(true)} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgba(var(--tj-btn-primary-start),0.9)', background: 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24)', clipPath: smallClip }}>导入</button>
              <button type="button" disabled={operationBusy} onClick={onExport} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgba(var(--tj-tech-cyan),0.92)', background: 'rgba(var(--tj-tech-cyan),0.06)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.22)', clipPath: smallClip }}>导出</button>
              {scope === 'character' && <><input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { onUploadReference(event.currentTarget.files, activeRecord); event.currentTarget.value = ''; }} /><button type="button" disabled={!activeRecord || operationBusy} onClick={() => referenceInputRef.current?.click()} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, clipPath: smallClip }}>导入参考图</button></>}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <GalleryButton disabled={!previewItem?.src} onClick={() => setPreviewOpen(true)}>图片预览</GalleryButton>
            <GalleryButton disabled={operationBusy} onClick={() => { setBatchMode((current) => !current); setSelectedIds([]); }} active={batchMode}>{batchMode ? `批量选择中 · ${selectedVisibleIds.length}` : '批量选择'}</GalleryButton>
            <GalleryButton disabled={operationBusy || !batchMode || selectedVisibleIds.length === 0} danger onClick={() => onDeleteEntries(selectedVisibleIds)}>批量删除</GalleryButton>
            {scope === 'character' ? <GalleryButton disabled={operationBusy || !activeRecord || !activeItemId} primary onClick={() => setSlotPickerOpen(true)}>设置到槽位</GalleryButton> : <div />}
          </div>
        </Panel>

        <Panel title="图库" className="min-h-0 flex-1" contentClassName="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.1)' }}><span className="font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.86)' }}>{galleryScopeLabel(scope)} · 当前图库</span><span className="text-[11px]" style={{ color: 'rgba(var(--tj-ui-faint),0.72)' }}>当前显示 {visibleItems.length} 项</span></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {visibleItems.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">{visibleItems.map((item) => item.character ? <CharacterGalleryCard key={item.entry.id} item={item.character} active={activeEntryId === item.entry.id} batchMode={batchMode} selected={selectedVisibleIds.includes(item.entry.id)} reference={Boolean(activeRecord && 图片是否参考角色(item.entry, activeRecord.id))} onClick={() => handleEntryClick(item.entry.id)} /> : <SceneGalleryCard key={item.entry.id} item={item.scene!} active={activeEntryId === item.entry.id} batchMode={batchMode} selected={selectedVisibleIds.includes(item.entry.id)} onClick={() => handleEntryClick(item.entry.id)} />)}</div> : <EmptyLibraryBox title="暂无可显示资源" desc={scope === 'character' ? '生成、导入的角色图片与参考图都会显示在这里。' : '生成或导入对应类型图片后会出现在这里。'} />}
            </div>
          </div>
        </Panel>
      </div>

      <ImagePreviewModal open={previewOpen && Boolean(previewItem?.src)} src={previewItem?.src || ''} title={`图片预览 · ${previewItem?.entry.title || ''}`} onClose={() => setPreviewOpen(false)} />
      <SlotPickerModal open={slotPickerOpen} recordName={activeRecord?.name || '角色'} entryTitle={previewItem?.entry.title || ''} recommendedSlot={previewItem?.entry.slot} referenceEnabled={Boolean(activeRecord && activeItem && 图片是否参考角色(activeItem.entry, activeRecord.id))} onToggleReference={() => { if (activeRecord && activeItem) { onSetReference(activeItem.entry.id, activeRecord, !图片是否参考角色(activeItem.entry, activeRecord.id)); setSlotPickerOpen(false); } }} onClose={() => setSlotPickerOpen(false)} onSelect={handleSetSlot} />
      <LibraryImportDialog open={importOpen} onClose={() => setImportOpen(false)} scope={scope} record={activeRecord} traveler={traveler} onImport={onImport} />
    </div>
  );
}

function GalleryButton({ children, onClick, disabled = false, active = false, danger = false, primary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; primary?: boolean }) {
  const color = danger ? 'rgba(var(--tj-danger),0.92)' : primary || active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-btn-primary-start),0.92)';
  const background = danger ? 'rgba(var(--tj-danger),0.13)' : primary || active ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)';
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-[42px] px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45" style={{ color, background, boxShadow: danger ? 'inset 0 0 0 1px rgba(var(--tj-danger),0.22)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.2)', clipPath: smallClip }}>{children}</button>;
}

function CharacterRecordButton({ record, active, onClick }: { record: CharacterLibraryRecord; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block w-full min-w-0 px-3 py-2.5 text-left" style={{ background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.16), rgba(var(--tj-btn-primary-start),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}><div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{record.name}</div><div className="mt-1 flex justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}><span>已装 {record.mountedCount}</span><span>资源 {record.resourceCount}</span></div></button>;
}

function CharacterGalleryCard({ item, active, batchMode, selected, reference, onClick }: { item: CharacterLibraryEntry; active: boolean; batchMode: boolean; selected: boolean; reference: boolean; onClick: () => void }) {
  return <div className="relative overflow-hidden" style={{ contentVisibility: 'auto', containIntrinsicSize: '240px', background: selected ? 'rgba(var(--tj-tech-cyan),0.12)' : 'rgba(var(--tj-ui-panel),0.52)', boxShadow: active || selected ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.76), 0 0 18px rgba(var(--tj-btn-primary-start),0.1)' : item.entry.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.16)', clipPath: cardClip }}><button type="button" onClick={onClick} className="group block w-full text-left"><div className="relative aspect-[4/3]"><SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />{reference && <span className="absolute left-2 top-2 px-2 py-1 font-serif text-[10px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.96)', background: 'rgba(0,0,0,0.62)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.38)', clipPath: smallClip }}>参考图</span>}</div><div className="space-y-1 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</span>{batchMode && <span className="shrink-0 text-[10px]" style={{ color: selected ? 'rgba(var(--tj-tech-cyan),0.96)' : 'rgba(var(--tj-ui-muted),0.6)' }}>{selected ? '已选择' : '点选'}</span>}</div><div className="flex justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}><span>{slotLabel(item.entry.slot)}</span>{item.entry.nsfw && <span style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}</div></div></button></div>;
}

function SceneGalleryCard({ item, active, batchMode, selected, onClick }: { item: SceneLibraryEntry; active: boolean; batchMode: boolean; selected: boolean; onClick: () => void }) {
  return <div className="relative overflow-hidden" style={{ contentVisibility: 'auto', containIntrinsicSize: '240px', background: selected ? 'rgba(var(--tj-tech-cyan),0.12)' : 'rgba(var(--tj-ui-panel),0.52)', boxShadow: active || selected ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.76), 0 0 18px rgba(var(--tj-btn-primary-start),0.1)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.16)', clipPath: cardClip }}><button type="button" onClick={onClick} className="group block w-full text-left"><div className="aspect-[4/3]"><SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" /></div><div className="space-y-1 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[10px]" style={{ color: 'rgba(var(--tj-tech-cyan),0.9)' }}>{item.label}</span>{batchMode && <span className="text-[10px]" style={{ color: selected ? 'rgba(var(--tj-tech-cyan),0.96)' : 'rgba(var(--tj-ui-muted),0.6)' }}>{selected ? '已选择' : '点选'}</span>}</div><div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</div><div className="text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>{slotLabel(item.entry.slot)}</div></div></button></div>;
}

function LibraryImportDialog({ open, onClose, scope, record, traveler, onImport }: { open: boolean; onClose: () => void; scope: GalleryScope; record: CharacterLibraryRecord | null; traveler: 角色数据结构; onImport: (file: File | null, target: AlbumImportTarget, mode: AlbumImportMode) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const modeRef = useRef<AlbumImportMode>('merge');
  if (!open) return null;
  const target = galleryImportTarget(scope, record);
  const targetLabel = scope === 'character' ? record?.name || traveler.姓名 || '旅人' : galleryScopeLabel(scope);
  const chooseFile = (mode: AlbumImportMode) => {
    modeRef.current = mode;
    fileRef.current?.click();
  };
  const handleFile = (file: File | null) => {
    if (!file) return;
    const mode = modeRef.current;
    if (mode === 'replace' && !window.confirm('覆盖恢复会替换当前相册中的全部资源与任务。确认继续吗？')) return;
    onImport(file, target, mode);
    onClose();
  };
  return createPortal(<div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}><div className="w-full max-w-md px-4 py-4" style={{ background: 'linear-gradient(160deg, rgba(var(--tj-surface),0.98), rgba(var(--tj-bg-primary),0.98))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)', clipPath: cardClip }} onMouseDown={(event) => event.stopPropagation()}><div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>导入相册文件</div><div className="mt-3 space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.78)' }}><div>合并归类目标：{targetLabel}</div><div>支持本项目导出的 ZIP 备份和旧版相册 JSON。合并导入会保留当前内容并自动复用相同图片。</div><div style={{ color: 'rgba(var(--tj-danger),0.88)' }}>“覆盖恢复”仅用于完整备份，会替换当前相册中的全部资源与任务。</div></div><div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_1fr]"><button type="button" onClick={onClose} className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.82)' }}>取消</button><button type="button" onClick={() => chooseFile('replace')} className="px-3 py-2 font-serif text-xs tracking-[0.12em]" style={{ color: 'rgba(var(--tj-danger),0.92)', background: 'rgba(var(--tj-danger),0.09)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.24)', clipPath: smallClip }}>覆盖恢复</button><button type="button" onClick={() => chooseFile('merge')} className="px-3 py-2 font-serif text-xs tracking-[0.12em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, clipPath: smallClip }}>合并导入</button></div><input ref={fileRef} type="file" accept="application/zip,.zip,application/json,.json" className="hidden" onChange={(event) => { handleFile(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></div></div>, document.body);
}

function galleryImportTarget(scope: GalleryScope, record: CharacterLibraryRecord | null): AlbumImportTarget {
  if (scope === 'character') return { scope: 'character', targetType: record?.kind === 'npc' ? 'npc' : 'traveler', targetId: record?.id || 'traveler' };
  return { scope: 'scene', targetType: scope === 'phone' ? 'phone' : 'scene', sceneKind: scope };
}

function galleryScopeLabel(scope: GalleryScope): string {
  return { character: '角色', scene: '场景图', snapshot: '故事快照', phone: '手机背景' }[scope];
}
