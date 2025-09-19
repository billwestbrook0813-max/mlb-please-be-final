
// ---- Config ----
const STATS_BASE = 'https://statsapi.mlb.com/api';

function dateInPSTISO(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(d); // YYYY-MM-DD
}
const TODAY_ISO = dateInPSTISO();

// Odds API proxied by server.js
const ODDS_PREGAME_URL = '/api/odds';
const ODDS_LIVE_URL = '/api/odds-live';


// --- Ticker helpers ---
function inningLabel(game){
  const status = game.status?.detailedState || game.status?.abstractGameState;
  const isFinal = /Final/i.test(status);
  const linescore = game.linescore;
  if (isFinal) return 'Final';
  const inning = linescore?.currentInning ?? '';
  const half = linescore?.isTopInning ? 'Top' : (linescore?.isTopInning===false ? 'Bot' : '');
  return (inning && half) ? `${half} ${inning}` : status;
}

async function fetchGameFeed(gamePk){
  const r = await fetch(`${STATS_BASE}/v1.1/game/${gamePk}/feed/live`);
  if(!r.ok) return null;
  return r.json();
}

async function buildTicker(games){
  const parts = [];
  for (const g of games){
    const feed = await fetchGameFeed(g.gamePk).catch(()=>null);
    const homeName = g.teams?.home?.team?.name;
    const awayName = g.teams?.away?.team?.name;
    let homeRuns = 0, awayRuns = 0;
    if (feed){
      const ls = feed.liveData?.linescore;
      homeRuns = ls?.teams?.home?.runs ?? 0;
      awayRuns = ls?.teams?.away?.runs ?? 0;
      g.linescore = { currentInning: ls?.currentInning, isTopInning: ls?.isTopInning };
    }
    const tag = `${awayName} ${awayRuns}  —  ${homeName} ${homeRuns}  (${inningLabel(g)})`;
    parts.push(tag);
  }
  const text = '  •  ' + parts.join('   •   ') + '   •  ';
  const track = document.getElementById('tickerTrack');
  track.textContent = text + text; // repeat for continuous loop
}


// --- Theme toggle ---
const root = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'jj'; // default JJ
root.setAttribute('data-theme', savedTheme);
document.getElementById('themeBtn').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'jj' ? 'vintage' : 'jj';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});


// Team alias map (for book ↔ MLB names)
const TEAM_ALIASES = {
  'Arizona Diamondbacks': ['Arizona Diamondbacks','ARI','Arizona D-Backs','Arizona Dbacks'],
  'Atlanta Braves': ['Atlanta Braves','ATL'],
  'Baltimore Orioles': ['Baltimore Orioles','BAL'],
  'Boston Red Sox': ['Boston Red Sox','BOS'],
  'Chicago Cubs': ['Chicago Cubs','CHC'],
  'Chicago White Sox': ['Chicago White Sox','CWS','Chi White Sox'],
  'Cincinnati Reds': ['Cincinnati Reds','CIN'],
  'Cleveland Guardians': ['Cleveland Guardians','CLE'],
  'Colorado Rockies': ['Colorado Rockies','COL'],
  'Detroit Tigers': ['Detroit Tigers','DET'],
  'Houston Astros': ['Houston Astros','HOU'],
  'Kansas City Royals': ['Kansas City Royals','KC','KCR'],
  'Los Angeles Angels': ['Los Angeles Angels','LAA','LA Angels'],
  'Los Angeles Dodgers': ['Los Angeles Dodgers','LAD','LA Dodgers'],
  'Miami Marlins': ['Miami Marlins','MIA'],
  'Milwaukee Brewers': ['Milwaukee Brewers','MIL'],
  'Minnesota Twins': ['Minnesota Twins','MIN'],
  'New York Mets': ['New York Mets','NYM','NY Mets'],
  'New York Yankees': ['New York Yankees','NYY','NY Yankees'],
  'Oakland Athletics': ['Oakland Athletics','OAK','Oakland A\'s','Athletics'],
  'Philadelphia Phillies': ['Philadelphia Phillies','PHI'],
  'Pittsburgh Pirates': ['Pittsburgh Pirates','PIT'],
  'San Diego Padres': ['San Diego Padres','SD','SDP'],
  'San Francisco Giants': ['San Francisco Giants','SF','SFG'],
  'Seattle Mariners': ['Seattle Mariners','SEA'],
  'St. Louis Cardinals': ['St. Louis Cardinals','STL'],
  'Tampa Bay Rays': ['Tampa Bay Rays','TB','TBR'],
  'Texas Rangers': ['Texas Rangers','TEX'],
  'Toronto Blue Jays': ['Toronto Blue Jays','TOR'],
  'Washington Nationals': ['Washington Nationals','WSH','WAS']
};

function normalize(s){ return s.toLowerCase().replace(/[^a-z]/g,''); }
function teamMatch(mlbName, bookName){
  const nBook = normalize(bookName);
  const aliases = TEAM_ALIASES[mlbName] || [mlbName];
  return aliases.some(a => normalize(a) === nBook);
}

// ---- UI setup ----
document.getElementById('today').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', timeZone: 'America/Los_Angeles' });
document.getElementById('refreshBtn').addEventListener('click', () => loadAll(true));

const elRunsScored = document.getElementById('runsScored');
const elProjected = document.getElementById('projectedTotal');
const elGamesList = document.getElementById('gamesList');
const elFinalCount = document.getElementById('finalCount');
const elLiveCount  = document.getElementById('liveCount');
const elNSCount    = document.getElementById('nsCount');

// ---- Data fetchers ----
async function fetchSchedule(dateISO){
  const url = `${STATS_BASE}/v1/schedule?sportId=1&date=${dateISO}&hydrate=probablePitcher(note,name,stats(type=season,group=pitching))`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Schedule fetch failed: ${r.status}`);
  const j = await r.json();
  return j.dates?.[0]?.games || [];
}

async function fetchLinescore(gamePk){
  const r = await fetch(`${STATS_BASE}/v1.1/game/${gamePk}/feed/live`);
  if(!r.ok) throw new Error('Live feed failed');
  const j = await r.json();
  const gs = j.liveData?.linescore;
  const status = j.gameData?.status?.detailedState || j.gameData?.status?.abstractGameState;
  const home = gs?.teams?.home?.runs ?? 0;
  const away = gs?.teams?.away?.runs ?? 0;
  return { total: (home+away)||0, status };
}

async function fetchOddsPregame(){
  const r = await fetch(ODDS_PREGAME_URL);
  if(!r.ok) return [];
  return r.json();
}

async function fetchOddsLive(){
  const r = await fetch(ODDS_LIVE_URL);
  if(!r.ok) return [];
  return r.json();
}

// ---- Odds helpers ----
function americanToProb(odds){
  const o = Number(odds);
  if (isNaN(o)) return null;
  return o >= 0 ? 100/(o+100) : (-o)/((-o)+100);
}
function devigPair(pOverRaw, pUnderRaw){
  const denom = pOverRaw + pUnderRaw;
  if (denom === 0) return [0.5,0.5];
  const pOver = pOverRaw/denom;
  return [pOver, 1-pOver];
}
function impliedTotalFromMarket(market){
  if (!market?.outcomes || market.outcomes.length < 2) return null;
  const over = market.outcomes.find(o=>o.name==='Over');
  const under = market.outcomes.find(o=>o.name==='Under');
  if (!over || !under || over.point !== under.point) return null;
  const pOraw = americanToProb(over.price);
  const pUraw = americanToProb(under.price);
  if (pOraw==null||pUraw==null) return null;
  const [pOver] = devigPair(pOraw,pUraw);
  const skew = (pOver - 0.5);
  return (over.point || 0) + skew * 0.2;
}
function median(arr){
  const a = arr.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}

function collectGameTotals(oddsData, homeTeam, awayTeam){
  const totals = [];
  for (const ev of oddsData){
    const ht = ev.home_team, at = ev.away_team;
    if (!(teamMatch(homeTeam, ht) && teamMatch(awayTeam, at))) continue;
    const market = ev.bookmakers?.[0]?.markets?.find(m=>m.key==='totals');
    if (!market) continue;
    const t = impliedTotalFromMarket(market);
    if (Number.isFinite(t)) totals.push(t);
  }
  return median(totals);
}

// ---- Main logic ----
async function loadAll(force=false){
  try{
    document.body.style.cursor='wait';

    // Try PST today; if empty, show tomorrow (midnight edges)
    let games = await fetchSchedule(TODAY_ISO);
    if (!games.length) {
      const t = new Date(); t.setDate(t.getDate()+1);
      const TOMORROW_ISO = dateInPSTISO(t);
      console.warn('No games for', TODAY_ISO, '— trying', TOMORROW_ISO);
      games = await fetchSchedule(TOMORROW_ISO);
      document.getElementById('today').textContent += ' (showing next slate)';
    }

    const [oddsPre, oddsLive] = await Promise.all([
      fetchOddsPregame().catch(()=>[]),
      fetchOddsLive().catch(()=>[])
    ]);

    let scoredSum = 0;
    let projectedExtra = 0;
    let cntFinal=0, cntLive=0, cntNS=0;

    elGamesList.innerHTML = '';

    for (const g of games){
      const gamePk = g.gamePk;
      const status = g.status?.abstractGameState; // Preview / Live / Final
      const detailed = g.status?.detailedState || status;
      const homeTeam = g.teams?.home?.team?.name;
      const awayTeam = g.teams?.away?.team?.name;

      // Actual runs
      let actual = 0;
      try{
        const ls = await fetchLinescore(gamePk);
        actual = ls.total;
      }catch(e){
        console.warn('linescore failed for', gamePk, e);
      }
      scoredSum += actual;

      // Pitchers + season stats
      function parsePitcher(side){
        const pp = g.teams?.[side]?.probablePitcher;
        if (!pp) return null;
        const stats = pp?.stats?.find(s=>s.group?.displayName==='pitching' && s.type?.displayName==='season');
        const era = stats?.stats?.era;
        const wins = stats?.stats?.wins;
        const losses = stats?.stats?.losses;
        return { name: pp.fullName, era, wins, losses };
      }
      const hp = parsePitcher('home');
      const ap = parsePitcher('away');

      // Projection contribution
      let rowNote = '';
      if (status === 'Live'){
        cntLive++;
        const liveTotal = collectGameTotals(oddsLive, homeTeam, awayTeam) ?? collectGameTotals(oddsPre, homeTeam, awayTeam);
        const remaining = Math.max((liveTotal ?? 0) - actual, 0);
        projectedExtra += remaining;
        rowNote = `Live total≈ ${liveTotal?.toFixed?.(1) ?? '—'} | remaining≈ ${remaining.toFixed(1)}`;
      } else if (status === 'Final'){
        cntFinal++;
        rowNote = `Final`;
      } else {
        cntNS++;
        const preTotal = collectGameTotals(oddsPre, homeTeam, awayTeam);
        projectedExtra += (preTotal ?? 0);
        rowNote = `Pregame total≈ ${preTotal?.toFixed?.(1) ?? '—'}`;
      }

      // Render game
      const gameEl = document.createElement('div');
      gameEl.className = 'game ' + (status?.toLowerCase?.() || '');
      gameEl.innerHTML = `
        <div class="row teams"><span>${awayTeam}</span><span>@</span><span>${homeTeam}</span></div>
        <div class="row status"><span>${detailed}</span><span class="book-total">${rowNote}</span></div>
        <div class="pitchers">
          <div><strong>Away SP:</strong> ${ap? `${ap.name} — ERA ${ap.era ?? '—'} (${ap.wins ?? '—'}-${ap.losses ?? '—'})` : 'TBD'}</div>
          <div><strong>Home SP:</strong> ${hp? `${hp.name} — ERA ${hp.era ?? '—'} (${hp.wins ?? '—'}-${hp.losses ?? '—'})` : 'TBD'}</div>
        </div>
      `;
      elGamesList.appendChild(gameEl);
    }

    const projected = scoredSum + projectedExtra;

    elRunsScored.textContent = Math.round(scoredSum);
    elProjected.textContent  = Number.isFinite(projected) ? projected.toFixed(1) : '—';
    elFinalCount.textContent = cntFinal;
    elLiveCount.textContent  = cntLive;
    elNSCount.textContent    = cntNS;

    // Update ticker
    buildTicker(games).catch(console.warn);

    if (!games.length){
      const msg = document.createElement('div');
      msg.className = 'hint';
      msg.textContent = 'No MLB games found for the selected date.';
      elGamesList.appendChild(msg);
    }

  }catch(err){
    console.error('loadAll error', err);
    elProjected.textContent = '—';
    elGamesList.innerHTML = `<div class="hint">Error loading data. Check console logs.</div>`;
  } finally {
    document.body.style.cursor='default';
  }
}

// Auto-refresh every 60s
loadAll();
setInterval(loadAll, 60000);

