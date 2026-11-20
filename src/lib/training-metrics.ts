export const workoutMetricUnits = {
  seconds: "giây",
  minutes: "phút",
  meters: "m",
  kilometers: "km",
  repetitions: "lần",
  rounds: "hiệp",
  hitsPer20: "lần trúng / 20 lần thử",
} as const;

export type WorkoutMetricUnit = keyof typeof workoutMetricUnits;

export function isWorkoutMetricUnit(value: string): value is WorkoutMetricUnit {
  return Object.hasOwn(workoutMetricUnits, value);
}

export function isValidWorkoutMetric(value: number, unit: WorkoutMetricUnit) {
  if (!Number.isFinite(value) || value < 0 || value > 999999999.999)
    return false;
  if (unit === "hitsPer20") return Number.isInteger(value) && value <= 20;
  if (unit === "repetitions" || unit === "rounds")
    return Number.isInteger(value);
  return /^\d+(\.\d{1,3})?$/.test(String(value));
}
