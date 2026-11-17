/** N'accepte qu'un chemin relatif du même site (anti open-redirect). */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}
