const LOGIN_INTRO_SESSION_KEY = "medsyra_show_intro_after_login";

export const markLoginIntroPending = () => {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(LOGIN_INTRO_SESSION_KEY, "1");
  }
};

export const shouldShowLoginIntro = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(LOGIN_INTRO_SESSION_KEY) === "1";
};

export const clearLoginIntroPending = () => {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(LOGIN_INTRO_SESSION_KEY);
  }
};

