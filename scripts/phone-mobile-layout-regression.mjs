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
  {
    label: 'mobile phone sidebars keep scroll inside the list panel',
    ok:
      source.includes("flex-col overflow-hidden xl:w-[292px]") &&
      source.includes("flex-col overflow-hidden xl:w-[280px]"),
  },
  {
    label: 'mobile message and contact lists have touch scroll containers',
    ok:
      (source.match(/min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3/g) ?? []).length >= 2 &&
      source.includes('[-webkit-overflow-scrolling:touch]'),
  },
  {
    label: 'mobile group member picker keeps independent touch scroll',
    ok: source.includes('max-h-36 touch-pan-y space-y-1 overflow-y-auto overscroll-contain pr-1'),
  },
];

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error('[phone-mobile-layout-regression] failed checks:');
  for (const check of failed) console.error(`- ${check.label}`);
  process.exit(1);
}

console.log(`[phone-mobile-layout-regression] ${checks.length} checks passed.`);
