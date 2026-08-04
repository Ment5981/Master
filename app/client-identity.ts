const STORAGE_KEY = "master.android.installation-id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getInstallationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export function masterRequestHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const installationId = getInstallationId();
  return installationId
    ? { ...headers, "x-master-installation-id": installationId }
    : headers;
}
