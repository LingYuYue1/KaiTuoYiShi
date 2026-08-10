const fs = require('fs');
const p = 'e:/桌面文件/崩坏星穹铁道前端/data/builtinPresets/index.ts';
let c = fs.readFileSync(p, 'utf8');
const oldImport = "import shuangrenchenghang from './shuangrenchenghang.json';";
const newImport = oldImport + "\nimport izumi from './izumi.json';";
const oldEntry = "    shuangrenchenghang as STPresetEntry,";
const newEntry = oldEntry + "\n    izumi as STPresetEntry,";
if (!c.includes('izumi')) {
  c = c.replace(oldImport, newImport);
  c = c.replace(oldEntry, newEntry);
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched');
} else {
  console.log('already patched');
}
console.log(fs.readFileSync(p, 'utf8'));
