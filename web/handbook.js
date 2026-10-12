// In-game Handbook — the player manual. Numbers that live in the simulation (costs, sizes,
// unlocks) are read from the wasm exports at render time so the manual can't drift from the game.
// Everything else here mirrors rules in src/lib.rs; update both together.

export function buildPages(api) {
  const { w, K, money, platform, achievements } = api;
  const cost = k => money(w.kind_cost(k));
  const width = k => `${w.kind_width(k)} cells`;
  const stars = k => '★'.repeat(w.kind_star(k));
  const mod = platform.mac ? '⌘' : 'Ctrl';
  const kv = rows => `<table class="hb-kv">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
  const tbl = (head, rows) => `<table class="hb-tbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const tip = s => `<div class="hb-note tip">${s}</div>`;
  const warn = s => `<div class="hb-note warn">${s}</div>`;
  const pic = id => `<div class="hb-pic" data-thumb="${id}"></div>`;
  const link = (id, text) => `<a data-page="${id}">${text}</a>`;
  const k = (...ks) => ks.map(x => `<kbd>${x}</kbd>`).join(' ');
  const pad = s => `<kbd class="pad">${s}</kbd>`;

  const room = (id, kind, intro, facts, body) => ({
    id, group: 'Rooms & Shops', title: { lobby: 'Lobby', office: 'Office', condo: 'Condo', hotel: 'Hotel Room', cafe: 'Café', shop: 'Shop', parking: 'Parking' }[id],
    html: () => `${pic(id)}<p class="hb-lead">${intro}</p>${kv([['Cost', cost(kind)], ['Size', width(kind)], ['Unlocks at', stars(kind)], ...facts])}${body}`,
  });

  return [
    // ------------------------------------------------------------------ basics
    { id: 'welcome', group: 'Basics', title: 'Welcome', html: () => `
      <p class="hb-lead">Highrise is a tower-building sim. You start with <b>$2,000,000</b> and an empty lot.
      Build rooms, connect them with stairs and elevators, and keep the people who live and work there happy.
      A bigger, happier tower earns more money and more <b>stars</b>, and stars unlock taller floors and new room types.</p>
      <h3>Where to go next</h3>
      <ul>
        <li>${link('first-tower', 'Your first tower')}: a step-by-step start.</li>
        <li>${link('controls', 'Controls')}: keyboard, mouse, gamepad and Steam Deck.</li>
        <li>${link('satisfaction', 'Satisfaction')}: why tenants leave and how to stop it.</li>
        <li>${link('stars', 'Star ratings')}: what each star unlocks.</li>
      </ul>
      ${tip(`Open this Handbook any time with ${k('F1')}, the book button in the toolbar, or <b>Handbook</b> in the pause menu.`)}` },

    { id: 'first-tower', group: 'Basics', title: 'Your first tower', html: () => `
      <ol class="hb-steps">
        <li><b>Lay a lobby.</b> Pick <b>Lobby</b> ${k('2')} and drag along the ground floor (1F). Everyone enters and leaves
          through a lobby, so nothing works without one. A long lobby gives you room for several elevators.</li>
        <li><b>Add offices.</b> Pick <b>Office</b> ${k('3')} and drag across 2F. Rooms must sit on something solid,
          so build upward floor by floor.</li>
        <li><b>Connect the floors.</b> Use <b>Stairs</b> ${k('9')} for one floor, or an <b>Elevator</b> ${k('0')}: press on the
          lobby and drag up to the top floor you want it to serve.</li>
        <li><b>Let time run.</b> Empty offices are leased during the day (6:00 AM–8:00 PM) if they can be reached from the lobby.
          Workers arrive on weekday mornings, and rent comes in at midnight.</li>
        <li><b>Watch the commute.</b> When people turn pink or red, their trips are too slow. Add elevator cars ${k('-')} or
          more shafts before tenants give up and leave.</li>
        <li><b>Grow.</b> At 300 population you reach ${'★'.repeat(2)}, which unlocks hotels, shops, parking and floors up to 20F.</li>
      </ol>
      ${tip('Short on ideas? Load the sample tower from the browser build with <code>#demo</code>, or just watch the title-screen tower.')}` },

    { id: 'controls', group: 'Basics', title: 'Controls', html: () => `
      <h3>Mouse &amp; keyboard</h3>
      ${tbl(['Action', 'Input'], [
        ['Build / paint a row', `${k('Click')} or ${k('Drag')}`],
        ['Place an elevator', `${k('Drag')} up or down`],
        ['Pan', `${k('Right-drag')} · ${k('Space')}+${k('Drag')} · ${k('W')}${k('A')}${k('S')}${k('D')} / arrows`],
        ['Zoom', `${k('Scroll')} · pinch · status bar ${k('−')} ${k('+')}`],
        ['Recenter on tower', k('C')],
        ['Pick a tool', `${k('1')}–${k('0')} ${k('-')} ${k('X')}`],
        ['Pause / resume', k('P')],
        ['Evaluation overlay', k('E')],
        ['Mute', k('M')],
        ['Save', platform.mac ? k('⌘', 'S') : k('Ctrl', 'S')],
        ['Handbook', `${k('F1')} · ${k('H')}`],
        ['Menu / back', k('Esc')],
        ...(platform.native ? [['Full screen', platform.mac ? k('⌃', '⌘', 'F') : k('F11')]] : []),
      ])}
      <h3>Gamepad &amp; Steam Deck</h3>
      <p>Plug in any controller (Xbox, PlayStation, Switch Pro and Steam Deck all work). A cursor appears as soon as you
      touch a stick, and moving the mouse hides it again.</p>
      ${tbl(['Action', 'Button'], [
        ['Move cursor', pad('Left stick')],
        ['Pan the view', pad('Right stick')],
        ['Zoom out / in', `${pad('LT')} / ${pad('RT')}`],
        ['Click · hold to drag (paint rows, size elevators)', pad('A')],
        ['Back / cancel tool / menu', pad('B')],
        ['Demolish tool', pad('X')],
        ['Pause / resume', pad('Y')],
        ['Previous / next tool', `${pad('LB')} / ${pad('RB')}`],
        ['Build category', `${pad('D-pad ←')} ${pad('→')}`],
        ['Game speed', `${pad('D-pad ↑')} ${pad('↓')}`],
        ['Evaluation overlay', pad('View / Select')],
        ['Pause menu', pad('Menu / Start')],
        ['Recenter', pad('L3')],
        ['Handbook', pad('R3')],
      ])}
      <p>In menus the D-pad jumps between buttons and ${pad('A')} selects. On a slider, ${pad('D-pad ←')} ${pad('→')} changes the value.
      In this Handbook, ${pad('LB')} / ${pad('RB')} turn pages and the ${pad('Right stick')} scrolls.</p>
      ${tip('On Steam Deck, the touchscreen works too: tap to build, and use the Inspect tool to drag the view.')}` },

    { id: 'interface', group: 'Basics', title: 'The screen', html: () => `
      <h3>Toolbar (top)</h3>
      <ul>
        <li><b>Funds, population, stars</b>: your money, how many people call the tower home, and your rating.</li>
        <li><b>Clock</b>: the in-game time and day of the week. Weekdays and weekends behave differently.</li>
        <li><b>Speed</b>: pause, 1×, 3×, 10× or 30×.</li>
        <li><b>Yesterday</b>: green is income and red is expenses from the last full day.</li>
        <li><b>Buttons</b>: evaluation overlay, notifications, mute, Handbook and menu.</li>
      </ul>
      <h3>Build panel (left)</h3>
      <p>Three tabs (<b>Rooms</b>, <b>Shops</b> and <b>Transit</b>) plus Inspect and Demolish. Hover a card for details. Cards
      turn red when you can't afford them, and locked cards show the star rating they need. The bar at the bottom tracks
      progress to the next star. Collapse the panel with the arrow at the top.</p>
      <h3>Status bar (bottom)</h3>
      <p>Shows what the current tool does, why a placement is blocked (in red), which floor and column the cursor is over, and the zoom level.</p>
      <h3>Inspector</h3>
      <p>With <b>Inspect</b> ${k('1')}, or with the evaluation overlay on, hover any room to see its status, occupants and
      satisfaction. Hover an elevator to see its floors, cars and how many people are waiting.</p>` },

    // ------------------------------------------------------------------ rooms
    room('lobby', K.LOBBY, 'The front door. Every trip into or out of the tower starts or ends at a ground-floor lobby.',
      [['Where', 'Ground floor (1F) only'], ['Upkeep', '$50 / day per section']],
      `<p>Drag sideways to lay a long lobby in one go. Stairs and elevators can be built <i>on top of</i> lobby sections, so a
      wide lobby is where you'll hang your main elevator banks.</p>
      ${tip('Basements hang down from the lobby: anything on B1 needs the ground floor above it filled in first.')}`),

    room('office', K.OFFICE, 'Leased by a company that sends 6 workers in every weekday. This is your main source of steady income.',
      [['Where', 'Above ground'], ['Rent', '$3,000 / day while leased'], ['Workers', '6']],
      `<h3>A worker's day</h3>
      ${tbl(['Time', 'What happens'], [['7:30–9:00 AM', 'Arrive through the lobby'], ['11:30 AM–1:00 PM', 'About half go out for lunch at a café or shop, if you have one'], ['5:00–6:30 PM', 'Head home']])}
      <p>Workers stay home on weekends. Empty offices lease out during the day as long as they can be reached from the lobby.</p>
      ${warn('An office moves out at midnight if its satisfaction falls below <b>25%</b>.')}`),

    room('condo', K.CONDO, 'Sold outright to a family of 3. You get a big one-time payment, then a small daily fee.',
      [['Where', 'Above ground'], ['Sale', '$150,000 once'], ['HOA fee', '$150 / day'], ['Residents', '3']],
      `<p>Residents come and go all day. On weekdays most leave in the morning and return in the evening, and some eat
      out at night. Because they're home so much, they make a lot of elevator trips.</p>
      ${warn('A condo is vacated at midnight if its satisfaction falls below <b>18%</b>. Then it goes back on the market, and a new sale earns the $150,000 again.')}`),

    room('hotel', K.HOTEL, 'Rents nightly to pairs of guests. The happier they are, the more they pay.',
      [['Where', 'Above ground'], ['Per night', '$900 + up to $600 by satisfaction'], ['Guests', '2']],
      `${tbl(['Time', 'What happens'], [['4:00–10:00 PM', 'Guests check in to vacant rooms'], ['Morning', 'Guests check out and pay'], ['3:00 PM', 'Rooms are cleaned and ready again']])}
      <p>Hotel rooms never move out, but a slow commute costs you up to $600 a night per room.</p>`),

    room('cafe', K.CAFE, 'Feeds office workers at lunch, residents in the evening and walk-in visitors from the street.',
      [['Where', 'Any floor'], ['Per customer', '$25'], ['Upkeep', '$500 / day'], ['Seats', '16']],
      `<p>Visitors walk in from the street between 10:00 AM and 9:00 PM. The more people live in your tower, the more
      visitors you get. Hover a café with Inspect to see how many customers it had yesterday.</p>
      ${tip('A café on a lower floor near the lobby catches street visitors without loading up your elevators.')}`),

    room('shop', K.SHOP, 'Retail that pulls visitors in from the street and serves your own tenants too.',
      [['Where', 'Any floor'], ['Per customer', '$45'], ['Upkeep', '$500 / day'], ['Capacity', '10']],
      `<p>Shops and cafés share the same customers, who pick one with free space at random. A shop pays more per visit
      but holds fewer people.</p>`),

    room('parking', K.PARKING, 'Underground parking. Required once your tower is big enough to have commuters with cars.',
      [['Where', 'Basement only'], ['Income', '$400 / day']],
      `<p>From ${'★'.repeat(3)} on, tenants expect <b>1 parking lot for every 10 occupied offices and condos</b>. If you're
      short, every tenant loses satisfaction each night and you'll get a warning.</p>
      ${tip('Your basement depth grows with your rating. See ' + link('stars', 'Star ratings') + '.')}`),

    // ------------------------------------------------------------------ transit
    { id: 'stairs', group: 'Transit', title: 'Stairs', html: () => `${pic('stairs')}
      <p class="hb-lead">Cheap and always available, but slow. Each flight links one floor to the floor above it.</p>
      ${kv([['Cost', cost(K.STAIRS)], ['Size', width(K.STAIRS)], ['Upkeep', 'None']])}
      <p>People will happily take stairs for a floor or two, but long climbs add up and hurt satisfaction.
      Stairs can be built on top of the lobby.</p>` },

    { id: 'elevators', group: 'Transit', title: 'Elevators', html: () => `${pic('elevator')}
      <p class="hb-lead">The backbone of any real tower. A shaft serves every floor it spans, and its cars pick up and drop off
      people in both directions.</p>
      ${kv([['Shaft', cost(K.ELEVATOR) + ' + $5,000 per floor'], ['Span', '2–31 floors'], ['Cars', `1 to start, up to 6 (${money(w.car_cost())} each)`], ['Car capacity', '16 people'], ['Upkeep', '$300 / car / day']])}
      <h3>Building</h3>
      <ul>
        <li>Press where the shaft should start and <b>drag up or down</b> to its other end. The ghost shows the floors and price.</li>
        <li><b>Extend</b> a shaft by dragging from it again. You pay only for the new floors.</li>
        <li>Use <b>Elevator Car</b> ${k('-')} and click a shaft to add a car.</li>
        <li>Shafts can go into the basement, too.</li>
      </ul>
      <h3>Why 31 floors is the limit</h3>
      <p>Tall towers need <b>transfer floors</b>. Run one shaft from 1F to 30F, start a second shaft on 30F (or anywhere the
      two overlap), and continue up. People work out the route and change elevators on their own, and they'll mix in stairs too.</p>
      ${tip('Waiting more than 10 minutes annoys people, and more than 20 makes them angry. Hover a shaft to see its queue. If it keeps growing, add cars before you add floors.')}` },

    // ------------------------------------------------------------------ systems
    { id: 'people', group: 'How it works', title: 'People', html: () => `
      ${tbl(['Who', 'From', 'Pays', 'Daily pattern'], [
        ['<b>Office workers</b>', 'Offices (6)', 'Rent, lunch', 'Weekday commute, lunch break'],
        ['<b>Residents</b>', 'Condos (3)', 'Sale, HOA, dinner', 'Out in the day on weekdays, home at night'],
        ['<b>Hotel guests</b>', 'Hotel rooms (2)', 'Nightly rate', 'Arrive in the evening, leave in the morning'],
        ['<b>Visitors</b>', 'The street', 'Café / shop', 'Drop in 10 AM–9 PM'],
      ])}
      <p>Everyone walks, waits, rides and climbs for real. A <span style="color:#ff7ab6">pink</span> bubble over someone's head means their
      trip has taken over 30 minutes. <span style="color:#ff2a2a">Red</span> means over 50, and they're losing patience with your tower
      (see ${link('satisfaction', 'Satisfaction')}).</p>
      <p><b>Population</b> counts people who belong to the tower: workers in leased offices, residents in sold condos and guests in booked rooms. Visitors don't count.</p>` },

    { id: 'satisfaction', group: 'How it works', title: 'Satisfaction', html: () => `
      <p class="hb-lead">Every office, condo and hotel room has a satisfaction score from 0–100%. New tenants start at 65%.</p>
      <h3>What changes it</h3>
      ${tbl(['Event', 'Effect'], [
        ['Trip under 15 minutes', '<span class="good">+0.6</span>'],
        ['Trip 15–30 minutes', 'no change'],
        ['Trip 30–50 minutes', '<span class="bad">−2</span>'],
        ['Trip over 50 minutes', '<span class="bad">−5</span>'],
        ['Waited 10–20 min for an elevator', '<span class="bad">−0.5</span>'],
        ['Waited over 20 min for an elevator', '<span class="bad">−2</span>'],
        ['Couldn\'t reach their destination at all', '<span class="bad">−3</span>'],
        ['Each midnight', '<span class="good">+3</span>'],
        ['Each midnight while short on parking (3★+)', '<span class="bad">−4</span>'],
      ])}
      <h3>Moving out</h3>
      <p>At midnight, offices below <b>25%</b> and condos below <b>18%</b> move out. Hotel rooms don't leave, but they pay less.</p>
      ${tip(`Press ${k('E')} for the <b>evaluation overlay</b>: <span style="color:#5ec2ff">blue</span> is happy,
        <span style="color:#ffd166">yellow</span> needs attention, and <span style="color:#ff6b6b">red</span> is about to leave or can't be reached.`)}` },

    { id: 'money', group: 'How it works', title: 'Money', html: () => `
      <p class="hb-lead">Most income and all upkeep are settled at <b>midnight</b>. Sales and per-visit income arrive instantly
      and pop up over the room.</p>
      <h3>Income</h3>
      ${tbl(['Source', 'Amount', 'When'], [
        ['Office rent', '$3,000 / day', 'Midnight'],
        ['Condo sale', '$150,000', 'When sold'],
        ['Condo HOA', '$150 / day', 'Midnight'],
        ['Hotel room', '$900–$1,500', 'At checkout'],
        ['Café customer', '$25', 'Per visit'],
        ['Shop customer', '$45', 'Per visit'],
        ['Parking lot', '$400 / day', 'Midnight'],
      ])}
      <h3>Expenses</h3>
      ${tbl(['Cost', 'Amount'], [['Lobby section', '$50 / day'], ['Café or shop', '$500 / day'], ['Elevator car', '$300 / day']])}
      <p>Your funds can go negative. You can't build anything until you're back in the black, but the tower keeps running.</p>
      ${tip('Demolishing never refunds anything, so plan your floors before you buy.')}` },

    { id: 'stars', group: 'How it works', title: 'Star ratings', html: () => `
      <p class="hb-lead">Your rating depends only on <b>population</b>. Ratings never go down once earned.</p>
      ${tbl(['Rating', 'Population', 'Max height', 'Deepest basement', 'Unlocks'], [
        ['★', '0', '10F', 'B2', 'Lobby, offices, condos, cafés, transit'],
        ['★★', '300', '20F', 'B3', 'Hotel rooms, shops, parking'],
        ['★★★', '1,000', '35F', 'B4', 'Tenants start wanting parking'],
        ['★★★★', '2,500', '50F', 'B5', ''],
        ['★★★★★', '5,000', '60F', 'B6', 'Landmark tower'],
      ])}
      ${tip('Offices count 6 people each. That makes them the quickest way to population, but they also put the most strain on your elevators.')}` },

    { id: 'achievements', group: 'How it works', title: 'Achievements', html: () => `
      <p>Achievements also unlock on Steam when you play the Steam version.</p>
      <div class="hb-ach">${achievements().map(a => `<div class="${a.done ? 'done' : ''}"><b>${a.done ? '🏆' : '🔒'} ${a.name}</b><span>${a.desc}</span></div>`).join('')}</div>` },

    // ------------------------------------------------------------------ help
    { id: 'troubleshooting', group: 'Help', title: 'Troubleshooting', html: () => `
      <h3>"Why can't I build here?"</h3>
      ${tbl(['Message', 'Fix'], [
        ['Needs support', 'Rooms need something solid below them, or above them in the basement. Fill in the floor first.'],
        ["Can't build that on this floor", 'Lobbies go on 1F, parking in basements, and offices, condos and hotels above ground.'],
        ['Too tall for your star rating', 'Grow your population to raise the height limit.'],
        ['That space is occupied', 'Something is already there. Demolish it first, or shift over a column.'],
        ['Something is built on top of this', 'Demolish from the top down.'],
        ['Elevators must span 2–31 floors', 'Drag over at least two floors. For taller towers, use a sky lobby.'],
      ])}
      <h3>"My rooms sit empty"</h3>
      <p>Tenants only move into rooms they can reach from a ground-floor lobby. Hover the room with Inspect: <span class="bad">⚠ Can't be
      reached from the lobby</span> means you need stairs or an elevator to that floor.</p>
      <h3>"Tenants keep leaving"</h3>
      <p>Turn on the evaluation overlay ${k('E')} and look for red. The cause is almost always slow trips, so add cars, add a
      second shaft, or put cafés closer to the offices. At 3★, check your parking.</p>` },

    { id: 'saves', group: 'Help', title: 'Saving', html: () => `
      <p>The game saves automatically every in-game day, every minute of real time, and when you quit. Save
      by hand with ${platform.mac ? k('⌘', 'S') : k('Ctrl', 'S')} or from the pause menu. There's one save slot, and
      <b>New Tower</b> replaces it after asking you to confirm.</p>
      ${tbl(['Platform', 'Save file'], [
        ['macOS', '<code>~/Library/Application Support/Highrise/save.json</code>'],
        ['Windows', '<code>%APPDATA%\\Highrise\\save.json</code>'],
        ['Linux / Steam Deck', '<code>~/.config/Highrise/save.json</code>'],
        ['Browser', 'Your browser\'s local storage for this site'],
      ])}
      <p>With Steam Cloud, your tower follows you between your Mac, PC and Steam Deck.</p>` },
  ];
}
