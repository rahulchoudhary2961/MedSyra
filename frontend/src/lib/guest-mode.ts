const GUEST_MODE_KEY = "medsyra_guest_mode";

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
};

export const clearGuestMode = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(GUEST_MODE_KEY);
};

