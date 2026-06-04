import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const landingPage = fs.readFileSync('components/layout/LandingPage.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const presenceFunction = fs.readFileSync('functions/api/presence.ts', 'utf8');

assert(presenceFunction.includes('PRESENCE_SYSTEM_ENABLED = false'), 'presence system must stay disabled while KV usage is being contained.');
assert(presenceFunction.includes("storage: 'disabled'"), 'disabled presence endpoint must report storage=disabled.');
assert(presenceFunction.includes('disabled: true'), 'disabled presence endpoint must mark the feature as disabled.');
assert(presenceFunction.includes('buildDisabledPresenceBody'), 'disabled presence endpoint must return a stable no-KV response body.');
assert(presenceFunction.includes("'cache-control': 'no-store'"), 'disabled presence endpoint must keep no-store responses.');

assert(!app.includes("fetch('/api/presence'"), 'App must not call the presence endpoint while the online-player system is disabled.');
assert(!app.includes('PRESENCE_SESSION_KEY'), 'App must not generate presence session ids while the online-player system is disabled.');
assert(!app.includes('window.setInterval') || !app.includes('/api/presence'), 'App must not schedule presence heartbeats while disabled.');
assert(!landingPage.includes("fetch('/api/presence'"), 'LandingPage must not call the presence endpoint.');
assert(!landingPage.includes('${presence.online}'), 'LandingPage must not display live online counts while disabled.');
assert(landingPage.includes('<span>在线开拓者</span>'), 'LandingPage must keep the neutral online placeholder text.');

console.log('presence disabled regression ok');
