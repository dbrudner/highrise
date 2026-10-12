# Highrise Player Guide

<!-- Generated from web/handbook.js by tools/export-handbook.mjs. Edit the Handbook, not this file. -->

This is the same Handbook that's built into the game (press **F1**, or **R3** on a controller).

- **Basics**
  - [Welcome](#welcome)
  - [Your first tower](#your-first-tower)
  - [Controls](#controls)
  - [The screen](#the-screen)
- **Rooms & Shops**
  - [Lobby](#lobby)
  - [Office](#office)
  - [Condo](#condo)
  - [Hotel Room](#hotel-room)
  - [Café](#café)
  - [Shop](#shop)
  - [Parking](#parking)
- **Transit**
  - [Stairs](#stairs)
  - [Elevators](#elevators)
- **How it works**
  - [People](#people)
  - [Satisfaction](#satisfaction)
  - [Money](#money)
  - [Star ratings](#star-ratings)
  - [Achievements](#achievements)
- **Help**
  - [Troubleshooting](#troubleshooting)
  - [Saving](#saving)

## Basics

### Welcome

Highrise is a tower-building sim. You start with **$2,000,000** and an empty lot. Build rooms, connect them with stairs and elevators, and keep the people who live and work there happy. A bigger, happier tower earns more money and more **stars**, and stars unlock taller floors and new room types.

#### Where to go next

- [Your first tower](#your-first-tower): a step-by-step start.
- [Controls](#controls): keyboard, mouse, gamepad and Steam Deck.
- [Satisfaction](#satisfaction): why tenants leave and how to stop it.
- [Star ratings](#star-ratings): what each star unlocks.

> 💡 Open this Handbook any time with `F1`, the book button in the toolbar, or **Handbook** in the pause menu.

### Your first tower

1. **Lay a lobby.** Pick **Lobby** `2` and drag along the ground floor (1F). Everyone enters and leaves through a lobby, so nothing works without one. A long lobby gives you room for several elevators.
2. **Add offices.** Pick **Office** `3` and drag across 2F. Rooms must sit on something solid, so build upward floor by floor.
3. **Connect the floors.** Use **Stairs** `9` for one floor, or an **Elevator** `0`: press on the lobby and drag up to the top floor you want it to serve.
4. **Let time run.** Empty offices are leased during the day (6:00 AM–8:00 PM) if they can be reached from the lobby. Workers arrive on weekday mornings, and rent comes in at midnight.
5. **Watch the commute.** When people turn pink or red, their trips are too slow. Add elevator cars `-` or more shafts before tenants give up and leave.
6. **Grow.** At 300 population you reach ★★, which unlocks hotels, shops, parking and floors up to 20F.

> 💡 Short on ideas? Load the sample tower from the browser build with `#demo`, or just watch the title-screen tower.

### Controls

#### Mouse & keyboard

| Action | Input |
| --- | --- |
| Build / paint a row | `Click` or `Drag` |
| Place an elevator | `Drag` up or down |
| Pan | `Right-drag` · `Space`+`Drag` · `W``A``S``D` / arrows |
| Zoom | `Scroll` · pinch · status bar `−` `+` |
| Recenter on tower | `C` |
| Pick a tool | `1`–`0` `-` `X` |
| Pause / resume | `P` |
| Evaluation overlay | `E` |
| Mute | `M` |
| Save | `Ctrl` `S` (`⌘` `S` on Mac) |
| Handbook | `F1` · `H` |
| Menu / back | `Esc` |
| Full screen | `F11` (`⌃` `⌘` `F` on Mac) |

#### Gamepad & Steam Deck

Plug in any controller (Xbox, PlayStation, Switch Pro and Steam Deck all work). A cursor appears as soon as you touch a stick, and moving the mouse hides it again.

| Action | Button |
| --- | --- |
| Move cursor | `Left stick` |
| Pan the view | `Right stick` |
| Zoom out / in | `LT` / `RT` |
| Click · hold to drag (paint rows, size elevators) | `A` |
| Back / cancel tool / menu | `B` |
| Demolish tool | `X` |
| Pause / resume | `Y` |
| Previous / next tool | `LB` / `RB` |
| Build category | `D-pad ←` `→` |
| Game speed | `D-pad ↑` `↓` |
| Evaluation overlay | `View / Select` |
| Pause menu | `Menu / Start` |
| Recenter | `L3` |
| Handbook | `R3` |

In menus the D-pad jumps between buttons and `A` selects. On a slider, `D-pad ←` `→` changes the value. In this Handbook, `LB` / `RB` turn pages and the `Right stick` scrolls.

> 💡 On Steam Deck, the touchscreen works too: tap to build, and use the Inspect tool to drag the view.

### The screen

#### Toolbar (top)

- **Funds, population, stars**: your money, how many people call the tower home, and your rating.
- **Clock**: the in-game time and day of the week. Weekdays and weekends behave differently.
- **Speed**: pause, 1×, 3×, 10× or 30×.
- **Yesterday**: green is income and red is expenses from the last full day.
- **Buttons**: evaluation overlay, notifications, mute, Handbook and menu.

#### Build panel (left)

Three tabs (**Rooms**, **Shops** and **Transit**) plus Inspect and Demolish. Hover a card for details. Cards turn red when you can't afford them, and locked cards show the star rating they need. The bar at the bottom tracks progress to the next star. Collapse the panel with the arrow at the top.

#### Status bar (bottom)

Shows what the current tool does, why a placement is blocked (in red), which floor and column the cursor is over, and the zoom level.

#### Inspector

With **Inspect** `1`, or with the evaluation overlay on, hover any room to see its status, occupants and satisfaction. Hover an elevator to see its floors, cars and how many people are waiting.

## Rooms & Shops

### Lobby

The front door. Every trip into or out of the tower starts or ends at a ground-floor lobby.

- **Cost:** $5,000
- **Size:** 4 cells
- **Unlocks at:** ★
- **Where:** Ground floor (1F) only
- **Upkeep:** $50 / day per section

Drag sideways to lay a long lobby in one go. Stairs and elevators can be built *on top of* lobby sections, so a wide lobby is where you'll hang your main elevator banks.

> 💡 Basements hang down from the lobby: anything on B1 needs the ground floor above it filled in first.

### Office

Leased by a company that sends 6 workers in every weekday. This is your main source of steady income.

- **Cost:** $40,000
- **Size:** 8 cells
- **Unlocks at:** ★
- **Where:** Above ground
- **Rent:** $3,000 / day while leased
- **Workers:** 6

#### A worker's day

| Time | What happens |
| --- | --- |
| 7:30–9:00 AM | Arrive through the lobby |
| 11:30 AM–1:00 PM | About half go out for lunch at a café or shop, if you have one |
| 5:00–6:30 PM | Head home |

Workers stay home on weekends. Empty offices lease out during the day as long as they can be reached from the lobby.

> ⚠️ An office moves out at midnight if its satisfaction falls below **25%**.

### Condo

Sold outright to a family of 3. You get a big one-time payment, then a small daily fee.

- **Cost:** $90,000
- **Size:** 12 cells
- **Unlocks at:** ★
- **Where:** Above ground
- **Sale:** $150,000 once
- **HOA fee:** $150 / day
- **Residents:** 3

Residents come and go all day. On weekdays most leave in the morning and return in the evening, and some eat out at night. Because they're home so much, they make a lot of elevator trips.

> ⚠️ A condo is vacated at midnight if its satisfaction falls below **18%**. Then it goes back on the market, and a new sale earns the $150,000 again.

### Hotel Room

Rents nightly to pairs of guests. The happier they are, the more they pay.

- **Cost:** $20,000
- **Size:** 5 cells
- **Unlocks at:** ★★
- **Where:** Above ground
- **Per night:** $900 + up to $600 by satisfaction
- **Guests:** 2

| Time | What happens |
| --- | --- |
| 4:00–10:00 PM | Guests check in to vacant rooms |
| Morning | Guests check out and pay |
| 3:00 PM | Rooms are cleaned and ready again |

Hotel rooms never move out, but a slow commute costs you up to $600 a night per room.

### Café

Feeds office workers at lunch, residents in the evening and walk-in visitors from the street.

- **Cost:** $120,000
- **Size:** 12 cells
- **Unlocks at:** ★
- **Where:** Any floor
- **Per customer:** $25
- **Upkeep:** $500 / day
- **Seats:** 16

Visitors walk in from the street between 10:00 AM and 9:00 PM. The more people live in your tower, the more visitors you get. Hover a café with Inspect to see how many customers it had yesterday.

> 💡 A café on a lower floor near the lobby catches street visitors without loading up your elevators.

### Shop

Retail that pulls visitors in from the street and serves your own tenants too.

- **Cost:** $70,000
- **Size:** 8 cells
- **Unlocks at:** ★★
- **Where:** Any floor
- **Per customer:** $45
- **Upkeep:** $500 / day
- **Capacity:** 10

Shops and cafés share the same customers, who pick one with free space at random. A shop pays more per visit but holds fewer people.

### Parking

Underground parking. Required once your tower is big enough to have commuters with cars.

- **Cost:** $25,000
- **Size:** 10 cells
- **Unlocks at:** ★★
- **Where:** Basement only
- **Income:** $400 / day

From ★★★ on, tenants expect **1 parking lot for every 10 occupied offices and condos**. If you're short, every tenant loses satisfaction each night and you'll get a warning.

> 💡 Your basement depth grows with your rating. See [Star ratings](#star-ratings).

## Transit

### Stairs

Cheap and always available, but slow. Each flight links one floor to the floor above it.

- **Cost:** $5,000
- **Size:** 3 cells
- **Upkeep:** None

People will happily take stairs for a floor or two, but long climbs add up and hurt satisfaction. Stairs can be built on top of the lobby.

### Elevators

The backbone of any real tower. A shaft serves every floor it spans, and its cars pick up and drop off people in both directions.

- **Shaft:** $60,000 + $5,000 per floor
- **Span:** 2–31 floors
- **Cars:** 1 to start, up to 6 ($25,000 each)
- **Car capacity:** 16 people
- **Upkeep:** $300 / car / day

#### Building

- Press where the shaft should start and **drag up or down** to its other end. The ghost shows the floors and price.
- **Extend** a shaft by dragging from it again. You pay only for the new floors.
- Use **Elevator Car** `-` and click a shaft to add a car.
- Shafts can go into the basement, too.

#### Why 31 floors is the limit

Tall towers need **transfer floors**. Run one shaft from 1F to 30F, start a second shaft on 30F (or anywhere the two overlap), and continue up. People work out the route and change elevators on their own, and they'll mix in stairs too.

> 💡 Waiting more than 10 minutes annoys people, and more than 20 makes them angry. Hover a shaft to see its queue. If it keeps growing, add cars before you add floors.

## How it works

### People

| Who | From | Pays | Daily pattern |
| --- | --- | --- | --- |
| **Office workers** | Offices (6) | Rent, lunch | Weekday commute, lunch break |
| **Residents** | Condos (3) | Sale, HOA, dinner | Out in the day on weekdays, home at night |
| **Hotel guests** | Hotel rooms (2) | Nightly rate | Arrive in the evening, leave in the morning |
| **Visitors** | The street | Café / shop | Drop in 10 AM–9 PM |

Everyone walks, waits, rides and climbs for real. A pink bubble over someone's head means their trip has taken over 30 minutes. Red means over 50, and they're losing patience with your tower (see [Satisfaction](#satisfaction)).

**Population** counts people who belong to the tower: workers in leased offices, residents in sold condos and guests in booked rooms. Visitors don't count.

### Satisfaction

Every office, condo and hotel room has a satisfaction score from 0–100%. New tenants start at 65%.

#### What changes it

| Event | Effect |
| --- | --- |
| Trip under 15 minutes | +0.6 |
| Trip 15–30 minutes | no change |
| Trip 30–50 minutes | −2 |
| Trip over 50 minutes | −5 |
| Waited 10–20 min for an elevator | −0.5 |
| Waited over 20 min for an elevator | −2 |
| Couldn't reach their destination at all | −3 |
| Each midnight | +3 |
| Each midnight while short on parking (3★+) | −4 |

#### Moving out

At midnight, offices below **25%** and condos below **18%** move out. Hotel rooms don't leave, but they pay less.

> 💡 Press `E` for the **evaluation overlay**: blue is happy, yellow needs attention, and red is about to leave or can't be reached.

### Money

Most income and all upkeep are settled at **midnight**. Sales and per-visit income arrive instantly and pop up over the room.

#### Income

| Source | Amount | When |
| --- | --- | --- |
| Office rent | $3,000 / day | Midnight |
| Condo sale | $150,000 | When sold |
| Condo HOA | $150 / day | Midnight |
| Hotel room | $900–$1,500 | At checkout |
| Café customer | $25 | Per visit |
| Shop customer | $45 | Per visit |
| Parking lot | $400 / day | Midnight |

#### Expenses

| Cost | Amount |
| --- | --- |
| Lobby section | $50 / day |
| Café or shop | $500 / day |
| Elevator car | $300 / day |

Your funds can go negative. You can't build anything until you're back in the black, but the tower keeps running.

> 💡 Demolishing never refunds anything, so plan your floors before you buy.

### Star ratings

Your rating depends only on **population**. Ratings never go down once earned.

| Rating | Population | Max height | Deepest basement | Unlocks |
| --- | --- | --- | --- | --- |
| ★ | 0 | 10F | B2 | Lobby, offices, condos, cafés, transit |
| ★★ | 300 | 20F | B3 | Hotel rooms, shops, parking |
| ★★★ | 1,000 | 35F | B4 | Tenants start wanting parking |
| ★★★★ | 2,500 | 50F | B5 |  |
| ★★★★★ | 5,000 | 60F | B6 | Landmark tower |

> 💡 Offices count 6 people each. That makes them the quickest way to population, but they also put the most strain on your elevators.

### Achievements

Achievements also unlock on Steam when you play the Steam version.

- **Grand Opening**: Build your first lobby.
- **Going Up**: Build an elevator.
- **Open for Business**: Welcome your first tenant.
- **Rising Star**: Reach a 2★ rating.
- **Three-Star Address**: Reach a 3★ rating.
- **Skyline Fixture**: Reach a 4★ rating.
- **Landmark**: Reach a 5★ rating.
- **Food Court**: Run 5 cafés at once.
- **Tycoon**: Have $10,000,000 in the bank.

## Help

### Troubleshooting

#### "Why can't I build here?"

| Message | Fix |
| --- | --- |
| Needs support | Rooms need something solid below them, or above them in the basement. Fill in the floor first. |
| Can't build that on this floor | Lobbies go on 1F, parking in basements, and offices, condos and hotels above ground. |
| Too tall for your star rating | Grow your population to raise the height limit. |
| That space is occupied | Something is already there. Demolish it first, or shift over a column. |
| Something is built on top of this | Demolish from the top down. |
| Elevators must span 2–31 floors | Drag over at least two floors. For taller towers, use a sky lobby. |

#### "My rooms sit empty"

Tenants only move into rooms they can reach from a ground-floor lobby. Hover the room with Inspect: ⚠ Can't be reached from the lobby means you need stairs or an elevator to that floor.

#### "Tenants keep leaving"

Turn on the evaluation overlay `E` and look for red. The cause is almost always slow trips, so add cars, add a second shaft, or put cafés closer to the offices. At 3★, check your parking.

### Saving

The game saves automatically every in-game day, every minute of real time, and when you quit. Save by hand with `Ctrl` `S` (`⌘` `S` on Mac) or from the pause menu. There's one save slot, and **New Tower** replaces it after asking you to confirm.

| Platform | Save file |
| --- | --- |
| macOS | `~/Library/Application Support/Highrise/save.json` |
| Windows | `%APPDATA%\Highrise\save.json` |
| Linux / Steam Deck | `~/.config/Highrise/save.json` |
| Browser | Your browser's local storage for this site |

With Steam Cloud, your tower follows you between your Mac, PC and Steam Deck.

