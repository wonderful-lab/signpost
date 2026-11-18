export interface WeatherConfig {
  latitude: number;
  longitude: number;
  label: string;
}

export interface Config {
  facilityName: string;
  timezone: string;
  weather: WeatherConfig;
  icalUrl?: string;
  eventsDaysBack?: number;
  eventsDaysAhead?: number;
}

export interface Event {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  highC: number;
  lowC: number;
}

export interface WeatherData {
  date: string;        // YYYY-MM-DD（config.timezone での日付）
  fetchedAt: string;   // ISO文字列
  tempC: number;
  weatherCode: number;
  highC: number;
  lowC: number;
  days?: WeatherDay[];
}

export interface EventData {
  generatedAt: string;
  events: Event[];
  weather?: WeatherData;
  comment?: { date: string; text: string; model?: string; generatedAt?: string };
}
