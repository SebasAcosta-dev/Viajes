function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parseWebUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL absoluta válida.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} debe utilizar HTTP o HTTPS.`);
  }
  return parsed;
}

export function getAuthCallbackUrl(
  currentOrigin: string,
  configuredSiteUrl?: string,
  deployment?: { environment?: string; url?: string; productionUrl?: string },
): string {
  const current = parseWebUrl(currentOrigin, "El origen actual");
  const configuredValue = configuredSiteUrl?.trim();

  // Keep local confirmation links on the local app, even when a production
  // URL is present in the build environment.
  let base = current;
  if (!isLocalHostname(current.hostname) && deployment?.environment === "preview" && deployment.url) {
    const deploymentUrl = deployment.url.includes("://") ? deployment.url : `https://${deployment.url}`;
    base = parseWebUrl(deploymentUrl, "NEXT_PUBLIC_VERCEL_URL");
  } else if (!isLocalHostname(current.hostname) && configuredValue) {
    const configured = parseWebUrl(configuredValue, "NEXT_PUBLIC_SITE_URL");
    // Ignore a stale localhost sample value in production; use the deployment
    // origin instead so confirmation never sends a production user to localhost.
    if (!isLocalHostname(configured.hostname)) base = configured;
  } else if (!isLocalHostname(current.hostname) && deployment?.environment === "production" && deployment.productionUrl) {
    const productionUrl = deployment.productionUrl.includes("://")
      ? deployment.productionUrl
      : `https://${deployment.productionUrl}`;
    base = parseWebUrl(productionUrl, "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL");
  }

  return new URL("/auth/callback", base.origin).toString();
}
