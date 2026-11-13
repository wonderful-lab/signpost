// Signpost: signage dashboard. Data flow (DAKboard-style):
// GitHub Actions fetches the calendar (iCal) server-side and commits
// events.json; this page just renders it and refreshes periodically.

const REFRESH_MS = 5 * 60 * 1000; // re-fetch events.json every 5 min

let config = {
  facilityName: "Signpost",
  timezone: "Asia/Tokyo",
  weather: { latitude: 35.6812, longitude: 139.7671, label: "Tokyo" },
};

const $ = (id) => document.getElementById(id);

function fmtDate(d, tz) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, month: "long", day: "numeric", weekday: "short",
  }).format(d);
}
function fmtTime(iso, tz) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}
function dayKey(iso, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
function fmtDayLabel(iso, tz) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, month: "numeric", day: "numeric", weekday: "short",
  }).format(new Date(iso));
}

function tickClock() {
  const now = new Date();
  const tz = config.timezone;
  $("dateText").textContent = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, year: "numeric", month: "long", day: "numeric", weekday: "long",
  }).format(now);
  $("clockText").textContent = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
}

function eventEl(ev, now) {
  const el = document.createElement("div");
  el.className = "event";
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const isNow = !ev.allDay && now >= start && now < end;
  if (isNow) el.classList.add("now");

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = ev.allDay
    ? "終日"
    : `${fmtTime(ev.start, config.timezone)} – ${fmtTime(ev.end, config.timezone)}`;
  el.appendChild(time);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = ev.title || "（無題）";
  if (isNow) {
    const badge = document.createElement("span");
    badge.className = "badge-now";
    badge.textContent = "開催中";
    title.appendChild(badge);
  }
  el.appendChild(title);

  if (ev.location) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = ev.location;
    el.appendChild(meta);
  }
  return el;
}

function renderEvents(data) {
  const now = new Date();
  const tz = config.timezone;
  const todayKey = dayKey(now.toISOString(), tz);
  const events = (data.events || []).slice().sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  const todayBox = $("todayEvents");
  const upBox = $("upcomingEvents");
  todayBox.innerHTML = "";
  upBox.innerHTML = "";

  const todays = events.filter((e) => dayKey(e.start, tz) === todayKey);
  const upcoming = events.filter((e) => dayKey(e.start, tz) > todayKey);

  if (todays.length === 0) {
    todayBox.innerHTML = '<div class="empty">今日の予定はありません</div>';
  } else {
    todays.forEach((e) => todayBox.appendChild(eventEl(e, now)));
  }

  if (upcoming.length === 0) {
    upBox.innerHTML = '<div class="empty">今後の予定はありません</div>';
  } else {
    let lastDay = "";
    upcoming.slice(0, 12).forEach((e) => {
      const dk = dayKey(e.start, tz);
      if (dk !== lastDay) {
        lastDay = dk;
        const head = document.createElement("div");
        head.className = "meta";
        head.style.fontSize = "1.4vw";
        head.style.color = "var(--accent)";
        head.textContent = fmtDayLabel(e.start, tz);
        upBox.appendChild(head);
      }
      upBox.appendChild(eventEl(e, now));
    });
  }

  if (data.generatedAt) {
    $("updatedAt").textContent =
      "予定データ: " +
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz, month: "numeric", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(data.generatedAt)) +
      " 時点";
  }
}

const WMO = {
  0: ["☀️", "晴れ"], 1: ["🌤️", "晴れ時々曇り"], 2: ["⛅", "曇りがち"], 3: ["☁️", "曇り"],
  45: ["🌫️", "霧"], 48: ["🌫️", "霧"], 51: ["🌦️", "小雨"], 53: ["🌦️", "小雨"],
  55: ["🌧️", "雨"], 61: ["🌧️", "雨"], 63: ["🌧️", "雨"], 65: ["🌧️", "大雨"],
  71: ["🌨️", "雪"], 73: ["🌨️", "雪"], 75: ["🌨️", "大雪"],
  80: ["🌦️", "にわか雨"], 81: ["🌦️", "にわか雨"], 82: ["🌧️", "激しいにわか雨"],
  95: ["⛈️", "雷雨"],
};

async function loadWeather() {
  const w = config.weather;
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" + w.latitude +
    "&longitude=" + w.longitude +
    "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=" +
    encodeURIComponent(config.timezone);
  try {
    const res = await fetch(url);
    const j = await res.json();
    const code = j.current.weather_code;
    const [icon, label] = WMO[code] || ["🌡️", ""];
    $("weatherIcon").textContent = icon;
    $("weatherTemp").textContent = Math.round(j.current.temperature_2m) + "°";
    const hi = Math.round(j.daily.temperature_2m_max[0]);
    const lo = Math.round(j.daily.temperature_2m_min[0]);
    $("weatherSub").textContent = `${w.label} ${label}　最高 ${hi}° / 最低 ${lo}°`;
  } catch (e) {
    $("weatherSub").textContent = "天気を取得できませんでした";
  }
}

async function loadEvents() {
  try {
    const res = await fetch("events.json?t=" + Date.now());
    renderEvents(await res.json());
  } catch (e) {
    $("updatedAt").textContent = "予定データを読み込めませんでした";
  }
}

async function init() {
  try {
    const res = await fetch("config.json");
    config = { ...config, ...(await res.json()) };
  } catch (e) { /* keep defaults */ }
  $("facilityName").textContent = config.facilityName;
  document.title = config.facilityName + " | Signpost";
  tickClock();
  setInterval(tickClock, 1000);
  loadWeather();
  setInterval(loadWeather, 30 * 60 * 1000);
  loadEvents();
  setInterval(loadEvents, REFRESH_MS);
}

init();
