/* Shared pure rule engine: works in a browser opened via file:// and in Node tests. */
(function (root) {
  "use strict";
  const PHASES = ["Free Trial", "Challenge", "Verification", "FTMO Account"];
  const defaults = () => ({
    account: {
      name: "FTMO Free Trial Round 1",
      type: "FTMO 2-Step",
      initial: 100000,
      phase: "Free Trial",
      startDate: dateInZone(new Date(), "Europe/Prague"),
      timezone: "Asia/Bangkok",
    },
    rules: {
      verified: "2026-10-09",
      phases: {
        "Free Trial": { target: 5, days: 2, daily: 5, max: 10 },
        Challenge: { target: 10, days: 4, daily: 5, max: 10 },
        Verification: { target: 5, days: 4, daily: 5, max: 10 },
        "FTMO Account": { target: null, days: null, daily: 5, max: 10 },
      },
      tony: {
        riskA: 0.25,
        riskPlus: 0.5,
        allowPlus: false,
        maxRisk: 0.25,
        trades: 2,
        losses: 2,
        dailyStop: 1,
        reduce: 2,
        pause: 3,
        review: 4,
        reducedRisk: 0.25,
      },
    },
    daily: [],
    trades: [],
    audit: [],
    observed: {
      peak: null,
      low: null,
      pauseDate: null,
      fullReview: false,
      stops: [],
    },
    theme: "dark",
    version: 1,
  });
  function dateInZone(value, zone = "Europe/Prague") {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const get = (t) => p.find((x) => x.type === t).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function zonedInstant(local, zone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      local,
    );
    if (!m) throw Error("วันเวลาไม่ถูกต้อง");
    const nums = m.slice(1).map(Number);
    const target = Date.UTC(
      nums[0],
      nums[1] - 1,
      nums[2],
      nums[3],
      nums[4],
      nums[5] || 0,
    );
    let guess = target;
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 5; i++) {
      const p = fmt.formatToParts(new Date(guess)),
        g = (t) => Number(p.find((x) => x.type === t).value);
      const represented = Date.UTC(
        g("year"),
        g("month") - 1,
        g("day"),
        g("hour"),
        g("minute"),
        g("second"),
      );
      const delta = target - represented;
      if (!delta) return new Date(guess).toISOString();
      guess += delta;
    }
    throw Error("เวลานี้ไม่มีอยู่จริงใน Timezone ที่เลือก (DST)");
  }
  function resetInstant(date) {
    return zonedInstant(date + "T00:00", "Europe/Prague");
  }
  const calculateEquity = (balance, floating = 0, swap = 0, commission = 0) =>
    balance + floating + swap - commission;
  const calculateDailyLossLimit = (initial, percent = 5) =>
    (initial * percent) / 100;
  const dailyFloor = (midnight, initial, percent = 5) =>
    midnight - calculateDailyLossLimit(initial, percent);
  const calculateDailyLossUsed = (midnight, equity, allowance) =>
    (Math.max(0, midnight - equity) / allowance) * 100;
  const calculateDailyBuffer = (equity, floor) => equity - floor;
  const calculateMaximumLossLimit = (initial, percent = 10) =>
    initial * (1 - percent / 100);
  const calculateMaximumLossUsed = (initial, equity, percent = 10) =>
    (Math.max(0, initial - equity) / ((initial * percent) / 100)) * 100;
  const calculateMaximumLossBuffer = (equity, floor) => equity - floor;
  const calculatePeakDrawdown = (peak, equity) =>
    Math.max(0, ((peak - equity) / peak) * 100);
  function calculateProfitProgress(
    balance,
    initial,
    target,
    closed,
    days,
    minDays,
  ) {
    const profit = balance - initial;
    return {
      profit,
      profitPercent: (profit / initial) * 100,
      targetAmount: target === null ? null : (initial * target) / 100,
      targetBalance: target === null ? null : initial * (1 + target / 100),
      progress:
        target === null ? null : (profit / ((initial * target) / 100)) * 100,
      remaining:
        target === null
          ? null
          : Math.max(0, initial * (1 + target / 100) - balance),
      reached: target !== null && profit >= (initial * target) / 100,
      pass:
        target !== null &&
        profit >= (initial * target) / 100 &&
        closed &&
        days >= (minDays || 0),
    };
  }
  function tradingDates(trades, daily, start = "0000-01-01") {
    return [
      ...new Set([
        ...trades
          .filter((t) => t.grade !== "No Trade")
          .map((t) => dateInZone(t.open)),
        ...daily.filter((d) => d.opened).map((d) => d.date),
      ]),
    ]
      .filter((d) => d >= start)
      .sort();
  }
  const calculateTradingDays = (trades, daily = [], start) =>
    tradingDates(trades, daily, start).length;
  function equityOf(d) {
    return d.mode === "calculate"
      ? calculateEquity(d.balance, d.floating, d.swap, d.commission)
      : d.equity;
  }
  function closedTrades(trades, date) {
    return trades
      .filter(
        (t) =>
          t.close && dateInZone(t.close) === date && t.grade !== "No Trade",
      )
      .sort(
        (a, b) =>
          a.close.localeCompare(b.close) ||
          a.open.localeCompare(b.open) ||
          a.id.localeCompare(b.id),
      );
  }
  function netTrade(t) {
    return t.pnl + t.swap - t.commission;
  }
  function dayStats(state, d) {
    const opened = state.trades.filter(
      (t) => t.grade !== "No Trade" && dateInZone(t.open) === d.date,
    );
    const closed = closedTrades(state.trades, d.date);
    let streak = 0,
      maxStreak = 0;
    closed.forEach((t) => {
      streak = netTrade(t) < 0 ? streak + 1 : 0;
      maxStreak = Math.max(streak, maxStreak);
    });
    const count = Math.max(d.trades, opened.length);
    const risk = Math.max(
      d.risk,
      opened.reduce((s, t) => s + t.risk, 0),
    );
    const breaches = opened.filter(
      (t) =>
        t.violation ||
        !t.followed ||
        (["B", "No Trade"].includes(t.grade) && t.risk > 0) ||
        (t.risk / state.account.initial) * 100 >
          Math.min(
            state.rules.tony.maxRisk,
            t.grade === "A+" && state.rules.tony.allowPlus
              ? state.rules.tony.riskPlus
              : state.rules.tony.riskA,
          ),
    );
    const increased = opened.some((t) =>
      closed.some((p) => p.close <= t.open && netTrade(p) < 0 && p.lot < t.lot),
    );
    return {
      count,
      risk,
      riskPercent: (risk / state.account.initial) * 100,
      lossStreak: Math.max(
        maxStreak,
        d.consecutive || 0,
        d.losses >= state.rules.tony.losses && d.wins === 0 ? d.losses : 0,
      ),
      breaches,
      increased,
    };
  }
  function calculateInternalRiskStatus(s) {
    const { tony: t } = s.rules;
    const reasons = [];
    let level = "GREEN",
      decision = "SAFE TO WAIT FOR A+ / A SETUP";
    const stop = (r) => {
      reasons.push(r);
      level = "STOP";
      decision = "STOP TRADING TODAY";
    };
    if (s.initialDD >= t.review || s.peakDD >= t.review || s.fullReview) {
      stop("Drawdown ถึงเกณฑ์ Full Review");
      decision = "REVIEW REQUIRED";
    }
    if (s.initialDD >= t.pause || s.peakDD >= t.pause || s.cooldown) {
      stop("พักอย่างน้อย 1 trading day และทบทวน 10 trades ล่าสุด");
      decision = "REVIEW REQUIRED";
    }
    if (
      s.dailyLossPercent >= t.dailyStop ||
      s.worstDailyLossPercent >= t.dailyStop
    )
      stop("Daily Loss ถึง Tony Daily Stop");
    if (s.stats.count >= t.trades) stop("ครบจำนวน Trades สูงสุดต่อวัน");
    if (s.stats.lossStreak >= t.losses)
      stop("ถึงจำนวน Consecutive Losses ที่กำหนด");
    if (
      s.stats.breaches.length ||
      s.stats.increased ||
      s.d.internalViolation ||
      s.retainedStop
    )
      stop("ผิดแผน / Risk เกินกำหนด / เพิ่ม Lot หลังขาดทุน / กฎภายใน");
    if (s.violation) {
      stop("FTMO Loss Rule ถูกละเมิดแล้ว");
      decision = "FTMO RULE VIOLATED";
    }
    if (!s.fresh) {
      stop("ไม่มี Daily Entry ของวัน CE(S)T ปัจจุบัน");
    }
    const reduced = s.initialDD >= t.reduce || s.peakDD >= t.reduce;
    if (
      level === "GREEN" &&
      (reduced ||
        s.dailyLossPercent >= t.dailyStop * 0.5 ||
        s.dailyUsed >= 80 ||
        s.maxUsed >= 80)
    ) {
      level = s.dailyLossPercent >= t.dailyStop * 0.8 ? "ORANGE" : "WARNING";
      decision = reduced ? "REDUCE RISK" : "TRADE WITH 0.25% MAX RISK";
      reasons.push(
        reduced ? "Drawdown ถึงเกณฑ์ลด Risk" : "เข้าใกล้ Loss Limit",
      );
    }
    if (s.violation) decision = "FTMO RULE VIOLATED";
    else if (
      s.fullReview ||
      s.cooldown ||
      s.initialDD >= t.pause ||
      s.peakDD >= t.pause
    )
      decision = "REVIEW REQUIRED";
    const maxRisk = Math.min(t.maxRisk, reduced ? t.reducedRisk : Infinity);
    if (level !== "STOP" && maxRisk !== 0.25)
      decision = reduced ? "REDUCE RISK" : `TRADE WITH ${maxRisk}% MAX RISK`;
    return {
      level,
      decision,
      reasons,
      maxRisk: level === "STOP" ? 0 : maxRisk,
    };
  }
  function snapshot(state, asOf = dateInZone(new Date())) {
    const initial = state.account.initial,
      rule = state.rules.phases[state.account.phase];
    const rows = state.daily
      .filter((d) => d.date <= asOf)
      .sort((a, b) => a.date.localeCompare(b.date));
    const d = rows.at(-1) || {
      date: asOf,
      midnight: initial,
      starting: initial,
      balance: initial,
      equity: initial,
      mode: "manual",
      lowest: null,
      peak: null,
      floating: 0,
      commission: 0,
      swap: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      risk: 0,
      consecutive: 0,
      opened: false,
      closed: true,
    };
    const equity = equityOf(d);
    const useObserved = asOf >= dateInZone(new Date());
    let peak = initial,
      low = initial,
      violation = false,
      dailyViolation = false,
      maxViolation = false,
      cooldown = !!(
        state.observed?.pauseDate && state.observed.pauseDate <= asOf
      ),
      fullReview = useObserved && !!state.observed?.fullReview,
      coverage = true;
    const events = [];
    rows.forEach((row) => {
      const e = equityOf(row),
        floor = dailyFloor(row.midnight, initial, rule.daily);
      peak = Math.max(peak, e, row.peak || 0);
      low = Math.min(low, e, row.lowest ?? e);
      const dayBad = Math.min(e, row.lowest ?? e) < floor || row.dailyViolation,
        maxBad =
          Math.min(e, row.lowest ?? e) <
            calculateMaximumLossLimit(initial, rule.max) || row.maxViolation;
      dailyViolation ||= !!dayBad;
      maxViolation ||= !!maxBad;
      if (dayBad || maxBad || row.manualViolation)
        events.push({
          date: row.date,
          daily: !!dayBad,
          max: !!maxBad,
          manual: !!row.manualViolation,
        });
      violation ||= !!(dayBad || maxBad || row.manualViolation);
      coverage &&= row.lowest !== null && row.lowest !== undefined;
      const dd = Math.max(
        calculatePeakDrawdown(initial, Math.min(e, row.lowest ?? e)),
        calculatePeakDrawdown(peak, Math.min(e, row.lowest ?? e)),
      );
      if (dd >= state.rules.tony.review) fullReview = true;
      if (dd >= state.rules.tony.pause) {
        cooldown = true;
      } else if (
        cooldown &&
        (!state.observed?.pauseDate || row.date > state.observed.pauseDate) &&
        !row.opened &&
        dayStats(state, row).count === 0 &&
        row.reviewed &&
        !["Sat", "Sun"].includes(
          new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            timeZone: "Europe/Prague",
          }).format(new Date(resetInstant(row.date))),
        )
      ) {
        cooldown = false;
      }
    });
    if (useObserved) {
      peak = Math.max(peak, state.observed?.peak ?? initial);
      low = Math.min(low, state.observed?.low ?? initial);
    }
    (state.audit || [])
      .filter((e) => e.date <= asOf)
      .forEach((e) => {
        if (
          !events.some(
            (x) =>
              x.date === e.date &&
              x.daily === e.daily &&
              x.max === e.max &&
              x.manual === e.manual,
          )
        )
          events.push(e);
        dailyViolation ||= e.daily;
        maxViolation ||= e.max;
        violation ||= e.daily || e.max || e.manual;
      });
    const floor = dailyFloor(d.midnight, initial, rule.daily),
      maxFloor = calculateMaximumLossLimit(initial, rule.max);
    if (low < maxFloor && !maxViolation) {
      maxViolation = true;
      violation = true;
      events.push({ date: d.date, daily: false, max: true, manual: false });
    }
    const stats = dayStats(state, d);
    const tradingDays = calculateTradingDays(
      state.trades.filter((t) => dateInZone(t.open) <= asOf),
      rows,
      state.account.startDate,
    );
    const openTrades = state.trades.some(
      (t) =>
        t.grade !== "No Trade" &&
        dateInZone(t.open) <= asOf &&
        (!t.close || dateInZone(t.close) > asOf),
    );
    const closed = d.closed && !openTrades;
    const result = {
      d,
      initial,
      rule,
      rules: state.rules,
      equity,
      balance: d.balance,
      peak,
      low,
      coverage: coverage && rows.length > 0,
      fresh: rows.length > 0 && d.date === asOf,
      floor,
      maxFloor,
      dailyAmount: (initial * rule.daily) / 100,
      maxAmount: (initial * rule.max) / 100,
      dailyBuffer: equity - floor,
      maxBuffer: equity - maxFloor,
      dailyUsed: calculateDailyLossUsed(
        d.midnight,
        equity,
        (initial * rule.daily) / 100,
      ),
      maxUsed: calculateMaximumLossUsed(initial, equity, rule.max),
      initialDD: calculatePeakDrawdown(initial, equity),
      peakDD: calculatePeakDrawdown(peak, equity),
      dailyLossPercent: (Math.max(0, d.midnight - equity) / initial) * 100,
      worstDailyLossPercent:
        (Math.max(0, d.midnight - Math.min(equity, d.lowest ?? equity)) /
          initial) *
        100,
      violation,
      dailyViolation,
      maxViolation,
      events,
      cooldown,
      fullReview,
      stats,
      tradingDays,
      closed,
      retainedStop: !!state.observed?.stops?.includes(asOf),
    };
    result.profit = calculateProfitProgress(
      d.balance,
      initial,
      rule.target,
      closed,
      tradingDays,
      rule.days,
    );
    result.internal = calculateInternalRiskStatus(result);
    result.ftmoStatus = violation
      ? "RULE VIOLATION"
      : !result.fresh || !result.coverage
        ? "UNCONFIRMED"
        : result.profit.pass
          ? "PASS"
          : "SAFE";
    return result;
  }
  function calculateNextTradeProjection(
    s,
    {
      grade,
      riskPercent,
      distance,
      tickSize,
      tickValue,
      lotStep = 0.01,
      cost = 0,
      balance = s.balance,
      equity = s.equity,
    },
  ) {
    const t = s.rules.tony,
      limit = Math.min(
        s.internal.maxRisk,
        grade === "A+" && t.allowPlus ? t.riskPlus : t.riskA,
      );
    const amount = (s.initial * riskPercent) / 100;
    const projected = Math.min(equity, s.equity) - amount - cost;
    const rawLots =
      distance > 0 && tickSize > 0 && tickValue > 0
        ? amount / ((distance / tickSize) * tickValue)
        : null;
    const lots =
      rawLots === null || lotStep <= 0
        ? null
        : Math.floor((rawLots + 1e-12) / lotStep) * lotStep;
    const dailyBuffer = projected - s.floor,
      maxBuffer = projected - s.maxFloor,
      dailyPercent = (Math.max(0, s.d.midnight - projected) / s.initial) * 100,
      totalPercent = (Math.max(0, s.initial - projected) / s.initial) * 100,
      peakDD = calculatePeakDrawdown(s.peak, projected);
    const reasons = [];
    if (s.internal.level === "STOP") reasons.push(...s.internal.reasons);
    if (["B", "No Trade"].includes(grade))
      reasons.push("B / No Trade: Risk = 0");
    if (riskPercent <= 0 || riskPercent > limit)
      reasons.push(`Risk ต้องมากกว่า 0 และไม่เกิน ${limit}%`);
    if (dailyBuffer <= 0 || maxBuffer <= 0)
      reasons.push("Projected Equity ชน FTMO Floor");
    if (
      dailyPercent >= t.dailyStop ||
      totalPercent >= t.pause ||
      peakDD >= t.pause
    )
      reasons.push("FTMO ยังอนุญาต แต่ Tony Risk Rule = STOP");
    if (
      (totalPercent >= t.reduce || peakDD >= t.reduce) &&
      riskPercent > t.reducedRisk
    )
      reasons.push("Projected Drawdown ต้องลด Risk");
    if (lots === null || lots <= 0)
      reasons.push(
        "กรอก MT5 Contract Specification ให้ครบ / Lot เล็กกว่าขั้นต่ำ",
      );
    if (balance !== s.balance || equity !== s.equity)
      reasons.push(
        "ค่าจำลองต่างจากข้อมูลปัจจุบัน: ต้องบันทึก Daily Entry ก่อนยืนยัน",
      );
    return {
      amount,
      rawLots,
      lots,
      projected,
      dailyBuffer,
      maxBuffer,
      dailyPercent,
      totalPercent,
      tonyRemaining: Math.max(
        0,
        (s.initial * t.dailyStop) / 100 - Math.max(0, s.d.midnight - s.equity),
      ),
      limit,
      allowed: reasons.length === 0,
      reasons,
    };
  }
  function weeklyReview(state, from, to) {
    const ds = state.daily
        .filter((d) => d.date >= from && d.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date)),
      ts = state.trades.filter(
        (t) =>
          t.close &&
          dateInZone(t.close) >= from &&
          dateInZone(t.close) <= to &&
          t.grade !== "No Trade",
      ),
      opens = state.trades.filter(
        (t) =>
          dateInZone(t.open) >= from &&
          dateInZone(t.open) <= to &&
          t.grade !== "No Trade",
      );
    const wins = ts.filter((t) => netTrade(t) > 0).length,
      losses = ts.filter((t) => netTrade(t) < 0).length;
    const net = ts.reduce((s, t) => s + netTrade(t), 0),
      rs = ts.filter((t) => t.risk > 0).map((t) => netTrade(t) / t.risk);
    const setup = ["A+", "A", "B"].map((grade) => {
      const trades = ts.filter((t) => t.grade === grade);
      return {
        grade,
        count: trades.length,
        net: trades.reduce((s, t) => s + netTrade(t), 0),
      };
    });
    let maxDD = 0;
    ds.forEach((d) => {
      const s = snapshot(state, d.date);
      maxDD = Math.max(
        maxDD,
        calculatePeakDrawdown(s.peak, Math.min(s.equity, d.lowest ?? s.equity)),
      );
    });
    const last = snapshot(state, to);
    return {
      count: ts.length,
      opened: opens.length,
      wins,
      losses,
      winRate: ts.length ? (wins / ts.length) * 100 : 0,
      net,
      netPercent: (net / state.account.initial) * 100,
      netR: rs.reduce((a, b) => a + b, 0),
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      avgRisk: opens.length
        ? opens.reduce(
            (s, t) => s + (t.risk / state.account.initial) * 100,
            0,
          ) / opens.length
        : null,
      maxDD,
      lowest: ds.length
        ? Math.min(
            ...ds.map((d) => Math.min(equityOf(d), d.lowest ?? Infinity)),
          )
        : null,
      setup,
      best:
        setup.filter((s) => s.count).sort((a, b) => b.net - a.net)[0]?.grade ||
        "—",
      violations:
        last.events.filter((e) => e.date >= from).length +
        ts.filter((t) => t.violation).length,
      noTrade: ds.filter(
        (d) => !d.opened && !opens.some((t) => dateInZone(t.open) === d.date),
      ).length,
      days: calculateTradingDays(opens, ds, state.account.startDate),
      progress: last.profit.progress,
      manualNet: ds.reduce((s, d) => s + d.realised, 0),
    };
  }
  const api = {
    PHASES,
    defaults,
    dateInZone,
    zonedInstant,
    resetInstant,
    calculateEquity,
    calculateDailyLossLimit,
    dailyFloor,
    calculateDailyLossUsed,
    calculateDailyBuffer,
    calculateMaximumLossLimit,
    calculateMaximumLossUsed,
    calculateMaximumLossBuffer,
    calculatePeakDrawdown,
    calculateProfitProgress,
    calculateTradingDays,
    tradingDates,
    equityOf,
    dayStats,
    netTrade,
    snapshot,
    calculateInternalRiskStatus,
    calculateNextTradeProjection,
    weeklyReview,
  };
  root.Calc = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
