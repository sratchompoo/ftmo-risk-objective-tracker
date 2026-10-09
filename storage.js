(function (root) {
  "use strict";
  const KEY = "tony-ftmo-tracker-v1";
  const finite = (x) =>
    typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e12;
  const date = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !isNaN(Date.parse(x)) &&
    new Date(x).toISOString().slice(0, 10) === x;
  const text = (x, max = 10000) => typeof x === "string" && x.length <= max;
  function validate(s) {
    const fail = () => {
      throw Error(
        "รูปแบบ Backup ไม่ถูกต้อง หรือมีค่า Rules / ตัวเลข / วันที่ที่ไม่ปลอดภัย",
      );
    };
    if (
      !s ||
      s.version !== 1 ||
      !s.account ||
      !s.rules ||
      !Array.isArray(s.daily) ||
      !Array.isArray(s.trades) ||
      s.daily.length > 20000 ||
      s.trades.length > 100000
    )
      fail();
    const a = s.account,
      t = s.rules.tony;
    if (
      !text(a.name, 200) ||
      !a.name.trim() ||
      a.type !== "FTMO 2-Step" ||
      !Calc.PHASES.includes(a.phase) ||
      !finite(a.initial) ||
      a.initial <= 0 ||
      !date(a.startDate) ||
      !text(a.timezone, 100) ||
      !a.timezone
    )
      fail();
    try {
      new Intl.DateTimeFormat("en", { timeZone: a.timezone }).format();
    } catch {
      fail();
    }
    if (!date(s.rules.verified) || !t) fail();
    for (const phase of Calc.PHASES) {
      const r = s.rules.phases?.[phase];
      if (
        !r ||
        !["daily", "max"].every((k) => finite(r[k]) && r[k] > 0 && r[k] < 100)
      )
        fail();
      if (phase === "FTMO Account") {
        if (r.target !== null || r.days !== null) fail();
      } else if (
        !finite(r.target) ||
        r.target <= 0 ||
        !Number.isInteger(r.days) ||
        r.days < 0 ||
        r.days > 365
      )
        fail();
    }
    for (const k of [
      "riskA",
      "riskPlus",
      "maxRisk",
      "dailyStop",
      "reduce",
      "pause",
      "review",
      "reducedRisk",
    ])
      if (!finite(t[k]) || t[k] <= 0 || t[k] >= 100) fail();
    if (
      !(t.reduce < t.pause && t.pause < t.review) ||
      typeof t.allowPlus !== "boolean" ||
      !["trades", "losses"].every(
        (k) => Number.isInteger(t[k]) && t[k] > 0 && t[k] < 1000,
      )
    )
      fail();
    const ids = new Set(),
      dates = new Set();
    for (const d of s.daily) {
      if (
        !date(d.date) ||
        d.date < a.startDate ||
        dates.has(d.date) ||
        !["manual", "calculate"].includes(d.mode)
      )
        fail();
      dates.add(d.date);
      for (const k of [
        "midnight",
        "starting",
        "balance",
        "equity",
        "floating",
        "realised",
        "commission",
        "swap",
        "risk",
        "trades",
        "wins",
        "losses",
        "consecutive",
      ])
        if (!finite(d[k])) fail();
      for (const k of ["lowest", "peak"])
        if (d[k] !== null && !finite(d[k])) fail();
      if (
        (d.lowest !== null && d.lowest > Calc.equityOf(d)) ||
        (d.peak !== null && d.peak < Calc.equityOf(d))
      )
        fail();
      for (const k of [
        "commission",
        "risk",
        "trades",
        "wins",
        "losses",
        "consecutive",
      ])
        if (d[k] < 0) fail();
      for (const k of ["trades", "wins", "losses", "consecutive"])
        if (!Number.isInteger(d[k])) fail();
      if (d.wins + d.losses > d.trades || d.consecutive > d.losses) fail();
      for (const k of [
        "opened",
        "closed",
        "internalViolation",
        "manualViolation",
        "reviewed",
        "dailyViolation",
        "maxViolation",
      ])
        if (typeof d[k] !== "boolean") fail();
      for (const k of ["notes", "emotion", "violationNotes"])
        if (!text(d[k])) fail();
    }
    for (const tr of s.trades) {
      if (
        !text(tr.id, 100) ||
        !tr.id.trim() ||
        ids.has(tr.id) ||
        !text(tr.symbol, 100) ||
        !["A+", "A", "B", "No Trade"].includes(tr.grade) ||
        !["Buy", "Sell"].includes(tr.side)
      )
        fail();
      ids.add(tr.id);
      if (
        !text(tr.open, 30) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(tr.open) ||
        isNaN(Date.parse(tr.open)) ||
        new Date(tr.open).toISOString() !== tr.open ||
        Calc.dateInZone(tr.open) < a.startDate
      )
        fail();
      if (
        tr.close !== null &&
        (!text(tr.close, 30) ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(tr.close) ||
          isNaN(Date.parse(tr.close)) ||
          new Date(tr.close).toISOString() !== tr.close ||
          tr.close < tr.open)
      )
        fail();
      for (const k of [
        "entry",
        "sl",
        "tp",
        "lot",
        "risk",
        "pnl",
        "commission",
        "swap",
      ])
        if (!finite(tr[k])) fail();
      if (tr.lot < 0 || tr.risk < 0 || tr.commission < 0) fail();
      if (
        typeof tr.followed !== "boolean" ||
        typeof tr.violation !== "boolean" ||
        !text(tr.notes)
      )
        fail();
    }
    if (s.audit === undefined) s.audit = [];
    if (!Array.isArray(s.audit) || s.audit.length > 40000) fail();
    for (const e of s.audit)
      if (
        !date(e.date) ||
        !["daily", "max", "manual"].every((k) => typeof e[k] === "boolean")
      )
        fail();
    if (s.observed === undefined)
      s.observed = {
        peak: null,
        low: null,
        pauseDate: null,
        fullReview: false,
        stops: [],
      };
    const o = s.observed;
    if (
      !o ||
      !["peak", "low"].every((k) => o[k] === null || finite(o[k])) ||
      (o.pauseDate !== null && !date(o.pauseDate)) ||
      typeof o.fullReview !== "boolean" ||
      !Array.isArray(o.stops) ||
      o.stops.length > 20000 ||
      !o.stops.every(date)
    )
      fail();
    if (!["dark", "light"].includes(s.theme)) fail();
    return s;
  }
  function load() {
    const raw = localStorage.getItem(KEY);
    return raw ? validate(JSON.parse(raw)) : Calc.defaults();
  }
  function save(s) {
    validate(s);
    localStorage.setItem(KEY, JSON.stringify(s));
  }
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csv(rows) {
    return (
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((v) => {
              let s = String(v ?? "");
              if (/^[=+@\-\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
              return '"' + s.replaceAll('"', '""') + '"';
            })
            .join(","),
        )
        .join("\r\n")
    );
  }
  const api = { KEY, validate, load, save, download, csv };
  root.Store = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
