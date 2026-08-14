import type { 存档数据 } from '@/models/settings';
import type { SaveAssetRecord } from '@/utils/saveAssetStorage';

// ── 云传输存档包（services/storage 读写侧产出）──
export interface CloudTransferSaveBundle {
  save: 存档数据;
  assetRecords: SaveAssetRecord[];
}
