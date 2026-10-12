//! Highrise — a small SimTower-style tower simulation compiled to WebAssembly.
//!
//! The simulation is fully owned by Rust; JavaScript drives it through a flat
//! C ABI (`step`, `place`, `bulldoze`, ...) and reads render data straight out
//! of linear memory via `prepare_render` + `buf_ptr`/`buf_len`.

#![allow(static_mut_refs)]
#![allow(clippy::all)]

use std::collections::VecDeque;

// ---------------------------------------------------------------- constants

const W: i32 = 120; // cells across
const MIN_F: i32 = -6; // deepest basement
const MAX_F: i32 = 60; // tallest floor
const NF: usize = (MAX_F - MIN_F + 1) as usize;

const TPM: u64 = 20; // ticks per game minute
const DAY: u64 = 1440 * TPM;

const LOBBY: i32 = 1;
const OFFICE: i32 = 2;
const CONDO: i32 = 3;
const HOTEL: i32 = 4;
const CAFE: i32 = 5;
const SHOP: i32 = 6;
const PARKING: i32 = 7;
const ELEVATOR: i32 = 10;
const STAIRS: i32 = 11;

const S_OUT: i32 = 0;
const S_ROOM: i32 = 1;
const S_WALK: i32 = 2;
const S_WAIT: i32 = 3;
const S_RIDE: i32 = 4;
const S_STAIRS: i32 = 5;

const K_WORKER: i32 = 0;
const K_RES: i32 = 1;
const K_GUEST: i32 = 2;
const K_VISITOR: i32 = 3;

const WALK_SPEED: f32 = 0.25; // cells per tick
const CAR_SPEED: f32 = 0.15; // floors per tick
const DOOR_TICKS: i32 = 12;
const CAR_CAP: usize = 16;
const STAIR_TICKS: u64 = 40;
const MAX_CARS: usize = 6;
const MAX_SPAN: i32 = 31;
const ELEV_FLOOR_COST: i64 = 5_000;
const CAR_COST: i64 = 25_000;
const NO_TARGET: i32 = i32::MIN;

const STAR_POP: [i32; 5] = [0, 300, 1000, 2500, 5000];

// error / result codes shared with JS
const OK: i32 = 0;
const E_MONEY: i32 = 1;
const E_OCCUPIED: i32 = 2;
const E_SUPPORT: i32 = 3;
const E_FLOOR: i32 = 4;
const E_BOUNDS: i32 = 5;
const E_LOCKED: i32 = 6;
const E_SPAN: i32 = 7;
const E_NOTHING: i32 = 8;
const E_DEPENDS: i32 = 9;
const E_INVALID: i32 = 10;
const E_NOCHANGE: i32 = 11;
const E_MAXCARS: i32 = 12;
const E_NOTELEV: i32 = 13;
const E_HEIGHT: i32 = 14;

fn kind_w(k: i32) -> i32 {
    match k {
        LOBBY => 4,
        OFFICE => 8,
        CONDO => 12,
        HOTEL => 5,
        CAFE => 12,
        SHOP => 8,
        PARKING => 10,
        ELEVATOR | STAIRS => 3,
        _ => 0,
    }
}

fn kind_price(k: i32) -> i64 {
    match k {
        LOBBY => 5_000,
        OFFICE => 40_000,
        CONDO => 90_000,
        HOTEL => 20_000,
        CAFE => 120_000,
        SHOP => 70_000,
        PARKING => 25_000,
        ELEVATOR => 60_000,
        STAIRS => 5_000,
        _ => 0,
    }
}

fn kind_req_star(k: i32) -> i32 {
    match k {
        HOTEL | SHOP | PARKING => 2,
        _ => 1,
    }
}

fn kind_cap(k: i32) -> i32 {
    match k {
        OFFICE => 6,
        CONDO => 3,
        HOTEL => 2,
        CAFE => 16,
        SHOP => 10,
        _ => 0,
    }
}

fn is_commercial(k: i32) -> bool {
    k == CAFE || k == SHOP
}

fn gi(x: i32, f: i32) -> usize {
    ((f - MIN_F) * W + x) as usize
}

fn fi(f: i32) -> usize {
    (f - MIN_F) as usize
}

// ---------------------------------------------------------------- entities

#[derive(Clone, Default)]
struct Room {
    kind: i32, // 0 = demolished slot
    x: i32,
    f: i32,
    w: i32,
    occ: i32, // 0 vacant, 1 occupied/open, 2 hotel needs cleaning
    sat: f32, // 0..100
    inside: i32,
    flag: i32, // 1 = unreachable from lobby
    visits: i32,
    last_visits: i32,
}

#[derive(Clone)]
struct Car {
    y: f32,
    dir: i32,
    door: i32,
    pass: Vec<usize>,
    target: i32,
}

impl Car {
    fn new(y: i32) -> Car {
        Car { y: y as f32, dir: 0, door: 0, pass: Vec::new(), target: NO_TARGET }
    }
}

struct Trans {
    kind: i32,
    x: i32,
    lo: i32,
    hi: i32,
    alive: bool,
    cars: Vec<Car>,
    queue: Vec<Vec<usize>>, // elevator only: waiting people per floor (index f - lo)
}

impl Trans {
    fn center(&self) -> f32 {
        self.x as f32 + 1.5
    }
    fn serves(&self, f: i32) -> bool {
        self.alive && f >= self.lo && f <= self.hi
    }
}

#[derive(Clone, Default)]
struct Person {
    alive: bool,
    kind: i32,
    home: i32,
    state: i32,
    cur_room: i32,
    floor: i32,
    x: f32,
    tx: f32,
    goal_f: i32,
    goal_x: f32,
    goal_room: i32,
    hop_t: i32,
    hop_exit: i32,
    timer: u64,
    trip: u32,
    wait: u32,
    flag: u32,
    out_return: u64,
}

// ---------------------------------------------------------------- game

struct Game {
    rooms: Vec<Room>,
    trans: Vec<Trans>,
    people: Vec<Person>,
    free: Vec<usize>,
    grid: Vec<i32>,  // room layer: room idx+1
    tgrid: Vec<i32>, // transport layer: -(trans idx+1); may overlap lobby tiles
    money: i64,
    now: u64,
    rng: u64,
    stars: i32,
    pop: i32,
    lobbies: Vec<usize>,
    commercial: Vec<usize>,
    inc_today: i64,
    exp_today: i64,
    last_inc: i64,
    last_exp: i64,
    msgs: String,
    out: Vec<u8>,
    popups: Vec<f32>,
    // render buffers
    rr: Vec<i32>,
    rp: Vec<f32>,
    rt: Vec<i32>,
    rc: Vec<f32>,
    rpop: Vec<f32>,
    save: Vec<i32>,
    quote: i64,
}

impl Game {
    fn new(seed: u64) -> Game {
        Game {
            rooms: Vec::new(),
            trans: Vec::new(),
            people: Vec::new(),
            free: Vec::new(),
            grid: vec![0; W as usize * NF],
            tgrid: vec![0; W as usize * NF],
            money: 2_000_000,
            now: 6 * 60 * TPM,
            rng: seed | 1,
            stars: 1,
            pop: 0,
            lobbies: Vec::new(),
            commercial: Vec::new(),
            inc_today: 0,
            exp_today: 0,
            last_inc: 0,
            last_exp: 0,
            msgs: String::new(),
            out: Vec::new(),
            popups: Vec::new(),
            rr: Vec::new(),
            rp: Vec::new(),
            rt: Vec::new(),
            rc: Vec::new(),
            rpop: Vec::new(),
            save: Vec::new(),
            quote: 0,
        }
    }

    // ------------------------------------------------------------ utilities

    fn rnd(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng = x;
        (x.wrapping_mul(0x2545F4914F6CDD1D) >> 32) as u32
    }
    fn rf(&mut self) -> f32 {
        (self.rnd() >> 8) as f32 / 16_777_216.0
    }
    fn ri(&mut self, n: u64) -> u64 {
        if n == 0 { 0 } else { self.rnd() as u64 % n }
    }

    fn msg(&mut self, s: &str) {
        self.msgs.push_str(s);
        self.msgs.push('\n');
    }

    fn earn(&mut self, amount: i64, x: f32, f: i32) {
        self.money += amount;
        if amount >= 0 { self.inc_today += amount } else { self.exp_today -= amount }
        if self.popups.len() < 600 {
            self.popups.extend_from_slice(&[x, f as f32, amount as f32]);
        }
    }

    fn tod(&self) -> u64 { self.now % DAY }
    fn minute(&self) -> u64 { self.tod() / TPM }
    fn day_start(&self) -> u64 { self.now - self.tod() }
    fn weekday(&self) -> bool { (self.now / DAY) % 7 < 5 }
    fn at_today(&self, min: u64) -> u64 { self.day_start() + min * TPM }
    fn at_tomorrow(&self, min: u64) -> u64 { self.day_start() + DAY + min * TPM }
    fn today_r(&mut self, min: u64, range: u64) -> u64 { let r = self.ri(range); self.at_today(min + r) }
    fn tomorrow_r(&mut self, min: u64, range: u64) -> u64 { let r = self.ri(range); self.at_tomorrow(min + r) }

    fn rcell(&self, x: i32, f: i32) -> i32 {
        if x < 0 || x >= W || f < MIN_F || f > MAX_F { 0 } else { self.grid[gi(x, f)] }
    }
    fn tcell(&self, x: i32, f: i32) -> i32 {
        if x < 0 || x >= W || f < MIN_F || f > MAX_F { 0 } else { self.tgrid[gi(x, f)] }
    }
    /// Topmost thing at a cell: transport first, then room.
    fn cell(&self, x: i32, f: i32) -> i32 {
        let t = self.tcell(x, f);
        if t != 0 { t } else { self.rcell(x, f) }
    }
    /// Occupied by anything other than `own`.
    fn solid(&self, x: i32, f: i32, own: i32) -> bool {
        let (r, t) = (self.rcell(x, f), self.tcell(x, f));
        (r != 0 && r != own) || (t != 0 && t != own)
    }
    fn is_lobby_cell(&self, x: i32, f: i32) -> bool {
        let r = self.rcell(x, f);
        r > 0 && self.rooms[(r - 1) as usize].kind == LOBBY
    }

    fn max_floor(&self) -> i32 {
        [10, 20, 35, 50, 60][(self.stars.clamp(1, 5) - 1) as usize]
    }
    fn min_floor(&self) -> i32 {
        -((self.stars + 1).min(6))
    }

    fn supported(&self, x: i32, w: i32, f: i32, own: i32) -> bool {
        let sf = if f > 0 { f - 1 } else if f < 0 { f + 1 } else { return true };
        (x..x + w).all(|cx| self.solid(cx, sf, own))
    }

    fn reindex(&mut self) {
        self.lobbies.clear();
        self.commercial.clear();
        for (i, r) in self.rooms.iter().enumerate() {
            if r.kind == LOBBY && r.f == 0 { self.lobbies.push(i) }
            if is_commercial(r.kind) { self.commercial.push(i) }
        }
    }

    fn recompute(&mut self) {
        let mut pop = 0;
        for r in &self.rooms {
            if r.occ == 1 && matches!(r.kind, OFFICE | CONDO | HOTEL) { pop += kind_cap(r.kind) }
        }
        self.pop = pop;
        let mut s = 1;
        for (i, &t) in STAR_POP.iter().enumerate() {
            if pop >= t { s = i as i32 + 1 }
        }
        if s > self.stars {
            self.stars = s;
            let unlock = match s {
                2 => "Hotels, shops & parking unlocked. Max height 20F.",
                3 => "Max height 35F, deeper basements.",
                4 => "Max height 50F.",
                _ => "Max height 60F. You've built a landmark!",
            };
            let m = format!("★ Tower upgraded to {} stars! {}", s, unlock);
            self.msg(&m);
        }
    }

    fn lobby_x(&mut self) -> Option<f32> {
        if self.lobbies.is_empty() { return None }
        let n = self.lobbies.len() as u64;
        let k = self.ri(n) as usize;
        let r = self.lobbies[k];
        let (x, w) = (self.rooms[r].x, self.rooms[r].w);
        Some(x as f32 + 0.5 + self.rf() * (w as f32 - 1.0))
    }

    fn find_food(&mut self) -> Option<usize> {
        if self.commercial.is_empty() { return None }
        for _ in 0..4 {
            let n = self.commercial.len() as u64;
            let k = self.ri(n) as usize;
        let r = self.commercial[k];
            if self.rooms[r].inside < kind_cap(self.rooms[r].kind) { return Some(r) }
        }
        None
    }

    // ------------------------------------------------------------ routing

    /// BFS over floors. Returns the first hop (transport index, floor to exit at).
    fn route(&self, from_f: i32, from_x: f32, to_f: i32) -> Option<(usize, i32)> {
        if from_f == to_f || from_f < MIN_F || from_f > MAX_F || to_f < MIN_F || to_f > MAX_F {
            return None;
        }
        let mut first = [(-1i32, 0i32); NF];
        let mut seen = [false; NF];
        let mut q = VecDeque::new();
        seen[fi(from_f)] = true;
        q.push_back(from_f);
        let mut order: Vec<usize> = Vec::new();
        while let Some(f) = q.pop_front() {
            order.clear();
            for (ti, t) in self.trans.iter().enumerate() {
                if t.serves(f) { order.push(ti) }
            }
            if f == from_f {
                order.sort_by(|a, b| {
                    let da = (self.trans[*a].center() - from_x).abs();
                    let db = (self.trans[*b].center() - from_x).abs();
                    da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                });
            }
            for &ti in &order {
                let t = &self.trans[ti];
                for g in t.lo..=t.hi {
                    if g == f || seen[fi(g)] { continue }
                    seen[fi(g)] = true;
                    first[fi(g)] = if f == from_f { (ti as i32, g) } else { first[fi(f)] };
                    if g == to_f {
                        let (a, b) = first[fi(g)];
                        return Some((a as usize, b));
                    }
                    q.push_back(g);
                }
            }
        }
        None
    }

    fn reachable(&self, f: i32) -> bool {
        if self.lobbies.is_empty() { return false }
        f == 0 || self.route(0, 0.0, f).is_some()
    }

    // ------------------------------------------------------------ people

    fn spawn(&mut self, kind: i32, home: i32) -> usize {
        let p = Person {
            alive: true,
            kind,
            home,
            state: S_OUT,
            cur_room: -1,
            goal_room: -1,
            hop_t: -1,
            timer: self.now,
            ..Default::default()
        };
        if let Some(i) = self.free.pop() {
            self.people[i] = p;
            i
        } else {
            self.people.push(p);
            self.people.len() - 1
        }
    }

    /// Remove the person from any queue / car / room bookkeeping.
    fn detach(&mut self, i: usize) {
        let (st, t, f, cur) = {
            let p = &self.people[i];
            (p.state, p.hop_t, p.floor, p.cur_room)
        };
        match st {
            S_WAIT if t >= 0 => {
                let tr = &mut self.trans[t as usize];
                if f >= tr.lo && f <= tr.hi {
                    tr.queue[(f - tr.lo) as usize].retain(|&x| x != i);
                }
            }
            S_RIDE if t >= 0 => {
                for c in self.trans[t as usize].cars.iter_mut() {
                    c.pass.retain(|&x| x != i);
                }
            }
            S_ROOM if cur >= 0 => {
                let r = &mut self.rooms[cur as usize];
                r.inside = (r.inside - 1).max(0);
            }
            _ => {}
        }
        let p = &mut self.people[i];
        p.cur_room = -1;
        p.state = S_WALK;
    }

    fn kill(&mut self, i: usize) {
        if !self.people[i].alive { return }
        self.detach(i);
        let p = &mut self.people[i];
        p.alive = false;
        p.state = S_OUT;
        self.free.push(i);
    }

    fn adjust_sat(&mut self, r: i32, d: f32) {
        if r >= 0 {
            let room = &mut self.rooms[r as usize];
            if room.kind != 0 { room.sat = (room.sat + d).clamp(0.0, 100.0) }
        }
    }

    fn fail(&mut self, i: usize) {
        let (kind, home) = (self.people[i].kind, self.people[i].home);
        self.adjust_sat(home, -3.0);
        if home >= 0 { self.rooms[home as usize].flag |= 1 }
        if kind == K_GUEST || kind == K_VISITOR {
            self.kill(i);
            return;
        }
        self.detach(i);
        let t = if kind == K_WORKER { self.tomorrow_r(450, 90) } else { self.now + 120 * TPM };
        let p = &mut self.people[i];
        p.state = S_OUT;
        p.hop_t = -1;
        p.floor = 0;
        p.timer = t;
    }

    fn set_goal(&mut self, i: usize, room: i32) {
        let (gf, gx) = if room >= 0 {
            let (f, x, w) = { let r = &self.rooms[room as usize]; (r.f, r.x, r.w) };
            (f, x as f32 + 0.5 + self.rf() * (w as f32 - 1.0))
        } else {
            let px = self.people[i].x;
            (0, self.lobby_x().unwrap_or(px))
        };
        let p = &mut self.people[i];
        p.goal_f = gf;
        p.goal_x = gx;
        p.goal_room = room;
    }

    /// Plan the next leg from the current floor. Returns false if unreachable.
    fn replan(&mut self, i: usize) -> bool {
        let (f, x, gf, gx) = {
            let p = &self.people[i];
            (p.floor, p.x, p.goal_f, p.goal_x)
        };
        if f == gf {
            let p = &mut self.people[i];
            p.hop_t = -1;
            p.tx = gx;
            p.state = S_WALK;
            return true;
        }
        match self.route(f, x, gf) {
            Some((t, e)) => {
                let c = self.trans[t].center();
                let p = &mut self.people[i];
                p.hop_t = t as i32;
                p.hop_exit = e;
                p.tx = c;
                p.state = S_WALK;
                true
            }
            None => false,
        }
    }

    /// Begin a trip from wherever the person is to `room` (-1 = leave the building).
    fn start_trip(&mut self, i: usize, room: i32) -> bool {
        let st = self.people[i].state;
        if st == S_ROOM {
            self.detach(i);
        }
        if st == S_OUT {
            match self.lobby_x() {
                Some(x) => {
                    let p = &mut self.people[i];
                    p.floor = 0;
                    p.x = x;
                }
                None => {
                    self.fail(i);
                    return false;
                }
            }
        }
        self.set_goal(i, room);
        self.people[i].trip = 0;
        if !self.replan(i) {
            self.fail(i);
            return false;
        }
        true
    }

    fn set_timer(&mut self, i: usize, t: u64) {
        self.people[i].timer = t;
    }

    fn pay_visit(&mut self, r: usize) {
        let (k, x, w, f) = { let rm = &self.rooms[r]; (rm.kind, rm.x, rm.w, rm.f) };
        let price = match k { CAFE => 25, SHOP => 45, _ => 0 };
        self.rooms[r].visits += 1;
        if price > 0 { self.earn(price, x as f32 + w as f32 / 2.0, f) }
    }

    fn decide(&mut self, i: usize) {
        let m = self.minute();
        let (kind, home, cur, flag) = {
            let p = &self.people[i];
            (p.kind, p.home, p.cur_room, p.flag)
        };
        if cur >= 0 && cur != home {
            // finishing a visit at a café / shop
            self.pay_visit(cur as usize);
            let next = if kind == K_VISITOR { -1 } else { home };
            self.start_trip(i, next);
            return;
        }
        let wd = self.weekday();
        match kind {
            K_WORKER => {
                if cur < 0 {
                    if wd && m >= 420 && m < 660 {
                        self.start_trip(i, home);
                    } else if wd && m < 420 {
                        let t = self.today_r(450, 90);
                        self.set_timer(i, t);
                    } else {
                        let t = self.tomorrow_r(450, 90);
                        self.set_timer(i, t);
                    }
                } else if m < 690 {
                    let t = self.today_r(690, 90);
                    self.set_timer(i, t);
                } else if m < 840 && flag & 1 == 0 {
                    self.people[i].flag |= 1;
                    if self.rf() < 0.5 {
                        if let Some(r) = self.find_food() {
                            self.start_trip(i, r as i32);
                            return;
                        }
                    }
                    let t = self.today_r(1020, 90);
                    self.set_timer(i, t);
                } else if m < 1020 {
                    let t = self.today_r(1020, 90);
                    self.set_timer(i, t);
                } else {
                    self.people[i].flag &= !1;
                    self.start_trip(i, -1);
                }
            }
            K_RES => {
                if cur < 0 {
                    self.start_trip(i, home);
                } else if m < 420 {
                    let t = self.today_r(420, 150);
                    self.set_timer(i, t);
                } else if m < 600 {
                    self.people[i].flag &= !1;
                    let roll = self.rf();
                    if wd && roll < 0.7 {
                        self.people[i].out_return = self.today_r(1020, 180);
                        self.start_trip(i, -1);
                    } else if !wd && roll < 0.4 {
                        self.people[i].out_return = self.now + (120 + self.ri(240)) * TPM;
                        self.start_trip(i, -1);
                    } else {
                        let t = self.today_r(1080, 150);
                        self.set_timer(i, t);
                    }
                } else if m < 1080 {
                    let t = self.today_r(1080, 150);
                    self.set_timer(i, t);
                } else if m < 1320 && flag & 1 == 0 {
                    self.people[i].flag |= 1;
                    if self.rf() < 0.35 {
                        if let Some(r) = self.find_food() {
                            self.start_trip(i, r as i32);
                            return;
                        }
                    }
                    let t = self.tomorrow_r(420, 150);
                    self.set_timer(i, t);
                } else {
                    let t = self.tomorrow_r(420, 150);
                    self.set_timer(i, t);
                }
            }
            K_GUEST => {
                if cur < 0 {
                    self.start_trip(i, home);
                } else if m < 300 {
                    let t = self.today_r(420, 180);
                    self.set_timer(i, t);
                } else if m < 720 {
                    let h = home as usize;
                    if self.rooms[h].occ == 1 {
                        self.rooms[h].occ = 2;
                        let (x, w, f) = (self.rooms[h].x, self.rooms[h].w, self.rooms[h].f);
                        let bonus = (self.rooms[h].sat / 100.0 * 600.0) as i64;
                        self.earn(900 + bonus, x as f32 + w as f32 / 2.0, f);
                    }
                    self.start_trip(i, -1);
                } else if m < 1080 {
                    let t = self.today_r(1080, 120);
                    self.set_timer(i, t);
                } else if m < 1260 && flag & 1 == 0 {
                    self.people[i].flag |= 1;
                    if self.rf() < 0.3 {
                        if let Some(r) = self.find_food() {
                            self.start_trip(i, r as i32);
                            return;
                        }
                    }
                    let t = self.tomorrow_r(420, 180);
                    self.set_timer(i, t);
                } else {
                    let t = self.tomorrow_r(420, 180);
                    self.set_timer(i, t);
                }
            }
            _ => self.kill(i),
        }
    }

    fn trip_sat(trip: u32) -> f32 {
        let t = trip as u64;
        if t < 15 * TPM { 0.6 } else if t < 30 * TPM { 0.0 } else if t < 50 * TPM { -2.0 } else { -5.0 }
    }

    fn arrive_goal(&mut self, i: usize) {
        let (room, kind, home, trip) = {
            let p = &self.people[i];
            (p.goal_room, p.kind, p.home, p.trip)
        };
        let target = if kind == K_VISITOR { room } else { home };
        self.adjust_sat(target, Self::trip_sat(trip));
        if room >= 0 {
            if self.rooms[room as usize].kind == 0 {
                self.start_trip(i, -1);
                return;
            }
            self.rooms[room as usize].inside += 1;
            let t = if is_commercial(self.rooms[room as usize].kind) {
                self.now + (20 + self.ri(25)) * TPM
            } else {
                self.now
            };
            let p = &mut self.people[i];
            p.state = S_ROOM;
            p.cur_room = room;
            p.timer = t;
        } else {
            match kind {
                K_GUEST | K_VISITOR => self.kill(i),
                K_WORKER => {
                    let t = self.tomorrow_r(450, 90);
                    let p = &mut self.people[i];
                    p.state = S_OUT;
                    p.cur_room = -1;
                    p.timer = t;
                }
                _ => {
                    let t = self.people[i].out_return.max(self.now + 30 * TPM);
                    let p = &mut self.people[i];
                    p.state = S_OUT;
                    p.cur_room = -1;
                    p.timer = t;
                }
            }
        }
    }

    fn arrive_transport(&mut self, i: usize) {
        let t = self.people[i].hop_t as usize;
        let f = self.people[i].floor;
        if !self.trans[t].serves(f) {
            if !self.replan(i) { self.fail(i) }
            return;
        }
        if self.trans[t].kind == ELEVATOR {
            let lo = self.trans[t].lo;
            self.trans[t].queue[(f - lo) as usize].push(i);
            let p = &mut self.people[i];
            p.state = S_WAIT;
            p.wait = 0;
        } else {
            let now = self.now;
            let p = &mut self.people[i];
            p.state = S_STAIRS;
            p.timer = now + STAIR_TICKS;
        }
    }

    fn update_person(&mut self, i: usize) {
        if !self.people[i].alive { return }
        match self.people[i].state {
            S_OUT | S_ROOM => {
                if self.now >= self.people[i].timer { self.decide(i) }
            }
            S_WALK => {
                let p = &mut self.people[i];
                p.trip += 1;
                let d = p.tx - p.x;
                if d.abs() <= WALK_SPEED {
                    p.x = p.tx;
                    if p.hop_t >= 0 { self.arrive_transport(i) } else { self.arrive_goal(i) }
                } else {
                    p.x += WALK_SPEED * d.signum();
                }
            }
            S_WAIT => {
                let p = &mut self.people[i];
                p.trip += 1;
                p.wait += 1;
            }
            S_RIDE => self.people[i].trip += 1,
            S_STAIRS => {
                self.people[i].trip += 1;
                if self.now >= self.people[i].timer {
                    let p = &mut self.people[i];
                    p.floor = p.hop_exit;
                    p.hop_t = -1;
                    p.state = S_WALK;
                    if !self.replan(i) { self.fail(i) }
                }
            }
            _ => {}
        }
    }

    // ------------------------------------------------------------ elevators

    fn has_req(&self, ti: usize, ci: usize, fl: i32, d: i32) -> bool {
        let t = &self.trans[ti];
        let car = &t.cars[ci];
        if car.pass.iter().any(|&p| (self.people[p].hop_exit - fl).signum() == d) { return true }
        (t.lo..=t.hi).any(|g| (g - fl).signum() == d && !t.queue[(g - t.lo) as usize].is_empty())
    }

    fn choose_dir(&self, ti: usize, ci: usize, fl: i32) -> (i32, i32) {
        let t = &self.trans[ti];
        let dir = t.cars[ci].dir;
        if dir != 0 {
            if self.has_req(ti, ci, fl, dir) { return (dir, NO_TARGET) }
            if self.has_req(ti, ci, fl, -dir) { return (-dir, NO_TARGET) }
        }
        let k = (fl - t.lo) as usize;
        if let Some(&p) = t.queue[k].first() {
            return ((self.people[p].hop_exit - fl).signum(), NO_TARGET);
        }
        // idle: go to nearest waiting floor no other car is heading to
        let mut best: Option<i32> = None;
        for g in t.lo..=t.hi {
            if t.queue[(g - t.lo) as usize].is_empty() { continue }
            let claimed = t.cars.iter().enumerate().any(|(cj, c)| {
                cj != ci && (c.target == g || (c.dir != 0 && (g as f32 - c.y) * c.dir as f32 >= 0.0))
            });
            if claimed { continue }
            if best.map_or(true, |b| (g - fl).abs() < (b - fl).abs()) { best = Some(g) }
        }
        match best {
            Some(g) => ((g - fl).signum(), g),
            None => (0, NO_TARGET),
        }
    }

    fn next_stop(&self, ti: usize, ci: usize) -> i32 {
        let t = &self.trans[ti];
        let car = &t.cars[ci];
        let d = car.dir;
        let start = if d > 0 { (car.y + 0.001).ceil() as i32 } else { (car.y - 0.001).floor() as i32 };
        let full = car.pass.len() >= CAR_CAP;
        let mut far = None;
        let mut g = start;
        while g >= t.lo && g <= t.hi {
            let q = &t.queue[(g - t.lo) as usize];
            let exits = car.pass.iter().any(|&p| self.people[p].hop_exit == g);
            let same = !full && q.iter().any(|&p| (self.people[p].hop_exit - g).signum() == d);
            if exits || same || g == car.target { return g }
            if !q.is_empty() { far = Some(g) }
            g += d;
        }
        far.unwrap_or(start.clamp(t.lo, t.hi))
    }

    fn board(&mut self, pid: usize) {
        let (w, home, kind, goal) = {
            let p = &self.people[pid];
            (p.wait as u64, p.home, p.kind, p.goal_room)
        };
        let r = if kind == K_VISITOR { goal } else { home };
        if w > 20 * TPM { self.adjust_sat(r, -2.0) } else if w > 10 * TPM { self.adjust_sat(r, -0.5) }
        self.people[pid].state = S_RIDE;
    }

    fn update_car(&mut self, ti: usize, ci: usize) {
        let lo = self.trans[ti].lo;
        let center = self.trans[ti].center();
        {
            let car = &mut self.trans[ti].cars[ci];
            if car.door > 0 {
                car.door -= 1;
                return;
            }
        }
        let y = self.trans[ti].cars[ci].y;
        let fl = y.round() as i32;
        if (y - fl as f32).abs() < 0.001 {
            self.trans[ti].cars[ci].y = fl as f32;
            self.trans[ti].cars[ci].target = NO_TARGET;
            let mut changed = false;

            // unload
            let pass = std::mem::take(&mut self.trans[ti].cars[ci].pass);
            let mut out = Vec::new();
            let mut keep = Vec::with_capacity(pass.len());
            for pid in pass {
                if self.people[pid].hop_exit == fl { out.push(pid) } else { keep.push(pid) }
            }
            self.trans[ti].cars[ci].pass = keep;
            for pid in out {
                changed = true;
                {
                    let p = &mut self.people[pid];
                    p.floor = fl;
                    p.x = center;
                    p.hop_t = -1;
                    p.state = S_WALK;
                }
                if !self.replan(pid) { self.fail(pid) }
            }

            // load
            let k = (fl - lo) as usize;
            let mut dir = self.trans[ti].cars[ci].dir;
            let mut idx = 0;
            loop {
                if idx >= self.trans[ti].queue[k].len() || self.trans[ti].cars[ci].pass.len() >= CAR_CAP { break }
                let pid = self.trans[ti].queue[k][idx];
                let pd = (self.people[pid].hop_exit - fl).signum();
                if dir == 0 { dir = pd }
                if pd == dir && pd != 0 {
                    self.trans[ti].queue[k].remove(idx);
                    self.trans[ti].cars[ci].pass.push(pid);
                    self.board(pid);
                    changed = true;
                } else {
                    idx += 1;
                }
            }
            self.trans[ti].cars[ci].dir = dir;
            if changed {
                self.trans[ti].cars[ci].door = DOOR_TICKS;
                return;
            }

            let (nd, target) = self.choose_dir(ti, ci, fl);
            {
                let car = &mut self.trans[ti].cars[ci];
                car.dir = nd;
                car.target = target;
            }
            if nd == 0 { return }
            let room_left = self.trans[ti].cars[ci].pass.len() < CAR_CAP;
            let waiting_here = room_left && self.trans[ti].queue[k].iter().any(|&p| (self.people[p].hop_exit - fl).signum() == nd);
            if waiting_here { return }
        }

        if self.trans[ti].cars[ci].dir == 0 { return }
        let target = self.next_stop(ti, ci);
        let car = &mut self.trans[ti].cars[ci];
        let d = target as f32 - car.y;
        if d.abs() <= CAR_SPEED { car.y = target as f32 } else { car.y += CAR_SPEED * d.signum() }
    }

    // ------------------------------------------------------------ periodic events

    fn move_in(&mut self, r: usize) {
        let kind = self.rooms[r].kind;
        self.rooms[r].occ = 1;
        self.rooms[r].sat = 65.0;
        let (x, w, f) = (self.rooms[r].x, self.rooms[r].w, self.rooms[r].f);
        match kind {
            OFFICE => {
                for _ in 0..kind_cap(OFFICE) {
                    let i = self.spawn(K_WORKER, r as i32);
                    let t = if self.weekday() && self.minute() < 600 {
                        self.now + self.ri(60) * TPM
                    } else {
                        self.tomorrow_r(450, 90)
                    };
                    self.set_timer(i, t);
                }
            }
            CONDO => {
                self.earn(150_000, x as f32 + w as f32 / 2.0, f);
                for _ in 0..kind_cap(CONDO) {
                    let i = self.spawn(K_RES, r as i32);
                    let t = self.now + self.ri(60) * TPM;
                    self.set_timer(i, t);
                }
            }
            HOTEL => {
                for _ in 0..kind_cap(HOTEL) {
                    let i = self.spawn(K_GUEST, r as i32);
                    let t = self.now + self.ri(20) * TPM;
                    self.set_timer(i, t);
                }
            }
            _ => {}
        }
    }

    fn move_out(&mut self, r: usize) {
        for i in 0..self.people.len() {
            if self.people[i].alive && self.people[i].home == r as i32 { self.kill(i) }
        }
        let room = &mut self.rooms[r];
        room.occ = 0;
        room.sat = 60.0;
        room.inside = 0;
    }

    fn tenants(&mut self) {
        for r in 0..self.rooms.len() {
            let (k, occ, f) = (self.rooms[r].kind, self.rooms[r].occ, self.rooms[r].f);
            if !matches!(k, OFFICE | CONDO) || occ != 0 { continue }
            let ok = self.reachable(f);
            self.rooms[r].flag = if ok { 0 } else { 1 };
            if !ok { continue }
            let p = if k == OFFICE { 0.10 } else { 0.06 };
            if self.rf() < p {
                self.move_in(r);
                let floor = f + 1;
                let m = if k == OFFICE {
                    format!("New office tenant moved in on {}F.", floor)
                } else {
                    format!("Condo on {}F sold for $150,000!", floor)
                };
                self.msg(&m);
            }
        }
        self.recompute();
    }

    fn hotels(&mut self) {
        for r in 0..self.rooms.len() {
            if self.rooms[r].kind != HOTEL || self.rooms[r].occ != 0 { continue }
            let ok = self.reachable(self.rooms[r].f);
            self.rooms[r].flag = if ok { 0 } else { 1 };
            if ok && self.rf() < 0.08 { self.move_in(r) }
        }
    }

    fn daily(&mut self) {
        let mut inc = 0i64;
        let mut exp = 0i64;
        let mut parking = 0;
        let mut need = 0;
        for r in &self.rooms {
            match r.kind {
                OFFICE if r.occ == 1 => { inc += 3_000; need += 1 }
                CONDO if r.occ == 1 => { inc += 150; need += 1 }
                PARKING => { inc += 400; parking += 1 }
                CAFE | SHOP => exp += 500,
                LOBBY => exp += 50,
                _ => {}
            }
        }
        for t in &self.trans {
            if t.alive && t.kind == ELEVATOR { exp += 300 * t.cars.len() as i64 }
        }
        self.money += inc - exp;
        self.inc_today += inc;
        self.exp_today += exp;
        self.last_inc = self.inc_today;
        self.last_exp = self.exp_today;
        self.inc_today = 0;
        self.exp_today = 0;

        let parking_short = self.stars >= 3 && parking * 10 < need;
        if parking_short {
            self.msg("Tenants are complaining about a lack of parking (need 1 space per 10 tenants).");
        }

        let mut left = 0;
        for r in 0..self.rooms.len() {
            let k = self.rooms[r].kind;
            self.rooms[r].last_visits = self.rooms[r].visits;
            self.rooms[r].visits = 0;
            if !matches!(k, OFFICE | CONDO | HOTEL) || self.rooms[r].occ != 1 { continue }
            let room = &mut self.rooms[r];
            room.sat = (room.sat + 3.0 - if parking_short { 4.0 } else { 0.0 }).clamp(0.0, 100.0);
            let limit = if k == OFFICE { 25.0 } else { 18.0 };
            if k != HOTEL && room.sat < limit {
                self.move_out(r);
                left += 1;
            }
        }
        if left > 0 {
            let m = format!("{} tenant(s) moved out due to poor service. Check the evaluation view (E).", left);
            self.msg(&m);
        }
        let day = self.now / DAY;
        let m = format!("Day {} report: income ${}, expenses ${}.", day, self.last_inc, self.last_exp);
        self.msg(&m);
        self.recompute();
    }

    fn step(&mut self) {
        self.now += 1;
        let tod = self.tod();
        let m = tod / TPM;
        if tod == 0 { self.daily() }
        if tod % (30 * TPM) == 0 && m >= 360 && m < 1200 { self.tenants() }
        if tod % (10 * TPM) == 0 && m >= 960 && m < 1320 { self.hotels() }
        if tod == 900 * TPM {
            for r in self.rooms.iter_mut() {
                if r.kind == HOTEL && r.occ == 2 { r.occ = 0 }
            }
        }
        if m >= 600 && m < 1260 && !self.commercial.is_empty() && !self.lobbies.is_empty() {
            let rate = (self.pop as f32 * 0.15 + 15.0) / (60 * TPM) as f32;
            if self.rf() < rate {
                if let Some(r) = self.find_food() {
                    let i = self.spawn(K_VISITOR, r as i32);
                    self.start_trip(i, r as i32);
                }
            }
        }
        for ti in 0..self.trans.len() {
            if self.trans[ti].alive && self.trans[ti].kind == ELEVATOR {
                for ci in 0..self.trans[ti].cars.len() { self.update_car(ti, ci) }
            }
        }
        for i in 0..self.people.len() { self.update_person(i) }
    }

    // ------------------------------------------------------------ building

    fn check_room(&self, kind: i32, x: i32, f: i32) -> i32 {
        let w = kind_w(kind);
        if w == 0 || kind == ELEVATOR { return E_INVALID }
        if self.stars < kind_req_star(kind) { return E_LOCKED }
        if x < 0 || x + w > W { return E_BOUNDS }
        if f > self.max_floor() || f < self.min_floor() {
            return if f > 0 { E_HEIGHT } else { E_FLOOR };
        }
        if kind == STAIRS && f + 1 > self.max_floor() { return E_HEIGHT }
        let ok = match kind {
            LOBBY => f == 0,
            PARKING => f < 0,
            OFFICE | CONDO | HOTEL => f > 0,
            _ => true,
        };
        if !ok { return E_FLOOR }
        let blocked = |cx: i32| match kind {
            STAIRS => self.tcell(cx, f) != 0 || (self.rcell(cx, f) != 0 && !self.is_lobby_cell(cx, f)),
            LOBBY => self.rcell(cx, f) != 0,
            _ => self.cell(cx, f) != 0,
        };
        if (x..x + w).any(blocked) { return E_OCCUPIED }
        if !self.supported(x, w, f, 0) { return E_SUPPORT }
        if self.money < kind_price(kind) { return E_MONEY }
        OK
    }

    fn add_room_raw(&mut self, kind: i32, x: i32, f: i32) -> usize {
        let w = kind_w(kind);
        let room = Room {
            kind,
            x,
            f,
            w,
            occ: if matches!(kind, OFFICE | CONDO | HOTEL) { 0 } else { 1 },
            sat: 60.0,
            ..Default::default()
        };
        let r = match self.rooms.iter().position(|r| r.kind == 0) {
            Some(r) => { self.rooms[r] = room; r }
            None => { self.rooms.push(room); self.rooms.len() - 1 }
        };
        for cx in x..x + w { self.grid[gi(cx, f)] = r as i32 + 1 }
        r
    }

    fn add_trans_raw(&mut self, kind: i32, x: i32, lo: i32, hi: i32, ncars: usize) -> usize {
        let t = Trans {
            kind,
            x,
            lo,
            hi,
            alive: true,
            cars: if kind == ELEVATOR { (0..ncars.max(1)).map(|_| Car::new(lo.max(0).min(hi))).collect() } else { Vec::new() },
            queue: if kind == ELEVATOR { vec![Vec::new(); (hi - lo + 1) as usize] } else { Vec::new() },
        };
        let ti = match self.trans.iter().position(|t| !t.alive) {
            Some(ti) => { self.trans[ti] = t; ti }
            None => { self.trans.push(t); self.trans.len() - 1 }
        };
        let top = if kind == STAIRS { lo } else { hi };
        for f in lo..=top {
            for cx in x..x + 3 { self.tgrid[gi(cx, f)] = -(ti as i32 + 1) }
        }
        ti
    }

    fn place(&mut self, kind: i32, x: i32, f: i32, dry: bool) -> i32 {
        let c = self.check_room(kind, x, f);
        if c != OK || dry { return c }
        let cost = kind_price(kind);
        self.money -= cost;
        self.exp_today += cost;
        if kind == STAIRS {
            self.add_trans_raw(STAIRS, x, f, f + 1, 0);
        } else {
            self.add_room_raw(kind, x, f);
        }
        self.reindex();
        OK
    }

    fn place_elevator(&mut self, x: i32, f1: i32, f2: i32, dry: bool) -> i32 {
        let (lo, hi) = (f1.min(f2), f1.max(f2));
        if x < 0 || x + 3 > W { return E_BOUNDS }
        if hi > self.max_floor() { return E_HEIGHT }
        if lo < self.min_floor() { return E_FLOOR }
        let ext = self.trans.iter().position(|t| {
            t.alive && t.kind == ELEVATOR && t.x == x && t.lo <= hi + 1 && lo <= t.hi + 1
        });
        let (nlo, nhi) = match ext {
            Some(e) => (lo.min(self.trans[e].lo), hi.max(self.trans[e].hi)),
            None => (lo, hi),
        };
        if nhi - nlo < 1 || nhi - nlo + 1 > MAX_SPAN { return E_SPAN }
        let own = ext.map(|e| -(e as i32 + 1)).unwrap_or(i32::MIN);
        for f in nlo..=nhi {
            for cx in x..x + 3 {
                let t = self.tcell(cx, f);
                if (t != 0 && t != own) || (self.rcell(cx, f) != 0 && !self.is_lobby_cell(cx, f)) {
                    return E_OCCUPIED;
                }
            }
        }
        if nlo > 0 && !self.supported(x, 3, nlo, own) { return E_SUPPORT }
        if nhi < 0 && !self.supported(x, 3, nhi, own) { return E_SUPPORT }
        let cost = match ext {
            Some(e) => {
                let added = (nhi - nlo) - (self.trans[e].hi - self.trans[e].lo);
                if added == 0 { return E_NOCHANGE }
                added as i64 * ELEV_FLOOR_COST
            }
            None => kind_price(ELEVATOR) + (nhi - nlo + 1) as i64 * ELEV_FLOOR_COST,
        };
        self.quote = cost;
        if self.money < cost { return E_MONEY }
        if dry { return OK }
        self.money -= cost;
        self.exp_today += cost;
        match ext {
            Some(e) => {
                let t = &mut self.trans[e];
                let mut q = vec![Vec::new(); (nhi - nlo + 1) as usize];
                for (k, v) in std::mem::take(&mut t.queue).into_iter().enumerate() {
                    q[(t.lo + k as i32 - nlo) as usize] = v;
                }
                t.queue = q;
                t.lo = nlo;
                t.hi = nhi;
                for f in nlo..=nhi {
                    for cx in x..x + 3 { self.tgrid[gi(cx, f)] = own }
                }
            }
            None => {
                self.add_trans_raw(ELEVATOR, x, nlo, nhi, 1);
            }
        }
        OK
    }

    fn add_car(&mut self, x: i32, f: i32, dry: bool) -> i32 {
        let c = self.tcell(x, f);
        if c >= 0 { return E_NOTELEV }
        let t = (-c - 1) as usize;
        if self.trans[t].kind != ELEVATOR { return E_NOTELEV }
        if self.trans[t].cars.len() >= MAX_CARS { return E_MAXCARS }
        if self.money < CAR_COST { return E_MONEY }
        if dry { return OK }
        self.money -= CAR_COST;
        self.exp_today += CAR_COST;
        let y = f.clamp(self.trans[t].lo, self.trans[t].hi);
        self.trans[t].cars.push(Car::new(y));
        OK
    }

    fn deps_ok(&self, cells: &[(i32, i32)], own: i32) -> bool {
        for &(cx, cf) in cells {
            let deps: &[i32] = if cf > 0 { &[1] } else if cf < 0 { &[-1] } else { &[1, -1] };
            // the cell stays solid if the other layer still occupies it
            let other = if own > 0 { self.tcell(cx, cf) } else { self.rcell(cx, cf) };
            if other != 0 { continue }
            for &d in deps {
                if self.solid(cx, cf + d, own) { return false }
            }
        }
        true
    }

    fn bulldoze(&mut self, x: i32, f: i32, dry: bool) -> i32 {
        let c = self.cell(x, f);
        if c == 0 { return E_NOTHING }
        let mut cells = Vec::new();
        if c > 0 {
            let r = &self.rooms[(c - 1) as usize];
            for cx in r.x..r.x + r.w { cells.push((cx, r.f)) }
        } else {
            let t = &self.trans[(-c - 1) as usize];
            let top = if t.kind == STAIRS { t.lo } else { t.hi };
            for ff in t.lo..=top {
                for cx in t.x..t.x + 3 { cells.push((cx, ff)) }
            }
        }
        if !self.deps_ok(&cells, c) { return E_DEPENDS }
        if dry { return OK }
        for &(cx, cf) in &cells {
            if c > 0 { self.grid[gi(cx, cf)] = 0 } else { self.tgrid[gi(cx, cf)] = 0 }
        }
        if c > 0 { self.remove_room((c - 1) as usize) } else { self.remove_trans((-c - 1) as usize) }
        self.reindex();
        self.recompute();
        OK
    }

    fn redirect(&mut self, i: usize, room: i32) {
        self.set_goal(i, room);
        if self.people[i].state == S_WALK && !self.replan(i) { self.fail(i) }
    }

    fn remove_room(&mut self, r: usize) {
        let ri = r as i32;
        let (rf, rx, rw) = (self.rooms[r].f, self.rooms[r].x, self.rooms[r].w);
        for i in 0..self.people.len() {
            if !self.people[i].alive { continue }
            let (home, st, cur, goal) = {
                let p = &self.people[i];
                (p.home, p.state, p.cur_room, p.goal_room)
            };
            if home == ri {
                self.kill(i);
            } else if st == S_ROOM && cur == ri {
                self.detach(i);
                {
                    let p = &mut self.people[i];
                    p.floor = rf;
                    p.x = rx as f32 + rw as f32 / 2.0;
                    p.hop_t = -1;
                }
                let back = if self.people[i].kind != K_VISITOR && home >= 0 { home } else { -1 };
                self.redirect(i, back);
            } else if goal == ri && st != S_OUT && st != S_ROOM {
                let back = if self.people[i].kind != K_VISITOR && home >= 0 { home } else { -1 };
                self.redirect(i, back);
            }
        }
        self.rooms[r] = Room::default();
    }

    fn remove_trans(&mut self, t: usize) {
        let center = self.trans[t].center();
        let cars = std::mem::take(&mut self.trans[t].cars);
        for car in &cars {
            let fl = car.y.round() as i32;
            for &pid in &car.pass {
                let p = &mut self.people[pid];
                p.floor = fl;
                p.x = center;
            }
        }
        self.trans[t].queue.clear();
        self.trans[t].alive = false;
        for i in 0..self.people.len() {
            let p = &mut self.people[i];
            if !p.alive || p.hop_t != t as i32 { continue }
            if matches!(p.state, S_WAIT | S_RIDE | S_STAIRS | S_WALK) {
                p.state = S_WALK;
                p.hop_t = -1;
                if !self.replan(i) { self.fail(i) }
            }
        }
    }

    // ------------------------------------------------------------ render export

    fn prepare_render(&mut self) {
        self.rr.clear();
        for (i, r) in self.rooms.iter().enumerate() {
            if r.kind == 0 { continue }
            self.rr.extend_from_slice(&[
                i as i32, r.kind, r.x, r.f, r.w, r.occ, r.sat as i32, r.inside, r.flag, r.last_visits,
            ]);
        }

        self.rp.clear();
        // people: x, floor, kind, trip, mode (0 walk, 1 stairs, 2 queue), id, facing
        for (i, p) in self.people.iter().enumerate() {
            if !p.alive { continue }
            match p.state {
                S_WALK => {
                    let dir = if p.tx > p.x + 0.01 { 1.0 } else if p.tx < p.x - 0.01 { -1.0 } else { 0.0 };
                    self.rp.extend_from_slice(&[p.x, p.floor as f32, p.kind as f32, p.trip as f32, 0.0, i as f32, dir]);
                }
                S_STAIRS => {
                    let left = p.timer.saturating_sub(self.now) as f32 / STAIR_TICKS as f32;
                    let prog = (1.0 - left).clamp(0.0, 1.0);
                    let t = &self.trans[p.hop_t as usize];
                    let up = p.hop_exit > p.floor;
                    let (fy, sx) = if up {
                        (p.floor as f32 + prog * 0.999, t.x as f32 + 0.3 + prog * 2.4)
                    } else {
                        (p.floor as f32 - prog * 0.999, t.x as f32 + 2.7 - prog * 2.4)
                    };
                    self.rp.extend_from_slice(&[sx, fy, p.kind as f32, p.trip as f32, 1.0, i as f32, if up { 1.0 } else { -1.0 }]);
                }
                _ => {}
            }
        }

        self.rt.clear();
        self.rc.clear();
        for (ti, t) in self.trans.iter().enumerate() {
            if !t.alive { continue }
            let waiting: usize = t.queue.iter().map(|q| q.len()).sum();
            self.rt.extend_from_slice(&[ti as i32, t.kind, t.x, t.lo, t.hi, t.cars.len() as i32, waiting as i32]);
            for c in &t.cars {
                self.rc.extend_from_slice(&[ti as f32, c.y, c.pass.len() as f32, c.dir as f32, t.x as f32, c.door as f32]);
            }
            for (k, q) in t.queue.iter().enumerate() {
                for (j, &pid) in q.iter().enumerate().take(40) {
                    let side = if j % 2 == 0 { -1.0 } else { 1.0 };
                    let off = 2.0 + (j / 2) as f32 * 0.55;
                    let p = &self.people[pid];
                    self.rp.extend_from_slice(&[
                        t.center() + side * off,
                        (t.lo + k as i32) as f32,
                        p.kind as f32,
                        p.trip as f32,
                        2.0,
                        pid as f32,
                        -side,
                    ]);
                }
            }
        }

        self.rpop.clear();
        std::mem::swap(&mut self.rpop, &mut self.popups);
    }

    fn save_state(&mut self) -> usize {
        let mut s = vec![
            7771,
            1,
            self.money as i32,
            (self.money >> 32) as i32,
            self.now as i32,
            (self.now >> 32) as i32,
            self.stars,
        ];
        let rooms: Vec<&Room> = self.rooms.iter().filter(|r| r.kind != 0).collect();
        s.push(rooms.len() as i32);
        for r in rooms {
            s.extend_from_slice(&[r.kind, r.x, r.f, r.occ, r.sat as i32]);
        }
        let trans: Vec<&Trans> = self.trans.iter().filter(|t| t.alive).collect();
        s.push(trans.len() as i32);
        for t in trans {
            s.extend_from_slice(&[t.kind, t.x, t.lo, t.hi, t.cars.len() as i32]);
        }
        self.save = s;
        self.save.len()
    }

    fn load_state(&mut self) -> bool {
        let s = std::mem::take(&mut self.save);
        let get = |i: usize| -> Option<i32> { s.get(i).copied() };
        if get(0) != Some(7771) || get(1) != Some(1) { return false }
        let mut g = Game::new(self.rng);
        g.money = (get(2).unwrap_or(0) as u32 as i64) | ((get(3).unwrap_or(0) as i64) << 32);
        g.now = (get(4).unwrap_or(0) as u32 as u64) | ((get(5).unwrap_or(0) as u32 as u64) << 32);
        g.stars = get(6).unwrap_or(1).clamp(1, 5);
        let mut i = 7;
        let nr = get(i).unwrap_or(0) as usize;
        i += 1;
        for _ in 0..nr {
            let (Some(k), Some(x), Some(f), Some(occ), Some(sat)) = (get(i), get(i + 1), get(i + 2), get(i + 3), get(i + 4)) else { return false };
            i += 5;
            if kind_w(k) == 0 || x < 0 || x + kind_w(k) > W || f < MIN_F || f > MAX_F { continue }
            let r = g.add_room_raw(k, x, f);
            g.rooms[r].sat = sat as f32;
            if occ == 1 && matches!(k, OFFICE | CONDO) {
                // re-house tenants without charging/paying again
                g.rooms[r].occ = 1;
                let n = kind_cap(k);
                for _ in 0..n {
                    let pid = g.spawn(if k == OFFICE { K_WORKER } else { K_RES }, r as i32);
                    let t = g.now + g.ri(60) * TPM;
                    g.set_timer(pid, t);
                }
            }
        }
        let nt = get(i).unwrap_or(0) as usize;
        i += 1;
        for _ in 0..nt {
            let (Some(k), Some(x), Some(lo), Some(hi), Some(nc)) = (get(i), get(i + 1), get(i + 2), get(i + 3), get(i + 4)) else { return false };
            i += 5;
            if x < 0 || x + 3 > W || lo < MIN_F || hi > MAX_F || lo >= hi { continue }
            g.add_trans_raw(k, x, lo, hi, nc.clamp(1, MAX_CARS as i32) as usize);
        }
        g.reindex();
        g.recompute();
        *self = g;
        true
    }
}

// ---------------------------------------------------------------- C ABI

static mut GAME: Option<Game> = None;

fn g() -> &'static mut Game {
    unsafe {
        if GAME.is_none() { GAME = Some(Game::new(0x1234_5678)) }
        GAME.as_mut().unwrap()
    }
}

#[no_mangle]
pub extern "C" fn init(seed: u32) {
    unsafe { GAME = Some(Game::new((seed as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)) }
}

#[no_mangle]
pub extern "C" fn step(n: i32) {
    let g = g();
    for _ in 0..n.max(0) { g.step() }
}

#[no_mangle]
pub extern "C" fn place(kind: i32, x: i32, f: i32, dry: i32) -> i32 { g().place(kind, x, f, dry != 0) }

#[no_mangle]
pub extern "C" fn place_elevator(x: i32, f1: i32, f2: i32, dry: i32) -> i32 { g().place_elevator(x, f1, f2, dry != 0) }

#[no_mangle]
pub extern "C" fn add_car(x: i32, f: i32, dry: i32) -> i32 { g().add_car(x, f, dry != 0) }

#[no_mangle]
pub extern "C" fn bulldoze(x: i32, f: i32, dry: i32) -> i32 { g().bulldoze(x, f, dry != 0) }

#[no_mangle]
pub extern "C" fn cell_at(x: i32, f: i32) -> i32 { g().cell(x, f) }

#[no_mangle]
pub extern "C" fn money() -> f64 { g().money as f64 }

#[no_mangle]
pub extern "C" fn population() -> i32 { g().pop }

#[no_mangle]
pub extern "C" fn stars() -> i32 { g().stars }

#[no_mangle]
pub extern "C" fn now() -> f64 { g().now as f64 }

#[no_mangle]
pub extern "C" fn last_income() -> f64 { g().last_inc as f64 }

#[no_mangle]
pub extern "C" fn last_expense() -> f64 { g().last_exp as f64 }

#[no_mangle]
pub extern "C" fn max_floor() -> i32 { g().max_floor() }

#[no_mangle]
pub extern "C" fn min_floor() -> i32 { g().min_floor() }

#[no_mangle]
pub extern "C" fn active_people() -> i32 {
    g().people.iter().filter(|p| p.alive && p.state != S_OUT).count() as i32
}

#[no_mangle]
pub extern "C" fn kind_width(k: i32) -> i32 { kind_w(k) }

#[no_mangle]
pub extern "C" fn kind_cost(k: i32) -> f64 { kind_price(k) as f64 }

#[no_mangle]
pub extern "C" fn kind_star(k: i32) -> i32 { kind_req_star(k) }

#[no_mangle]
pub extern "C" fn elev_floor_cost() -> f64 { ELEV_FLOOR_COST as f64 }

/// Cost computed by the most recent `place_elevator` call (dry runs included).
#[no_mangle]
pub extern "C" fn last_quote() -> f64 { g().quote as f64 }

#[no_mangle]
pub extern "C" fn car_cost() -> f64 { CAR_COST as f64 }

#[no_mangle]
pub extern "C" fn prepare_render() { g().prepare_render() }

/// 0 rooms(i32x10) 1 people(f32x7) 2 transports(i32x7) 3 cars(f32x6) 4 popups(f32x3) 5 save(i32)
#[no_mangle]
pub extern "C" fn buf_ptr(id: i32) -> *const u8 {
    let g = g();
    match id {
        0 => g.rr.as_ptr() as *const u8,
        1 => g.rp.as_ptr() as *const u8,
        2 => g.rt.as_ptr() as *const u8,
        3 => g.rc.as_ptr() as *const u8,
        4 => g.rpop.as_ptr() as *const u8,
        5 => g.save.as_ptr() as *const u8,
        _ => g.out.as_ptr(),
    }
}

#[no_mangle]
pub extern "C" fn buf_len(id: i32) -> i32 {
    let g = g();
    (match id {
        0 => g.rr.len(),
        1 => g.rp.len(),
        2 => g.rt.len(),
        3 => g.rc.len(),
        4 => g.rpop.len(),
        5 => g.save.len(),
        _ => g.out.len(),
    }) as i32
}

/// Moves pending notification text into the out buffer (read with buf_ptr(6)).
#[no_mangle]
pub extern "C" fn take_msgs() -> i32 {
    let g = g();
    g.out = std::mem::take(&mut g.msgs).into_bytes();
    g.out.len() as i32
}

#[no_mangle]
pub extern "C" fn save_state() -> i32 { g().save_state() as i32 }

#[no_mangle]
pub extern "C" fn alloc_load(n: i32) -> *mut i32 {
    let g = g();
    g.save = vec![0; n.max(0) as usize];
    g.save.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn load_state() -> i32 { g().load_state() as i32 }

/// Dev/testing helper (not exposed in the UI).
#[no_mangle]
pub extern "C" fn add_money(amount: f64) { g().money += amount as i64 }
