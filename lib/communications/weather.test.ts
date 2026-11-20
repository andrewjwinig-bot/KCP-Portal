import { describe, it, expect } from "vitest";
import { stillToSend, weatherSignals, type ForecastPeriod } from "./weather";

const now = new Date("2026-01-20T14:00:00Z");
const p = (h: number, temperature: number, shortForecast: string, extra: Partial<ForecastPeriod> = {}): ForecastPeriod => ({
  name: `In ${h} hours`, startTime: new Date(now.getTime() + h * 3600_000).toISOString(), temperature, temperatureUnit: "F", shortForecast, ...extra,
});

describe("weather signals for the Interplex", () => {
  it("a calm forecast suggests nothing", () => {
    expect(weatherSignals([p(0, 67, "Sunny"), p(12, 36, "Partly Cloudy")], [], now)).toEqual([]);
  });
  it("extreme cold, snow and heat inside 48 hours each suggest their email", () => {
    const s = weatherSignals([p(6, 8, "Mostly Clear"), p(20, 28, "Snow Likely", { probabilityOfPrecipitation: { value: 70 } })], [], now);
    expect(s.map((x) => x.template)).toEqual(["cold-alert", "snow-alert"]);
    expect(weatherSignals([p(30, 97, "Sunny and Hot")], [], now)[0].template).toBe("heat-alert");
  });
  it("ignores what is past 48 hours, and a slight chance of snow", () => {
    expect(weatherSignals([p(60, 5, "Clear")], [], now)).toEqual([]);
    expect(weatherSignals([p(10, 30, "Slight Chance Snow Showers", { probabilityOfPrecipitation: { value: 20 } })], [], now)).toEqual([]);
  });
  it("storms by NWS alert, severe wording or high wind", () => {
    expect(weatherSignals([], [{ event: "Severe Thunderstorm Watch", onset: now.toISOString() }], now)[0].template).toBe("storm-alert");
    expect(weatherSignals([p(5, 70, "Showers And Thunderstorms", { windSpeed: "20 to 45 mph" })], [], now)[0].template).toBe("storm-alert");
    expect(weatherSignals([p(5, 75, "Chance Showers And Thunderstorms", { windSpeed: "10 mph" })], [], now)).toEqual([]);
  });
  it("NWS winter alerts map to snow, cold and heat", () => {
    const s = weatherSignals([], [{ event: "Winter Storm Warning" }, { event: "Extreme Cold Warning" }, { event: "Heat Advisory" }], now);
    expect(s.map((x) => x.template).sort()).toEqual(["cold-alert", "heat-alert", "snow-alert"]);
  });
  it("a send in the last 72 hours clears the prompt", () => {
    const s = weatherSignals([p(6, 8, "Clear")], [], now);
    expect(stillToSend(s, { "cold-alert": new Date(now.getTime() - 24 * 3600_000).toISOString() }, now)).toEqual([]);
    expect(stillToSend(s, { "cold-alert": "2025-12-01T00:00:00Z" }, now)).toHaveLength(1);
  });
});
