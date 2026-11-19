// tools/fetch-calendar.ts
// TypeScript port of tools/fetch_calendar.py (see TASK.md)

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import type { EventData, Event as ICalEvent } from "../assets/types.js";
import ICAL from "ical.js";

const CONFIG_PATH = join(process.cwd(), "config.json");
const EVENTS_PATH = join(process.cwd(), "events.json");

function loadConfig() {
  return readFile(CONFIG_PATH, "utf8").then((txt) => JSON.parse(txt));
}

function zoneOffsetMinutes(dt: Date) {
  return -dt.getTimezoneOffset();
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toLocalISO(date: Date): string {
  // Format date as YYYY-MM-DDTHH:mm:ss+09:00 (local offset)
  const offset = date.getTimezoneOffset();
  const sign = offset > 0 ? "-" : "+";
  const min = Math.abs(offset);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const H = pad(date.getHours());
  const M = pad(date.getMinutes());
  const S = pad(date.getSeconds());
  const hh = pad(Math.floor(min / 60));
  const mm = pad(min % 60);
  return `${y}-${m}-${d}T${H}:${M}:${S}${sign}${hh}:${mm}`;
}

async function main(): Promise<number> {
  const config = await loadConfig();
  const icalUrl: string = (config.icalUrl || "").trim();
  const tz: string = config.timezone || "Asia/Tokyo";
  const daysBack: number = Number(config.eventsDaysBack || 0);
  const daysAhead: number = Number(config.eventsDaysAhead || 30);

  const now = new Date();
  const localTzDate = new Date(
    now.toLocaleString("en-US", { timeZone: tz })
  );
  const start = new Date(localTzDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const end = new Date(start);
  end.setDate(start.getDate() + daysBack + daysAhead);


  let events: ICalEvent[] = [];
  if (!icalUrl) {
    // No calendar URL, output empty
    events = [];
    console.log("config.json: icalUrl is empty; writing empty events.json");
  } else {
    const fetch = (await import("node-fetch")).default;
    const resp = await fetch(icalUrl, {
      headers: { "User-Agent": "signpost-calendar-fetcher" },
      timeout: 60000,
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const raw = await resp.text();
    const jcal = ICAL.parse(raw);
    const vcalendar = new ICAL.Component(jcal);

    const vevents = vcalendar.getAllSubcomponents("vevent");
    for (const evComp of vevents) {
      const event = new ICAL.Event(evComp);
      // Expand recurrences (recurring events only; single events are
      // handled by the branch below so they are never added twice)
      const iter = event.isRecurring() ? event.iterator() : null;
      let next;
      while (iter && (next = iter.next())) {
        const occ = event.getOccurrenceDetails(next);
        const s = occ.startDate.toJSDate();
        const e = occ.endDate.toJSDate();
        const allDay = occ.startDate.isDate && occ.endDate.isDate;
        // Include only events in [start, end)
        if (e < start) continue;
        if (s >= end) break;
        events.push({
          title: event.summary || "",
          start: toLocalISO(s),
          end: toLocalISO(e),
          allDay,
          location: event.location || "",
        });
      }
      // Non-recurring event, no expansion
      if (!event.isRecurring()) {
        const s = event.startDate?.toJSDate();
        if (s && s >= start && s < end) {
          const e = event.endDate?.toJSDate() || s;
          const allDay = event.startDate.isDate && event.endDate?.isDate;
          events.push({
            title: event.summary || "",
            start: toLocalISO(s),
            end: toLocalISO(e),
            allDay,
            location: event.location || ""
          });
        }
      }
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
  }

  // ---- Weather injection (TASK3) ----
  let weather = undefined;
  let existingWeather = undefined;
  let comment = undefined;
  let existingComment = undefined;
  try {
    // Read existing events.json if present
    let existing;
    try {
      existing = JSON.parse(await readFile(EVENTS_PATH, "utf8"));
      existingWeather = existing.weather;
      existingComment = existing.comment;
    } catch (_) {
      existing = undefined;
      existingWeather = undefined;
      existingComment = undefined;
    }
    // Get today (local) in YYYY-MM-DD
    const todayLocal = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const yyyy = todayLocal.getFullYear();
    const mm = String(todayLocal.getMonth() + 1).padStart(2, "0");
    const dd = String(todayLocal.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (existingWeather && existingWeather.date === todayStr) {
      weather = existingWeather;
    } else {
      // Try fetch new weather
      let url = process.env.OPEN_METEO_URL;
      if (!url) {
        url =
          "https://api.open-meteo.com/v1/forecast?latitude=" + config.weather.latitude +
          "&longitude=" + config.weather.longitude +
          "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=" +
          encodeURIComponent(tz);
      }
      try {
        const fetch = (await import("node-fetch")).default;
        const resp = await fetch(url, { headers: { "User-Agent": "signpost-weather-fetcher" }, timeout: 60000 });
        const j = await resp.json();
        if (j.error) throw new Error(String(j.reason || "weather api error"));
        // Assemble 5-day weather
        let days;
        const daily = j.daily;
        if (daily && daily.time && Array.isArray(daily.time)) {
          days = [];
          const len = Math.min(5, daily.time.length);
          for (let i = 0; i < len; ++i) {
            days.push({
              date: daily.time[i],
              weatherCode: daily.weather_code?.[i] ?? 0,
              highC: daily.temperature_2m_max?.[i] ?? null,
              lowC: daily.temperature_2m_min?.[i] ?? null,
            });
          }
        }
        weather = {
          date: todayStr,
          fetchedAt: toLocalISO(new Date()),
          tempC: j.current.temperature_2m,
          weatherCode: j.current.weather_code,
          highC: j.daily.temperature_2m_max[0],
          lowC: j.daily.temperature_2m_min[0],
          ...(days ? { days } : {}),
        };
      } catch(e) {
        console.warn("[weather] fetch failed:", e);
        if (existingWeather) weather = existingWeather;
      }
    }

    // ---- AI 一言コメント injection (TASK6) ----
    // 条件 (a): 天気を新規取得した, または (b): 既存 comment が無い/日付不一致
    const weatherNewlyFetched = !(existingWeather && existingWeather.date === todayStr);
    const commentNeedsUpdate = !existingComment || existingComment.date !== todayStr;
    const shouldUpdateComment = weatherNewlyFetched || commentNeedsUpdate;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    let geminiApiUrl = process.env.GEMINI_API_URL;
    if (!geminiApiUrl) {
      geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
    }

    if (shouldUpdateComment && geminiApiKey) {
      try {
        // Assemble prompt info
        // 予定: 本日の予定だけ
        const todayEvents = events.filter(ev => {
          const evDate = new Date(ev.start).toLocaleString("en-US", { timeZone: tz });
          const d = new Date(evDate);
          return d.getFullYear() === todayLocal.getFullYear() && d.getMonth() === todayLocal.getMonth() && d.getDate() === todayLocal.getDate();
        });
        const eventSummaries = todayEvents.map(ev => {
          const start = ev.start.slice(11, 16);
          const end = ev.end.slice(11, 16);
          let title = ev.title || "";
          return `${start}-${end} ${title}`.trim();
        });
        const eventSummary = `本日の予定（${todayEvents.length}件）: ${eventSummaries.slice(0,5).join(' / ')}`;

        let weatherSummary = '';
        if (weather) {
          let desc = '';
          if (weather.weatherCode !== undefined) {
            const WMO = {
              0: "晴れ", 1: "晴れ時々曇り", 2: "曇りがち", 3: "曇り", 45: "霧", 48: "霧",
              51: "小雨", 53: "小雨", 55: "雨", 61: "雨", 63: "雨", 65: "大雨",
              71: "雪", 73: "雪", 75: "大雪", 80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨", 95: "雷雨",
            };
            desc = WMO[weather.weatherCode] || '';
          }
          weatherSummary = `天気: ${desc}　最高${Math.round(weather.highC)}° 最低${Math.round(weather.lowC)}°`;
        }

        const sysPrompt = "あなたはサイネージ用AIです。施設の当日予定と天気に触れ、皆に役立つ一言コメント（日本語40字以内）を生成してください。短く、丁寧で断定しすぎない表現とし、コメント本文だけを返答してください。";
        const userPrompt = `日付: ${todayStr}\n${eventSummary}\n${weatherSummary}`;
        const body = JSON.stringify({
          systemInstruction: { parts: [{ text: sysPrompt }] },
          contents: [ { role: 'user', parts: [{ text: userPrompt }] } ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        });
        const fetch = (await import("node-fetch")).default;
        const resp = await fetch(geminiApiUrl, {
          method: "POST",
          headers: {
            "x-goog-api-key": geminiApiKey,
            "Content-Type": "application/json"
          },
          body,
          signal: AbortSignal.timeout(30000)
        });
        const bodyText = await resp.text();
        if (!resp.ok) throw new Error(`Gemini API error: ${resp.status} - ${bodyText.slice(0, 200)}`);
        let json;
        try {
          json = JSON.parse(bodyText);
        } catch(e) {
          throw new Error('Gemini response is not valid JSON: ' + bodyText.slice(0, 200));
        }
        let msg = '';
        if (json?.candidates?.[0]?.content?.parts && Array.isArray(json.candidates[0].content.parts)) {
          msg = json.candidates[0].content.parts.map(p => p.text || '').join('').trim();
        }
        msg = msg.replace(/\n/g, "");
        if (msg.length > 60) msg = msg.slice(0, 60);
        if (msg) {
          comment = {
            date: todayStr,
            text: msg,
            model: geminiModel,
            generatedAt: toLocalISO(new Date())
          };
        } else if (existingComment) {
          comment = existingComment;
        }
      } catch(e) {
        console.warn("[ai-comment] fetch failed:", e);
        if (existingComment) comment = existingComment;
      }
    } else if (existingComment && (!shouldUpdateComment || !geminiApiKey)) {
      comment = existingComment;
    }
  } catch(e) {
    console.warn("[weather/ai-comment] error:", e);
    weather = undefined;
    comment = existingComment;
  }
  const out: EventData = {
    generatedAt: toLocalISO(new Date()),
    events,
    ...(weather ? { weather } : {}),
    ...(comment ? { comment } : {}),
  };
  await writeFile(EVENTS_PATH, JSON.stringify(out, null, 1), "utf8");
  console.log(`wrote events.json with ${events.length} events`);
  return 0;
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
