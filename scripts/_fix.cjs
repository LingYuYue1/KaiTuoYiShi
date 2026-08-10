const fs = require('fs');
const f = 'e:/桌面文件/崩坏星穹铁道前端/utils/stPresetParser.ts';
let c = fs.readFileSync(f, 'utf8');
const old = m.source === 'st_preset' || (!m.source && m.id.startsWith('st_import_'));
const nw = m.source === 'st_preset' || m.id.startsWith('st_import_');
if (c.includes(old)) { c = c.replace(old, nw); fs.writeFileSync(f, c, 'utf8'); console.log('OK'); } else { console.log('NOT FOUND'); }
