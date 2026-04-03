/** True for app / marketing pages on Ask Edgar (modal iframe); not API hosts. */
export function isAskEdgarWebUrl(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (host === "eapi.askedgar.io") return false;
    return host.endsWith("askedgar.io") || host.endsWith("askedgar.com");
  } catch {
    return false;
  }
}
