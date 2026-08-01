import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const compactor = fs.readFileSync('utils/saveImageCompactor.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const runtimeCompactor = fs.readFileSync('utils/saveRuntimeCompactor.ts', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const albumActions = fs.readFileSync('utils/albumActions.ts', 'utf8');

assert(compactor.includes('export function compactDuplicatedSaveImages'), 'must export save image compactor.');
assert(compactor.includes('const { 相册: album, ...withoutAlbum } = save'), 'compactor must keep album asset source data out of the replacement clone.');
assert(compactor.includes('new WeakMap()'), 'compactor must use a single-pass WeakMap clone.');
assert(compactor.includes('refs.get(value) ?? value'), 'compactor must replace only data URLs already stored in album assets.');
assert(!runtimeCompactor.includes('structuredClone'), 'runtime snapshot compaction must not duplicate the already-compacted graph.');
assert(albumActions.includes('export function 创建相册资源引用'), 'album actions must provide asset reference creation.');
assert(albumActions.includes('export function 解析相册资源引用'), 'album actions must resolve asset references for display.');
assert(sendWorkflow.includes('dataUrl: 创建相册资源引用(item.asset.id)'), 'narrative images stored on chat messages must use album asset refs after archive.');
assert(saveLoad.includes('return compactDuplicatedSaveImages(withTree)'), 'normal save payload must compact duplicated image data after attaching save tree metadata.');
assert(savePackage.includes('compactDuplicatedSaveImages(save)'), 'exported save packages must compact duplicated image data.');
assert(turnItem.includes('解析相册资源引用(album, image.dataUrl)'), 'chat narrative image display must resolve album asset refs.');
assert(phoneModal.includes('解析相册资源引用(album, phone.wallpapers?.home)'), 'phone wallpapers must resolve album asset refs.');
assert(phoneModal.includes('解析相册资源引用(album, contact.avatar || derived?.avatar)'), 'phone contact avatars must resolve album asset refs.');

console.log('save image compaction regression ok');
