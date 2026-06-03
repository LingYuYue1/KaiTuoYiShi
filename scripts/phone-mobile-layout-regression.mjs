import fs from 'node:fs';

const source = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');

const checks = [
  {
    label: 'mobile view state exists',
    ok: source.includes("type MobilePhoneView = 'list' | 'chat' | 'contact'") && source.includes('const [mobileView, setMobileView]'),
  },
  {
    label: 'message list and chat surface are mutually exclusive on mobile',
    ok:
      source.includes("mobileView === 'list' ? 'flex' : 'hidden xl:flex") &&
      source.includes("mobileView === 'chat' ? 'flex' : 'hidden xl:flex"),
  },
  {
    label: 'contacts list and detail surface are mutually exclusive on mobile',
    ok:
      source.includes("mobileView === 'contact' ? 'flex' : 'hidden xl:flex") &&
      source.includes("setMobileView('contact')"),
  },
  {
    label: 'mobile detail pages can return to list',
    ok: source.includes('onBack={() => setMobileView') && source.includes('xl:hidden'),
  },
  {
    label: 'desktop shell remains available at xl breakpoint',
    ok: source.includes("activeApp ? 'hidden xl:flex' : 'flex'") && source.includes('xl:w-[980px]'),
  },
];

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error('[phone-mobile-layout-regression] failed checks:');
  for (const check of failed) console.error(`- ${check.label}`);
  process.exit(1);
}

console.log(`[phone-mobile-layout-regression] ${checks.length} checks passed.`);
