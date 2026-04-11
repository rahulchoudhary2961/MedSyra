import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAME = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME || "medsyra_session";
const GUEST_MODE_COOKIE_NAME = "medsyra_guest_mode";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  const guestModeCookie = request.cookies.get(GUEST_MODE_COOKIE_NAME)?.value?.trim();

  if (authCookie || guestModeCookie === "true") {
    return NextResponse.next();
  }

  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = "/auth/signin";
  signInUrl.search = search ? `?callbackUrl=${encodeURIComponent(`${pathname}${search}`)}` : `?callbackUrl=${encodeURIComponent(pathname)}`;

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
