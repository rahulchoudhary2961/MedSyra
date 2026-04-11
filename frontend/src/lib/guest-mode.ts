const GUEST_MODE_KEY = "medsyra_guest_mode";
const GUEST_MODE_COOKIE = "medsyra_guest_mode";
const GUEST_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const writeGuestCookie = (value: string) => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${GUEST_MODE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${GUEST_MODE_COOKIE_MAX_AGE}; SameSite=Lax`;
};

const clearGuestCookie = () => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${GUEST_MODE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const isGuestModeEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GUEST_MODE_KEY) === "true";
};

export const enableGuestMode = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GUEST_MODE_KEY, "true");
  writeGuestCookie("true");
};

export const clearGuestMode = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(GUEST_MODE_KEY);
  clearGuestCookie();
};
