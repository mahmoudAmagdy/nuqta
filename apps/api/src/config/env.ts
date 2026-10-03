type Env = Record<string, string | undefined>;

/** Thrown at boot so a bad deployment fails loudly instead of at first request. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function stringFromEnv(
  env: Env,
  name: string,
  fallback: string,
): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

export function positiveIntFromEnv(
  env: Env,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function listFromEnv(
  env: Env,
  name: string,
  fallback: string[],
): string[] {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
