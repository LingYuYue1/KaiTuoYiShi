import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('App.tsx');
const gameView = read('components/layout/GameView.tsx');
const atmosphere = read('components/layout/WeatherAtmosphere.tsx');
const css = read('styles/global.css');

assert(app.includes('weatherId={state.世界.当前天气}'), 'App must pass current world weather into GameView.');
assert(!app.includes('onWeatherChange={(nextWeatherId)'), 'Weather debug callback must be removed from App.');
assert(!app.includes('当前天气: nextWeatherId'), 'Weather debug changes must not directly update world weather after debug panel removal.');
assert(!gameView.includes('onWeatherChange?: (weatherId: string) => void'), 'GameView must not expose debug weather change callback.');
assert(gameView.includes('weatherClass') && gameView.includes('kaituo-game-weather-'), 'GameView root must expose weather-specific class for frame glow.');
assert(!gameView.includes('天气调试') && !gameView.includes('直接写入当前世界状态'), 'Weather debug floating panel must be removed.');
assert(!gameView.includes('onClick={() => onWeatherChange?.(weather.id)}'), 'Weather debug buttons must be removed.');
assert(gameView.includes('<WeatherAtmosphere weatherId={effectiveWeatherId} />'), 'WeatherAtmosphere must receive current weather id.');
assert(atmosphere.includes('kaituo-weather-atmosphere') && atmosphere.includes('kaituo-weather-motes-a'), 'WeatherAtmosphere must render atmosphere effect layers.');

for (const weatherClass of [
  'kaituo-weather-clear',
  'kaituo-weather-light_rain',
  'kaituo-weather-heavy_rain',
  'kaituo-weather-snow',
  'kaituo-weather-blizzard',
  'kaituo-weather-star_dust_storm',
  'kaituo-weather-rift_wind',
  'kaituo-weather-ether_fog',
  'kaituo-weather-aurora',
  'kaituo-weather-energy_rain',
  'kaituo-weather-data_storm',
  'kaituo-weather-star_tide',
]) {
  assert(css.includes(`.${weatherClass}`), `Missing weather CSS class: ${weatherClass}`);
}

assert(!css.includes('.kaituo-weather-debug'), 'Weather debug floating panel CSS must be removed.');
assert(css.includes('Weather atmosphere v3: top flowing light band only'), 'Weather CSS must use the top-light-band redesign.');
assert(css.includes('.kaituo-game-bg::before') && css.includes('.kaituo-game-bg::after'), 'Weather top band must be attached to the game shell.');
assert(css.includes('height: 5px') && css.includes('@keyframes weather-top-band-flow'), 'Weather effect must be a narrow animated top light band.');
assert(css.includes('height: 34px') && css.includes('radial-gradient(ellipse at 50% 0%'), 'Weather top band may keep only a small top scatter glow.');
assert(css.includes('.kaituo-left-panel {') && css.includes('box-shadow: inset -1px 0 0'), 'Original left panel border must remain defined.');
assert(css.includes('.kaituo-right-menu {') && css.includes('box-shadow: inset 1px 0 0'), 'Original right menu border must remain defined.');
assert(!css.includes('.kaituo-game-bg .kaituo-chat-surface,\n.kaituo-game-bg .kaituo-left-panel,\n.kaituo-game-bg .kaituo-right-menu {\n  box-shadow: none;'), 'Weather CSS must not clear original panel borders.');
assert(css.includes('.kaituo-game-weather-heavy_rain') && css.includes('--weather-frame'), 'Weather classes must define distinct frame glow variables.');
assert(css.includes('.kaituo-weather-motes { opacity: 0 !important; }'), 'Full-screen particle layer must be muted by default.');
assert(css.includes('.kaituo-weather-atmosphere { z-index: 3; opacity: 0;'), 'Full-screen weather atmosphere must stay hidden for the top-band design.');
assert(!css.includes('inset 0 0 92px var(--weather-frame-cold)'), 'Large full-screen weather glow must stay removed.');
assert(css.includes('@keyframes weather-rain-fall'), 'Rain animation keyframes must exist.');
assert(css.includes('@keyframes weather-snow-fall'), 'Snow animation keyframes must exist.');
assert(css.includes('@keyframes weather-aurora'), 'Aurora animation keyframes must exist.');
assert(css.includes('prefers-reduced-motion: reduce') && css.includes('.kaituo-weather-atmosphere *'), 'Weather effects must respect reduced motion.');

console.log('weather atmosphere regression passed');
