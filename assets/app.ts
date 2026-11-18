import type { WeatherConfig, EventData, Config, Event, WeatherData, WeatherDay } from "./types";

const REFRESH_MS = 5 * 60 * 1000; // re-fetch events.json every 5 min

let config: Config = {
  facilityName: "Signpost",
  timezone: "Asia/Tokyo",
  weather: { latitude: 35.6812, longitude: 139.7671, label: "Tokyo" },
};

const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Element '${id}' not found`);
  return e;
};

function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, month: "long", day: "numeric", weekday: "short",
  }).format(d);
}
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}
function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
function tickClock(): void {
  const now = new Date();
  const tz = config.timezone;
  $("dateText").textContent = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, year: "numeric", month: "long", day: "numeric", weekday: "long",
  }).format(now);
  $("clockText").textContent = now.toLocaleTimeString("ja-JP",{
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
  }).replace(/^[^\d]*(\d{2}:\d{2}).*$/, "$1");
}

function renderEvents(data: EventData): void {
  // Monthly grid rendering
  const now = new Date();
  const tz = config.timezone;
  const todayKey = dayKey(now.toISOString(), tz);
  const events = (data.events || []).slice().sort(
    (a, b) => +new Date(a.start) - +new Date(b.start)
  );

  // Determine current month
  const baseDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const monthStart = new Date(year, month, 1);
  // === 月曜始まり ===
  let dowOf1st = monthStart.getDay(); // Sunday=0
  if (dowOf1st === 0) {
    dowOf1st = 6; // Sunday->6
  } else {
    dowOf1st = dowOf1st - 1;
  }
  let gridStart = new Date(monthStart);
  gridStart.setDate(1 - dowOf1st);

  // 6 rows x 7 days = 42 days grid
  const cells: { date: Date; key: string; events: Event[]; dim: boolean }[] = [];
  for (let d = 0; d < 42; ++d) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + d);
    const key = dayKey(cellDate.toISOString(), tz);
    const isDim = cellDate.getMonth() !== month;
    cells.push({ date: cellDate, key, events: [], dim: isDim });
  }

  // Map events by the days they span
  // Multi-day events appear in every spanned cell
  for (const ev of events) {
    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);
    // all-day events are 00:00 to 00:00 *next day* in ISO
    let evStartDay = new Date(evStart.toLocaleString("en-US", { timeZone: tz }));
    evStartDay.setHours(0,0,0,0);
    let evEndDay = new Date(evEnd.toLocaleString("en-US", { timeZone: tz }));
    if (ev.allDay || evEnd.getHours() === 0 && evEnd.getMinutes() === 0) {
      evEndDay.setDate(evEndDay.getDate() - 1); // allDay end is exclusive
    }
    for (const cell of cells) {
      const cmpDate = new Date(cell.date.getTime());
      cmpDate.setHours(0,0,0,0);
      if (cmpDate >= evStartDay && cmpDate <= evEndDay) {
        cell.events.push(ev);
      }
    }
  }

  // Render calendar grid
  const grid = $("calendarGrid");
  grid.innerHTML = "";

  // Weekday headers: 月 火 水 木 金 土 日
  const dows = ["月","火","水","木","金","土","日"];
  for (let i = 0; i < 7; ++i) {
    const head = document.createElement("div");
    head.className = "calendar-dow";
    head.textContent = dows[i];
    grid.appendChild(head);
  }

  for (let c = 0; c < 42; ++c) {
    const cell = cells[c];
    const cellDiv = document.createElement("div");
    cellDiv.className = "calendar-cell" + (cell.dim ? " calendar-dim" : "") + (cell.key === todayKey ? " calendar-today" : "");
    // Day number
    const dayNum = document.createElement("div");
    dayNum.className = "calendar-day";
    dayNum.textContent = String(cell.date.getDate());
    cellDiv.appendChild(dayNum);
    // Chips area
    const chipsDiv = document.createElement("div");
    chipsDiv.className = "calendar-chips";
    // Sort events: all-day -> timed; then by time
    const sorted = cell.events.slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
    // Max 4 chips per cell
    const maxChips = 4;
    let shown = 0;
    for (let i = 0; i < sorted.length && shown < maxChips; ++i) {
      const ev = sorted[i];
      const chip = document.createElement("div");
      chip.className = "calendar-chip";
      if (ev.allDay) chip.classList.add("calendar-chip-all-day");
      chip.textContent = ev.allDay ? ev.title || "（無題）" : `${fmtTime(ev.start, tz)} ${ev.title || "（無題）"}`;
      chipsDiv.appendChild(chip);
      shown++;
    }
    if (sorted.length > maxChips) {
      const more = document.createElement("div");
      more.className = "calendar-more";
      more.textContent = `+${sorted.length - maxChips} more`;
      chipsDiv.appendChild(more);
    }
    cellDiv.appendChild(chipsDiv);
    grid.appendChild(cellDiv);
  }

  // Month label
  const monthLabel = $("calendarMonth");
  monthLabel.textContent = `${year}年${month+1}月`;

  // Updated date info (retained)
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


const WMO: Record<number, [string, string]> = {
  0: ["☀️", "晴れ"], 1: ["🌤️", "晴れ時々曇り"], 2: ["⛅", "曇りがち"], 3: ["☁️", "曇り"],
  45: ["🌫️", "霧"], 48: ["🌫️", "霧"], 51: ["🌦️", "小雨"], 53: ["🌦️", "小雨"],
  55: ["🌧️", "雨"], 61: ["🌧️", "雨"], 63: ["🌧️", "雨"], 65: ["🌧️", "大雨"],
  71: ["🌨️", "雪"], 73: ["🌨️", "雪"], 75: ["🌨️", "大雪"],
  80: ["🌦️", "にわか雨"], 81: ["🌦️", "にわか雨"], 82: ["🌧️", "激しいにわか雨"],
  95: ["⛈️", "雷雨"],
};

function renderWeatherForecast(weather?: WeatherData) {
  const card = $("weatherForecastCard");
  card.innerHTML = "";
  const loclab = $("weatherForecastLoc");
  loclab.textContent = config.weather.label;
  if (!weather) {
    card.textContent = "天気を取得できませんでした";
    return;
  }
  const days = weather.days;
  let items: WeatherDay[] = [];
  if (days && Array.isArray(days) && days.length > 0) {
    items = days;
  } else {
    // Fallback: single today
    items = [{
      date: weather.date,
      weatherCode: weather.weatherCode,
      highC: weather.highC,
      lowC: weather.lowC,
    }];
  }
  // Range for track
  const allLows = items.map(x=>x.lowC).filter(x=>x!==null&&x!==undefined) as number[];
  const allHighs = items.map(x=>x.highC).filter(x=>x!==null&&x!==undefined) as number[];
  const minLow = Math.min(...allLows);
  const maxHigh = Math.max(...allHighs);
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  for (let i = 0; i < items.length; ++i) {
    const d = items[i];
    const row = document.createElement("div");
    row.className = "weather-forecast-row" + (d.date===todayStr?" weather-forecast-today":"");
    // Left: 日付/曜日
    // 日付と曜日を施設タイムゾーンで計算
    const tz = config.timezone;
    const dtFmt = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
      timeZone: tz, day: "numeric", weekday: "short"
    });
    const parts = dtFmt.formatToParts(new Date(d.date + "T00:00:00Z"));
    const dayNum = parts.find(p=>p.type==="day")?.value || "";
    const weekday = parts.find(p=>p.type==="weekday")?.value.replace(/\((.)\)/, "$1") || "";
    const dateStr = `${dayNum}（${weekday}）`;
    const dateDiv = document.createElement("span");
    dateDiv.className = "weather-forecast-date" + (d.date===todayStr?" weather-forecast-date-today":"");
    dateDiv.textContent = dateStr;
    // Icon/label
    const [wicon, wlabel] = WMO[d.weatherCode] || ["🌡️", ""];
    const iconDiv = document.createElement("span");
    iconDiv.className = "weather-forecast-icon";
    iconDiv.textContent = wicon;
    const labelDiv = document.createElement("span");
    labelDiv.className = "weather-forecast-label";
    labelDiv.textContent = wlabel;
    // Right: temp bar
    const tempBox = document.createElement("span");
    tempBox.className = "weather-forecast-tempbox";
    const lowDiv = document.createElement("span");
    lowDiv.className = "weather-forecast-low";
    lowDiv.textContent = Math.round(d.lowC)+"°";
    const range = maxHigh==minLow ? 1 : maxHigh-minLow;
    const left = ((d.lowC-minLow)/range)*100;
    const right = ((d.highC-minLow)/range)*100;
    const barDiv = document.createElement("span");
    barDiv.className = "weather-forecast-bar"+(d.date===todayStr?" weather-forecast-bar-today":"");
    barDiv.style.left = left+"%";
    barDiv.style.width = (right-left)+"%";
    const trackDiv = document.createElement("span");
    trackDiv.className = "weather-forecast-track";
    trackDiv.appendChild(barDiv);
    const highDiv = document.createElement("span");
    highDiv.className = "weather-forecast-high";
    highDiv.textContent = Math.round(d.highC)+"°";
    tempBox.appendChild(lowDiv); tempBox.appendChild(trackDiv); tempBox.appendChild(highDiv);
    row.appendChild(dateDiv);
    row.appendChild(iconDiv);
    row.appendChild(labelDiv);
    row.appendChild(tempBox);
    card.appendChild(row);
    if(i<items.length-1) {
      const sep = document.createElement("div");
      sep.className = "weather-forecast-sep";
      card.appendChild(sep);
    }
  }
}

async function loadWeather(): Promise<void> {
  try {
    const res = await fetch("events.json?t=" + Date.now());
    const j = await res.json();
    const weather = j.weather;
    if (!weather) throw new Error("No weather field");
    const [icon, label] = WMO[weather.weatherCode] || ["🌡️", ""];
    $("weatherIcon").textContent = icon;
    $("weatherTemp").textContent = Math.round(weather.tempC) + "°";
    $("weatherSub").textContent = `${config.weather.label} ${label}　最高 ${Math.round(weather.highC)}° / 最低 ${Math.round(weather.lowC)}°`;
    renderWeatherForecast(weather);
  } catch (e) {
    $("weatherSub").textContent = "天気を取得できませんでした";
    renderWeatherForecast(undefined);
  }
}

async function loadEvents(): Promise<void> {
  try {
    const res = await fetch("events.json?t=" + Date.now());
    const data = await res.json();
    renderEvents(data);
    // --- AI comment rendering ---
    const aiDiv = document.getElementById("aiComment");
    if (aiDiv) {
      if (data.comment?.text) {
        aiDiv.textContent = data.comment.text;
        aiDiv.removeAttribute("hidden");
      } else {
        aiDiv.setAttribute("hidden", "true");
      }
    }
  } catch (e) {
    $("updatedAt").textContent = "予定データを読み込めませんでした";
  }
}

async function init(): Promise<void> {
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
