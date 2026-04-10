const TOKEN_KEY = "healthcare_auth_token";

export const getAuthToken = () => null;

export const setAuthToken = (_token: string) => {};

export const clearAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
};
