"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("./calculations");
global.Calc = C;
const S = require("./storage");
const DAY = "2026-10-09";
function day(overrides = {}) {
  return {
    date: DAY,
    midnight: 100000,
    starting: 100000,
    balance: 100000,
    equity: 100000,
    mode: "manual",
    lowest: 100000,
    peak: null,
    floating: 0,
    realised: 0,
    commission: 0,
    swap: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    consecutive: 0,
    risk: 0,
    opened: false,
    closed: true,
    internalViolation: false,
    manualViolation: false,
    reviewed: false,
    dailyViolation: false,
    maxViolation: false,
    notes: "",
    emotion: "",
    violationNotes: "",
    ...overrides,
  };
}
function account(overrides = {}) {
  const s = C.defaults();
  s.account.startDate = DAY;
  s.daily = [day(overrides)];
  return s;
}
const snap = (overrides = {}) => C.snapshot(account(overrides), DAY);
function trade(overrides = {}) {
  return {
    id: "T1",
    symbol: "XAUUSD",
    open: DAY + "T08:00:00.000Z",
    close: DAY + "T09:00:00.000Z",
    grade: "A",
    side: "Buy",
    entry: 2600,
    sl: 2597,
    tp: 2606,
    lot: 0.1,
    risk: 250,
    pnl: 100,
    commission: 0,
    swap: 0,
    followed: true,
    violation: false,
    notes: "",
    ...overrides,
  };
}
test("Demo $100K: floor 96000, daily buffer 4300, static buffer 10300", () => {
  const s = snap({
    midnight: 101000,
    balance: 100700,
    mode: "calculate",
    floating: -400,
    lowest: 100200,
  });
  assert.equal(s.equity, 100300);
  assert.equal(s.floor, 96000);
  assert.equal(s.dailyBuffer, 4300);
  assert.equal(s.maxFloor, 90000);
  assert.equal(s.maxBuffer, 10300);
  assert.ok(Math.abs(s.dailyUsed - 14) < 1e-10);
  assert.equal(s.maxUsed, 0);
});
test("Case 1: equity 94999 breaches daily floor 95000", () =>
  assert.equal(snap({ equity: 94999, lowest: 94999 }).dailyViolation, true));
test("Case 2: balance 95000 + floating -5001 breaches maximum floor", () => {
  const s = snap({
    balance: 95000,
    mode: "calculate",
    floating: -5001,
    lowest: 89999,
  });
  assert.equal(s.equity, 89999);
  assert.equal(s.maxViolation, true);
});
test("Case 3: midnight 103000 sets floor 98000", () => {
  const s = snap({ midnight: 103000, equity: 97999, lowest: 97999 });
  assert.equal(s.floor, 98000);
  assert.equal(s.dailyViolation, true);
});
test("Case 4: peak 104000 / equity 101000 = 2.8846%", () =>
  assert.ok(
    Math.abs(C.calculatePeakDrawdown(104000, 101000) - 2.8846153846) < 1e-8,
  ));
test("Case 5: two trades same Prague date = one trading day", () =>
  assert.equal(
    C.calculateTradingDays([
      trade(),
      trade({ id: "T2", open: DAY + "T10:00:00.000Z" }),
    ]),
    1,
  ));
test("Case 6: position held 3 days counts only original opening day", () =>
  assert.equal(
    C.calculateTradingDays(
      [trade({ close: "2026-10-12T10:00:00.000Z" })],
      [day(), day({ date: "2026-10-10" }), day({ date: "2026-10-11" })],
    ),
    1,
  ));
test("Prague date conversion crosses UTC midnight", () => {
  assert.equal(C.dateInZone("2026-10-09T22:30:00Z"), "2026-10-10");
  assert.equal(
    C.calculateTradingDays([
      trade({ open: "2026-10-09T22:30:00Z" }),
      trade({ open: "2026-10-10T00:30:00Z" }),
    ]),
    1,
  );
});
test("Bangkok timestamp converted before day count", () => {
  assert.equal(
    C.zonedInstant("2026-10-10T04:30", "Asia/Bangkok"),
    "2026-10-09T21:30:00.000Z",
  );
  assert.equal(
    C.dateInZone(C.zonedInstant("2026-10-10T04:30", "Asia/Bangkok")),
    "2026-10-09",
  );
});
test("Reset DST: winter Bangkok 06:00 / summer 05:00", () => {
  assert.equal(C.resetInstant("2026-01-10"), "2026-01-09T23:00:00.000Z");
  assert.equal(C.resetInstant("2026-07-10"), "2026-07-09T22:00:00.000Z");
  assert.equal(C.resetInstant("2026-03-30"), "2026-03-29T22:00:00.000Z");
});
test("DST nonexistent local time rejected", () =>
  assert.throws(() => C.zonedInstant("2026-03-29T02:30", "Europe/Prague")));
test("Intraday daily violation survives recovery", () => {
  const s = snap({ equity: 101000, lowest: 94999 });
  assert.equal(s.violation, true);
  assert.equal(s.dailyViolation, true);
  assert.equal(s.ftmoStatus, "RULE VIOLATION");
});
test("Historical violation survives next day", () => {
  const s = account({ lowest: 94999 });
  s.daily.push(day({ date: "2026-10-10" }));
  assert.equal(C.snapshot(s, "2026-10-10").violation, true);
});
test("Latched violation survives deletion", () => {
  const s = account();
  s.daily = [];
  s.audit = [{ date: DAY, daily: true, max: false, manual: false }];
  assert.equal(C.snapshot(s, DAY).violation, true);
});
test("Exactly equal floor does not violate, but planner blocks", () => {
  const s = snap({ equity: 95000, lowest: 95000 });
  assert.equal(s.dailyViolation, false);
  assert.equal(
    C.calculateNextTradeProjection(s, {
      grade: "A",
      riskPercent: 0.25,
      distance: 3,
      tickSize: 0.01,
      tickValue: 1,
    }).allowed,
    false,
  );
});
test("Open costs counted once, realised not added to Balance", () => {
  const s = snap({
    balance: 100700,
    mode: "calculate",
    floating: -400,
    swap: -10,
    commission: 20,
    realised: 700,
    lowest: 100000,
  });
  assert.equal(s.equity, 100270);
  assert.equal(s.balance, 100700);
});
test("Manual Equity ignores floating inputs", () =>
  assert.equal(
    snap({ equity: 100300, floating: -5000, swap: -100, commission: 100 })
      .equity,
    100300,
  ));
test("Missing lowest warns and never confirms PASS", () => {
  const s = account({
    balance: 105000,
    equity: 105000,
    lowest: null,
    opened: true,
  });
  s.daily.push(
    day({ date: "2026-10-10", balance: 105000, equity: 105000, opened: true }),
  );
  assert.equal(C.snapshot(s, "2026-10-10").ftmoStatus, "UNCONFIRMED");
});
test("Profit target uses balance, not equity", () => {
  const s = snap({ balance: 100000, equity: 106000, lowest: 100000 });
  assert.equal(s.profit.reached, false);
  assert.equal(s.profit.progress, 0);
});
test("Numerical target reached with positions open is not PASS", () => {
  const s = snap({
    balance: 105000,
    equity: 105000,
    lowest: 105000,
    closed: false,
  });
  assert.equal(s.profit.reached, true);
  assert.equal(s.profit.pass, false);
});
test("PASS needs target, days, closed positions, complete lows", () => {
  const s = account({
    balance: 105000,
    equity: 105000,
    lowest: 105000,
    opened: true,
  });
  s.daily.push(
    day({
      date: "2026-10-10",
      midnight: 105000,
      balance: 105000,
      equity: 105000,
      lowest: 105000,
      opened: true,
    }),
  );
  assert.equal(C.snapshot(s, "2026-10-10").ftmoStatus, "PASS");
});
test("Open Trade Log overrides daily all-closed checkbox", () => {
  const s = account({
    balance: 105000,
    equity: 105000,
    lowest: 105000,
    opened: true,
  });
  s.trades = [trade({ close: null })];
  assert.equal(C.snapshot(s, DAY).closed, false);
});
test("FTMO Account has no target or minimum days", () => {
  const s = account();
  s.account.phase = "FTMO Account";
  const x = C.snapshot(s, DAY);
  assert.equal(x.profit.targetAmount, null);
  assert.equal(x.rule.days, null);
  assert.equal(x.ftmoStatus, "SAFE");
});
test("Two trades triggers STOP and does not double count manual/log", () => {
  const s = account({ trades: 2, opened: true, risk: 500 });
  s.trades = [trade(), trade({ id: "T2" })];
  const x = C.snapshot(s, DAY);
  assert.equal(x.stats.count, 2);
  assert.equal(x.stats.risk, 500);
  assert.equal(x.internal.level, "STOP");
});
test("Two consecutive losses STOP even after subsequent win", () => {
  const s = account();
  s.rules.tony.trades = 10;
  s.trades = [
    trade({ pnl: -250 }),
    trade({ id: "T2", pnl: -250, close: DAY + "T10:00:00.000Z" }),
    trade({ id: "T3", pnl: 100, close: DAY + "T11:00:00.000Z" }),
  ];
  assert.equal(C.snapshot(s, DAY).stats.lossStreak, 2);
  assert.equal(C.snapshot(s, DAY).internal.level, "STOP");
});
test("Intraday Tony daily STOP survives equity recovery", () =>
  assert.equal(snap({ lowest: 99000 }).internal.level, "STOP"));
test("No revenge / plan flags and increasing risk after loss STOP", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.trades = [
    trade({ pnl: -250 }),
    trade({
      id: "T2",
      open: DAY + "T10:00:00.000Z",
      close: null,
      lot: 0.2,
      risk: 300,
    }),
  ];
  assert.equal(C.snapshot(s, DAY).stats.increased, true);
  assert.equal(C.snapshot(s, DAY).internal.level, "STOP");
});
test("Peak equity uses actual equity not closed Balance", () =>
  assert.equal(
    snap({ balance: 104000, equity: 101000, lowest: 100000 }).peak,
    101000,
  ));
test("Drawdown threshold 2% reduces risk", () => {
  const s = snap({
    midnight: 98000,
    balance: 98000,
    equity: 98000,
    lowest: 98000,
  });
  assert.equal(s.internal.decision, "REDUCE RISK");
  assert.equal(s.internal.maxRisk, 0.25);
});
test("3% pause and 4% full review persist after recovery", () => {
  for (const low of [97000, 96000]) {
    const s = account({
      midnight: low,
      balance: low,
      equity: low,
      lowest: low,
    });
    s.daily.push(day({ date: "2026-10-10" }));
    const x = C.snapshot(s, "2026-10-10");
    assert.equal(x.internal.level, "STOP");
    assert.equal(x.fullReview, low === 96000);
  }
});
test("Cooldown release requires a subsequent weekday no-trade + review", () => {
  const s = account({ midnight: 97000, equity: 97000, lowest: 97000 });
  s.daily.push(day({ date: "2026-10-12", reviewed: true }));
  assert.equal(C.snapshot(s, "2026-10-12").cooldown, false);
  s.daily[1].opened = true;
  assert.equal(C.snapshot(s, "2026-10-12").cooldown, true);
});
test("Stale data cannot authorize a next trade", () => {
  const s = C.snapshot(account(), "2026-10-10");
  assert.equal(s.fresh, false);
  assert.equal(s.internal.level, "STOP");
});
test("Position size from explicit tick spec with downward lot rounding", () => {
  const p = C.calculateNextTradeProjection(snap(), {
    grade: "A",
    riskPercent: 0.25,
    distance: 3,
    tickSize: 0.01,
    tickValue: 1,
    lotStep: 0.01,
  });
  assert.equal(p.amount, 250);
  assert.ok(Math.abs(p.lots - 0.83) < 1e-10);
  assert.equal(p.projected, 99750);
  assert.equal(p.allowed, true);
});
test("B and No Trade always blocked", () => {
  for (const grade of ["B", "No Trade"])
    assert.equal(
      C.calculateNextTradeProjection(snap(), {
        grade,
        riskPercent: 0,
        distance: 3,
        tickSize: 0.01,
        tickValue: 1,
      }).allowed,
      false,
    );
});
test("A+ 0.50% requires opt-in and raised maximum", () => {
  const s = account();
  let x = C.snapshot(s, DAY),
    input = {
      grade: "A+",
      riskPercent: 0.5,
      distance: 3,
      tickSize: 0.01,
      tickValue: 1,
    };
  assert.equal(C.calculateNextTradeProjection(x, input).allowed, false);
  s.rules.tony.allowPlus = true;
  s.rules.tony.maxRisk = 0.5;
  assert.equal(
    C.calculateNextTradeProjection(C.snapshot(s, DAY), input).allowed,
    true,
  );
});
test("Next SL hits Tony daily stop before FTMO: DO NOT TRADE", () => {
  const s = snap({ equity: 99200, lowest: 99200 });
  const p = C.calculateNextTradeProjection(s, {
    grade: "A",
    riskPercent: 0.25,
    distance: 3,
    tickSize: 0.01,
    tickValue: 1,
  });
  assert.equal(p.projected, 98950);
  assert.ok(p.dailyBuffer > 0);
  assert.equal(p.allowed, false);
  assert.ok(p.reasons.includes("FTMO ยังอนุญาต แต่ Tony Risk Rule = STOP"));
});
test("Missing tick specification blocked; additional costs included", () => {
  const s = snap();
  assert.equal(
    C.calculateNextTradeProjection(s, {
      grade: "A",
      riskPercent: 0.25,
      distance: 3,
      tickSize: 0,
      tickValue: 0,
    }).allowed,
    false,
  );
  assert.equal(
    C.calculateNextTradeProjection(s, {
      grade: "A",
      riskPercent: 0.25,
      distance: 3,
      tickSize: 0.01,
      tickValue: 1,
      cost: 10,
    }).projected,
    99750,
  );
});
test("Weekly uses closed date, net costs, R and unique opens", () => {
  const s = account({ realised: 500 });
  s.trades = [
    trade({ pnl: 500, commission: 10, swap: -5 }),
    trade({ id: "T2", close: null, pnl: 1000 }),
  ];
  const w = C.weeklyReview(s, DAY, DAY);
  assert.equal(w.count, 1);
  assert.equal(w.net, 485);
  assert.equal(w.netR, 1.94);
  assert.equal(w.opened, 2);
  assert.equal(w.days, 1);
  assert.equal(w.best, "A");
  assert.equal(w.manualNet, 500);
});
test("No Trade log does not add a trading day", () =>
  assert.equal(C.calculateTradingDays([trade({ grade: "No Trade" })]), 0));
test("Backup roundtrip retains all fields", () =>
  assert.deepEqual(
    S.validate(JSON.parse(JSON.stringify(account()))),
    account(),
  ));
test("Malformed imports rejected: negative costs, bad timezone, duplicate date, invalid thresholds", () => {
  for (const mutate of [
    (s) => (s.daily[0].commission = -10),
    (s) => (s.account.timezone = "Fake/Timezone"),
    (s) => s.daily.push({ ...s.daily[0] }),
    (s) => (s.rules.tony.pause = 1),
    (s) => (s.daily[0].lowest = 200000),
    (s) => (s.account.initial = NaN),
    (s) => (s.daily[0].risk = "250"),
  ]) {
    const s = account();
    mutate(s);
    assert.throws(() => S.validate(s));
  }
});
test("CSV escaping and formula injection protection", () => {
  const csv = S.csv([
    ["note", "value"],
    ['=HYPERLINK("x")', -250],
    ['hello,\n"world"', 1],
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"-250"'));
  assert.ok(csv.includes('""world""'));
});

test("Retained extrema and Full Review survive removed daily history", () => {
  const s = account();
  s.observed = {
    peak: 104000,
    low: 96000,
    pauseDate: null,
    fullReview: true,
    stops: [],
  };
  const x = C.snapshot(s);
  assert.equal(x.peak, 104000);
  assert.equal(x.low, 96000);
  assert.equal(x.internal.decision, "REVIEW REQUIRED");
});
test("Malformed UTC instants and missing timezone rejected on import", () => {
  for (const mutate of [
    (s) => {
      s.trades = [trade({ open: "2026-02-30T08:00:00.000Z" })];
    },
    (s) => {
      s.account.timezone = undefined;
    },
    (s) => {
      s.trades = [trade({ close: DAY + "T08:00:00Z" })];
    },
  ]) {
    const s = account();
    mutate(s);
    assert.throws(() => S.validate(s));
  }
});

test("Lowest since start alone below static floor always violates", () => {
  const s = account();
  s.observed.low = 89999;
  const x = C.snapshot(s);
  assert.equal(x.maxViolation, true);
  assert.equal(x.ftmoStatus, "RULE VIOLATION");
});

// Version 1.1 regressions. Stored records retain schema version 1.
test("v1.1 total budget includes $10 cost; $240 sizes the position and $250 projects the loss", () => {
  const s = snap();
  const p = C.calculateNextTradeProjection(s, {
    grade: "A",
    riskPercent: 0.25,
    distance: 3,
    tickSize: 0.01,
    tickValue: 1,
    lotStep: 0.01,
    cost: 10,
  });
  assert.equal(p.totalRiskBudget, 250);
  assert.equal(p.amount, 250); // Preserve the existing engine return-field alias.
  assert.equal(p.estimatedCost, 10);
  assert.equal(p.priceRiskBudget, 240);
  assert.equal(p.rawLots, 0.8);
  assert.ok(Math.abs(p.lots - 0.8) < 1e-10);
  assert.equal(p.projected, 99750);
  assert.equal(p.dailyBuffer, 4750);
  assert.equal(p.maxBuffer, 9750);
  assert.equal(p.allowed, true);
  assert.ok(
    p.lots * ((3 / 0.01) * 1) + p.estimatedCost <= p.totalRiskBudget + 1e-9,
  );
});
test("v1.1 zero-cost budget preserves existing position sizing", () => {
  const p = C.calculateNextTradeProjection(snap(), {
    grade: "A",
    riskPercent: 0.25,
    distance: 3,
    tickSize: 0.01,
    tickValue: 1,
    cost: 0,
  });
  assert.equal(p.priceRiskBudget, 250);
  assert.ok(Math.abs(p.lots - 0.83) < 1e-10);
  assert.equal(p.projected, 99750);
});
test("v1.1 cost equal to or exceeding the total budget, negative or nonfinite cost is rejected", () => {
  for (const cost of [250, 251, -1, NaN, Infinity]) {
    const p = C.calculateNextTradeProjection(snap(), {
      grade: "A",
      riskPercent: 0.25,
      distance: 3,
      tickSize: 0.01,
      tickValue: 1,
      cost,
    });
    assert.equal(p.allowed, false);
    assert.equal(p.lots, null);
    assert.ok(p.reasons.some((r) => r.includes("Estimated Cost")));
  }
});
test("v1.1 rounding lots downward preserves the total cost-inclusive risk ceiling", () => {
  const p = C.calculateNextTradeProjection(snap(), {
    grade: "A",
    riskPercent: 0.25,
    distance: 7,
    tickSize: 0.01,
    tickValue: 1,
    cost: 10,
  });
  assert.ok(Math.abs(p.lots - 0.34) < 1e-10);
  assert.ok(p.lots * 700 + 10 <= 250);
  assert.equal(p.projected, 99750);
});
test("v1.1 larger lot after a loss with the same $250 risk is allowed", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.trades = [
    trade({ lot: 0.2, risk: 250, pnl: -250 }),
    trade({
      id: "T2",
      open: DAY + "T10:00:00.000Z",
      close: null,
      lot: 0.35,
      risk: 250,
    }),
  ];
  const x = C.snapshot(s, DAY);
  assert.equal(x.stats.increased, false);
  assert.equal(x.stats.breaches.length, 0);
  assert.equal(x.internal.level, "GREEN");
});
test("v1.1 larger lot with higher-than-permitted risk after a loss is a violation", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.trades = [
    trade({ lot: 0.2, risk: 250, pnl: -250 }),
    trade({
      id: "T2",
      open: DAY + "T10:00:00.000Z",
      close: null,
      lot: 0.35,
      risk: 300,
    }),
  ];
  const x = C.snapshot(s, DAY);
  assert.equal(x.stats.increased, true);
  assert.equal(x.stats.breaches.length, 1);
  assert.equal(x.internal.level, "STOP");
});
test("v1.1 risk escalation after a loss is detected even with a smaller lot", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.trades = [
    trade({ lot: 0.2, pnl: -250 }),
    trade({
      id: "T2",
      open: DAY + "T10:00:00.000Z",
      close: null,
      lot: 0.1,
      risk: 300,
    }),
  ];
  assert.equal(C.snapshot(s, DAY).stats.increased, true);
});
test("v1.1 increasing risk within the allowed ceiling is not inferred as revenge", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.trades = [
    trade({ risk: 100, pnl: -100 }),
    trade({
      id: "T2",
      open: DAY + "T10:00:00.000Z",
      close: null,
      lot: 0.35,
      risk: 250,
    }),
  ];
  assert.equal(C.snapshot(s, DAY).stats.increased, false);
});
test("v1.1 exceeding the previous allowed ceiling after a loss is escalation even if the new setup permits it", () => {
  const s = account();
  s.rules.tony.trades = 5;
  s.rules.tony.maxRisk = 0.5;
  s.rules.tony.allowPlus = true;
  s.trades = [
    trade({ grade: "A", pnl: -250 }),
    trade({
      id: "T2",
      grade: "A+",
      open: DAY + "T10:00:00.000Z",
      close: null,
      risk: 500,
    }),
  ];
  const x = C.snapshot(s, DAY);
  assert.equal(x.stats.breaches.length, 0);
  assert.equal(x.stats.increased, true);
});
test("v1.1 worst daily usage preserves the intraday loss after recovery", () => {
  const x = snap({ equity: 100000, lowest: 94999 });
  assert.equal(x.dailyUsed, 0);
  assert.equal(x.worstEquityToday, 94999);
  assert.equal(x.worstDailyLossUsed, 5001);
  assert.ok(Math.abs(x.worstDailyUsed - 100.02) < 1e-10);
  assert.equal(x.dailyViolation, true);
});
test("v1.1 worst usage uses current equity when it is below the recorded low", () => {
  const x = snap({ equity: 97000, lowest: 98000 });
  assert.equal(x.worstEquityToday, 97000);
  assert.equal(x.worstDailyLossUsed, 3000);
  assert.equal(x.worstDailyUsed, 60);
  assert.equal(x.dailyViolation, false);
});
test("v1.1 absent lowest falls back to current equity and keeps incomplete-coverage warning", () => {
  const x = snap({ equity: 99000, lowest: null });
  assert.equal(x.worstEquityToday, 99000);
  assert.equal(x.worstDailyUsed, x.dailyUsed);
  assert.equal(x.coverage, false);
});
test("v1.1 worst daily usage is zero when both equity samples exceed midnight balance", () => {
  const x = snap({ equity: 102000, lowest: 101000 });
  assert.equal(x.dailyUsed, 0);
  assert.equal(x.worstDailyUsed, 0);
});
test("v1.1 Free Trial day 1, day 14 and expiration use calendar dates", () => {
  assert.deepEqual(
    C.calculateFreeTrialCountdown("2026-10-09", "Free Trial", "2026-10-09"),
    { day: 1, totalDays: 14, remaining: 13, expired: false, started: true },
  );
  assert.deepEqual(
    C.calculateFreeTrialCountdown("2026-10-09", "Free Trial", "2026-10-22"),
    { day: 14, totalDays: 14, remaining: 0, expired: false, started: true },
  );
  const expired = C.calculateFreeTrialCountdown(
    "2026-10-09",
    "Free Trial",
    "2026-10-23",
  );
  assert.equal(expired.day, 15);
  assert.equal(expired.remaining, 0);
  assert.equal(expired.expired, true);
});
test("v1.1 countdown uses Prague date instead of UTC or Bangkok date", () => {
  const x = C.calculateFreeTrialCountdown(
    "2026-10-09",
    "Free Trial",
    "2026-10-09T22:30:00Z",
  );
  assert.equal(x.day, 2);
  const y = C.calculateFreeTrialCountdown(
    "2026-10-09",
    "Free Trial",
    "2026-10-09T21:30:00Z",
  );
  assert.equal(y.day, 1);
});
test("v1.1 countdown counts 23-hour spring and 25-hour autumn DST days as calendar days", () => {
  assert.equal(
    C.calculateFreeTrialCountdown("2026-03-28", "Free Trial", "2026-03-30").day,
    3,
  );
  assert.equal(
    C.calculateFreeTrialCountdown("2026-10-24", "Free Trial", "2026-10-26").day,
    3,
  );
});
test("v1.1 countdown includes weekends, handles a future start and is absent in other phases", () => {
  assert.equal(
    C.calculateFreeTrialCountdown("2026-10-09", "Free Trial", "2026-10-12").day,
    4,
  );
  assert.deepEqual(
    C.calculateFreeTrialCountdown("2026-10-10", "Free Trial", "2026-10-09"),
    { day: 0, totalDays: 14, remaining: 14, expired: false, started: false },
  );
  for (const phase of ["Challenge", "Verification", "FTMO Account"])
    assert.equal(C.calculateFreeTrialCountdown(DAY, phase, DAY), null);
});
test("v1.1 Trial expiration does not create a loss-rule violation or Tony STOP", () => {
  const s = account();
  s.daily = [day({ date: "2026-10-23" })];
  const x = C.snapshot(s, "2026-10-23");
  assert.equal(x.trial.expired, true);
  assert.equal(x.violation, false);
  assert.equal(x.internal.level, "GREEN");
  assert.equal(x.ftmoStatus, "SAFE");
  assert.deepEqual(x.events, []);
});
test("v1.1 preserves FTMO default rules, formulas and schema-1 backups without migration", () => {
  const rules = C.defaults().rules.phases;
  assert.deepEqual(rules, {
    "Free Trial": { target: 5, days: 2, daily: 5, max: 10 },
    Challenge: { target: 10, days: 4, daily: 5, max: 10 },
    Verification: { target: 5, days: 4, daily: 5, max: 10 },
    "FTMO Account": { target: null, days: null, daily: 5, max: 10 },
  });
  const s = account();
  const before = JSON.stringify(s);
  assert.equal(C.APP_VERSION, "1.1");
  assert.equal(s.version, 1);
  assert.equal(C.dailyFloor(102000, 100000, 5), 97000);
  assert.equal(C.calculateMaximumLossLimit(100000, 10), 90000);
  assert.deepEqual(S.validate(JSON.parse(before)), s);
  C.snapshot(s, DAY);
  assert.equal(JSON.stringify(s), before);
});
