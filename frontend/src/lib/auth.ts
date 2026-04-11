const TOKEN_KEY = "healthcare_auth_token";
const FRONTEND_SESSION_COOKIE = "medsyra_frontend_session";

const writeFrontendSessionCookie = (value: string) => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${FRONTEND_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=86400; SameSite=Lax`;
};

const clearFrontendSessionCookie = () => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${FRONTEND_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const getAuthToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
};

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, normalizedToken);
};

export const clearAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }

  clearFrontendSessionCookie();
};

export const setFrontendSessionMarker = () => {
  writeFrontendSessionCookie("true");
};

export const clearFrontendSessionMarker = () => {
  clearFrontendSessionCookie();
};
