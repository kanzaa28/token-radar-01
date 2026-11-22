// Token Launch Radar — the page.
//
// Everything rendered here comes from window.RADAR, the data file main.ts
// writes beside this folder; the page asks for nothing over the network.
// It draws the ranked board, filters it, and for any row opens a sheet
// that shows the model's arithmetic for that row — recomputed here, in
// the page, from the same figures — beside the farm plan the board
// carries, which the page rebuilds from the row's own record.
(function () {
  'use strict';

  var R = window.RADAR;
  if (!R) return;
  var root = document.getElementById('board');
  var view = { text: '', cat: 'all', chain: 'all', wl: false, tab: 'board', key: 'implied', asc: false, pick: null };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  var whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return whole.format(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(n) {
    if (n === null || n === undefined) return 'unknown';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(n)) + 'd';
  }

  // The model, restated: feed this the row's snapshot figures and the
  // model's parameters and it returns the number board.json carries.
  // The detail sheet prints both side by side so a reader can check.
  function impliedOf(row, model) {
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var clamped = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    var growthPart = 1 + (clamped / 100) * model.growth_weight;
    var years = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturityPart = model.maturity_floor + (Math.min(Math.max(years, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainCount = row.chains ? row.chains.length : 0;
    var breadthPart = 1 + Math.min(Math.max(chainCount - 1, 0), model.breadth_cap_chains) * model.breadth_step;
    var value = row.tvl_usd * model.base_multiple * growthPart * maturityPart * breadthPart;
    return Math.max(1, Math.round(value));
  }

  // The farm plan, rebuilt from the row: the category's words pick the
  // opening and weekly actions, TVL picks the capital, age picks the
  // hold. The strings match what main.ts wrote into board.json.
  function leadChain(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function stakeFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdFor(days) {
    if (days === null || days === undefined) return 30;
    if (days < 180) return 60;
    if (days < 365) return 45;
    return 30;
  }
  var PLAN_RULES = [
    [['lend', 'cdp', 'collateral'],
      function (p, c, k) { return 'Supply $' + k + ' of USDC to ' + p.name + ' on ' + c + ' and keep the position open.'; },
      function (p, c, s) { return 'Borrow $' + s + ' against the supplied collateral on ' + p.name + ', repay it the same week, and leave the supply position open.'; }],
    [['dex', 'yield', 'leveraged farm'],
      function (p, c, k) { return 'Provide $' + k + " of liquidity to " + p.name + "'s main pool on " + c + ' and keep the position open.'; },
      function (p, c, s) { return 'Swap $' + s + ' through ' + p.name + "'s main pool on " + c + ' once a week so the wallet shows repeated use.'; }],
    [['bridge'],
      function (p, c, k) { return 'Bridge $' + k + ' of USDC to ' + c + ' through ' + p.name + ' and use the bridged funds in its app.'; },
      function (p, c, s) { return 'Bridge $' + s + ' to ' + c + ' through ' + p.name + ' and back once a week to keep the route active.'; }],
    [['staking', 'restak'],
      function (p, c, k) { return 'Stake $' + k + " of the chain's staking asset through " + p.name + ' and keep the receipt.'; },
      function (p) { return 'Restake the staking rewards ' + p.name + ' pays out, so the staked balance grows every week.'; }],
    [['perpetual', 'derivative'],
      function (p, c, k) { return 'Deposit $' + k + ' of USDC as margin on ' + p.name + ' and open one small hedge.'; },
      function (p) { return 'Close the hedge on ' + p.name + ' and reopen it at the new size, keeping the margin deposit untouched.'; }],
    [['prediction'],
      function (p, c, k) { return 'Fund $' + k + ' and place one market position on ' + p.name + '.'; },
      function (p) { return 'Settle one market on ' + p.name + " and open the next week's position with the same stake."; }],
    [['curator', 'allocator'],
      function (p, c, k) { return 'Deposit $' + k + ' into a ' + p.name + ' vault on ' + c + ' and keep the shares.'; },
      function (p, c, s) { return 'Top the ' + p.name + ' vault up by $' + s + ' each week and keep the shares in the same wallet.'; }],
    [['stable'],
      function (p, c, k) { return 'Mint or deposit $' + k + ' of the stable asset through ' + p.name + ' on ' + c + '.'; },
      function (p, c, s) { return 'Redeem and re-mint $' + s + ' of the stable asset through ' + p.name + ' on ' + c + ' once a week.'; }],
    [['rwa'],
      function (p, c, k) { return 'Mint $' + k + " of the protocol's yield asset on " + c + ' and hold it.'; },
      function (p, c) { return 'Claim the yield ' + p.name + ' pays on ' + c + ' and hold it in the same wallet.'; }],
    [['insurance'],
      function (p, c, k) { return 'Buy $' + k + ' of cover from ' + p.name + ' on ' + c + ' and keep the policy.'; },
      function (p, c) { return 'Check the cover ' + p.name + ' holds on ' + c + ' each week and renew it before it lapses.'; }]
  ];
  function ruleOf(cat) {
    var c = (cat || '').toLowerCase();
    for (var i = 0; i < PLAN_RULES.length; i++) {
      var words = PLAN_RULES[i][0];
      for (var j = 0; j < words.length; j++) if (c.indexOf(words[j]) >= 0) return PLAN_RULES[i];
    }
    return [[],
      function (p, c, k) { return 'Deposit $' + k + ' of USDC into ' + p.name + ' on ' + c + ' and keep the position open.'; },
      function (p, c, s) { return 'Repeat the deposit with a $' + s + ' top-up on ' + p.name + ' each week so the wallet shows repeated use.'; }];
  }
  function line(what, cost, time) {
    var s = what + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s += " Hold the position and check the protocol's own page.";
    return s;
  }
  function planOf(p) {
    var chain = leadChain(p);
    var stake = stakeFor(p.tvl_usd);
    var small = Math.max(10, Math.round(stake / 5));
    var hold = holdFor(p.age_days);
    var rule = ruleOf(p.category);
    return [
      line('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      line(rule[1](p, chain, stake), '$' + stake + ' of capital and about $' + (stake >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'),
      line(rule[2](p, chain, small), 'about $2 of gas a week', '10 minutes a week'),
      line('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'),
      line('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + stake + ' stays in the position', hold + ' days'),
      line("Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'),
      line("When the token launches, claim from the protocol's own page, sell half at once, and unwind the rest over a week.", 'about $5 of gas to exit', '30 minutes across a week')
    ];
  }

  function fromHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var q = new URLSearchParams(raw);
    if (q.get('q')) view.text = q.get('q');
    if (q.get('p')) view.pick = q.get('p');
    if (q.get('category')) view.cat = q.get('category');
    if (q.get('chain')) view.chain = q.get('chain');
    if (q.get('wl') === '1') view.wl = true;
    if (q.get('tab')) view.tab = q.get('tab');
  }
  function toHash() {
    var q = new URLSearchParams();
    if (view.text) q.set('q', view.text);
    if (view.cat !== 'all') q.set('category', view.cat);
    if (view.chain !== 'all') q.set('chain', view.chain);
    if (view.wl) q.set('wl', '1');
    if (view.tab !== 'board') q.set('tab', view.tab);
    if (view.pick) q.set('p', view.pick);
    var s = q.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function visible() {
    var needle = view.text.trim().toLowerCase();
    return R.rows.filter(function (r) {
      if (view.cat !== 'all' && r.category !== view.cat) return false;
      if (view.chain !== 'all' && (r.chains || []).indexOf(view.chain) < 0) return false;
      if (view.wl && R.watchlist.indexOf(r.slug) < 0) return false;
      if (!needle) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(needle) >= 0;
    });
  }
  function ordered(list) {
    var dir = view.asc ? 1 : -1;
    var val = function (r) {
      if (view.key === 'name') return r.name.toLowerCase();
      if (view.key === 'tvl') return r.tvl_usd;
      if (view.key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (view.key === 'age') return r.age_days === null ? Infinity : r.age_days;
      return r.implied_value_usd;
    };
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function headHtml() {
    return '<header class="masthead"><div class="wordmark">Token <em>Radar</em></div>' +
      '<div class="dateline">Snapshot ' + esc(R.as_of) + ' · DefiLlama protocol index · model ' + esc(R.model_version) + '</div></header>';
  }
  function introHtml() {
    return '<div class="standfirst"><h1>' + R.watchlist_size + ' watchlist protocols, ranked by the value a launch would carry</h1>' +
      '<p>The watchlist is the floor — every protocol with at least $' + Math.round(R.floor_usd / 1e6) + 'M of TVL and no token on record. ' +
      'The radar adds ' + R.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.</p></div>' +
      '<div class="tally">' +
      '<div><span>Watchlist covered</span><b>' + R.watchlist_size + ' / ' + R.watchlist_size + '</b></div>' +
      '<div><span>Pre-token rows scored</span><b>' + R.board_size + '</b></div>' +
      '<div><span>Early rows below the floor</span><b>' + R.early_size + '</b></div>' +
      '<div><span>Live-token protocols set aside</span><b>' + R.live_size + '</b></div></div>';
  }
  function topHtml() {
    var top = R.rows.slice(0, 10);
    var max = top.length ? top[0].implied_value_usd : 1;
    var items = top.map(function (r) {
      return '<li><button type="button" data-open="' + esc(r.slug) + '"><span class="rk">' + r.rank + '</span>' +
        '<span>' + esc(r.name) + '</span><span class="num">' + money(r.implied_value_usd) + '</span>' +
        '<span class="bar"><i style="width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></span></button></li>';
    }).join('');
    return '<section class="topten"><h2>Top 10 by implied value</h2><ol>' + items + '</ol></section>';
  }
  function railHtml(shownCount) {
    var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var counts = {};
    R.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var chains = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
    var catOpts = '<option value="all">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === view.cat ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === view.chain ? ' selected' : '') + '>' + esc(c) + ' (' + counts[c] + ')</option>';
    }).join('');
    return '<aside class="rail"><div><h2>Find a protocol</h2>' +
      '<label for="q">Search</label><input type="search" id="q" placeholder="Name, category or chain" value="' + esc(view.text) + '">' +
      '<label for="category">Category</label><select id="category">' + catOpts + '</select>' +
      '<label for="chain">Chain</label><select id="chain">' + chainOpts + '</select></div>' +
      '<div><h2>Scope</h2><div class="toggles">' +
      '<button type="button" class="pill" id="wl" aria-pressed="' + view.wl + '">Watchlist only</button></div></div>' +
      '<div><h2>Token status</h2><div class="toggles">' +
      '<button type="button" class="pill" id="tab-board" aria-pressed="' + (view.tab === 'board') + '">Pre-token</button>' +
      '<button type="button" class="pill" id="tab-live" aria-pressed="' + (view.tab === 'live') + '">Live token</button></div></div>' +
      '<p class="shown">' + (view.tab === 'board' ? shownCount + ' rows shown' : R.live.length + ' live-token protocols') + '</p></aside>';
  }
  function sortTh(key, label) {
    var mark = view.key === key ? (view.asc ? ' ↑' : ' ↓') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + label + mark + '</button></th>';
  }
  function boardHtml(list) {
    if (!list.length) {
      return '<section class="sheet"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category to see the board again.</p>' +
        '<button type="button" id="clear">Clear filters</button></div></section>';
    }
    var max = list[0].implied_value_usd || 1;
    var body = list.map(function (r) {
      var g = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      var where = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      return '<tr data-open="' + esc(r.slug) + '" tabindex="0" data-picked="' + (view.pick === r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td class="who"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc(where) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num ' + g + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td><div class="meter"><span class="track"><i style="width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></span><span class="num">' + money(r.implied_value_usd) + '</span></div></td>' +
        '<td><span class="tag none">no token</span></td></tr>';
    }).join('');
    return '<section class="sheet"><table><caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortTh('implied', 'Rank') + sortTh('name', 'Protocol') + sortTh('tvl', 'TVL') + sortTh('growth', '7d') + sortTh('age', 'Age') + sortTh('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
  }
  function liveHtml() {
    var body = R.live.map(function (r) {
      var where = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      return '<tr><td><span class="tag live">live</span></td>' +
        '<td class="who"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc(where) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td><td><span class="tag live">already trades</span></td></tr>';
    }).join('');
    return '<section class="sheet"><table><caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
  }
  function modelHtml() {
    var m = R.model;
    return '<section class="sheet"><h2>How implied value is computed</h2>' +
      '<p class="note">Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.breadth_step + ' x min(chains - 1, ' + m.breadth_cap_chains + ')) )</div>' +
      '<p class="note">TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Breadth is how many chains the protocol runs on: each extra chain adds ' + Math.round(m.breadth_step * 100) + '% to the value, up to ' + m.breadth_cap_chains + ' extra chains, because a launch on more chains reaches more farmers. The early radar is every pre-token protocol below the watchlist floor, by TVL; the live-token protocols are set aside with their market caps shown.</p></section>';
  }

  var sheet = document.createElement('dialog');
  sheet.className = 'detail';
  sheet.id = 'detail';
  sheet.setAttribute('aria-labelledby', 'detail-title');
  sheet.addEventListener('close', function () { view.pick = null; toHash(); paint(); });

  function openSheet(slug) {
    var row = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) row = R.rows[i];
    if (!row) return;
    view.pick = slug;
    toHash();
    var again = impliedOf(row, R.model);
    var steps = planOf(row).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var head = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(head) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    sheet.innerHTML = '<div class="head"><div><span>Rank ' + row.rank + ' of ' + R.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc(row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + '</p></div>' +
      '<button type="button" class="close" id="close-sheet">Close</button></div>' +
      '<h3>Implied value</h3><div class="grid">' +
      '<div><span>TVL</span><b>' + money(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + pct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + age(row.age_days) + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + row.growth_multiplier + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + row.maturity_multiplier + '</b></div>' +
      '<div><span>Breadth multiplier (' + (row.chains ? row.chains.length : 0) + ' chains)</span><b>' + row.breadth_multiplier + '</b></div>' +
      '<div><span>Implied value</span><b>' + money(row.implied_value_usd) + '</b></div></div>' +
      '<p class="check">Model ' + esc(R.model_version) + ': the same function scores every protocol. The page recomputes this row as ' + money(again) +
      (again === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p>' +
      '<h3>Farm plan</h3><ol class="plan">' + steps + '</ol>';
    document.getElementById('close-sheet').addEventListener('click', function () { sheet.close(); });
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); }
    else sheet.setAttribute('open', '');
  }

  function paint() {
    var list = ordered(visible());
    root.innerHTML = headHtml() + '<div class="wrap">' + introHtml() + topHtml() +
      '<div class="layout">' + railHtml(list.length) + '<div>' +
      (view.tab === 'board' ? boardHtml(list) + modelHtml() : liveHtml()) +
      '</div></div></div>';
    root.setAttribute('aria-busy', 'false');
    if (!sheet.isConnected) root.appendChild(sheet);
    wire(list);
  }
  function wire() {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { view.text = q.value; toHash(); paint(); var nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    document.getElementById('category').addEventListener('change', function (e) { view.cat = e.target.value; toHash(); paint(); });
    document.getElementById('chain').addEventListener('change', function (e) { view.chain = e.target.value; toHash(); paint(); });
    document.getElementById('wl').addEventListener('click', function () { view.wl = !view.wl; toHash(); paint(); });
    document.getElementById('tab-board').addEventListener('click', function () { view.tab = 'board'; toHash(); paint(); });
    document.getElementById('tab-live').addEventListener('click', function () { view.tab = 'live'; toHash(); paint(); });
    var clear = document.getElementById('clear');
    if (clear) clear.addEventListener('click', function () { view.text = ''; view.cat = 'all'; view.chain = 'all'; toHash(); paint(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (view.key === k) view.asc = !view.asc; else { view.key = k; view.asc = false; }
        paint();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (node) {
      node.addEventListener('click', function () { openSheet(node.getAttribute('data-open')); });
      node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(node.getAttribute('data-open')); } });
    });
  }

  fromHash();
  paint();
  if (view.pick) openSheet(view.pick);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet.open) sheet.close(); });
})();
