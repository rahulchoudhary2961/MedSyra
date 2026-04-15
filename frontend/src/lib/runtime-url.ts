const normalizeTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getApiBaseUrl = () => {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return normalizeTrailingSlash(configuredBaseUrl);
  }

  return "http://localhost:5000/api/v1";
};

export const getSiteUrl = () => {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    return normalizeTrailingSlash(configuredSiteUrl);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${normalizeTrailingSlash(vercelUrl)}`;
  }

  return "http://localhost:3000";
};
