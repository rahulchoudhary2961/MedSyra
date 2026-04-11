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

export const getAuthToken = () => null;

export const setAuthToken = (_token: string) => {};

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
