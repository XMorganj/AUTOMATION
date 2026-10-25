import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Password gate for the whole app (HTTP Basic auth). The AI and voice routes spend real money,
 * so there is no built-in default login: set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD, or the app refuses to serve.
 * For purely local use you can switch the gate off with BASIC_AUTH_DISABLED=true.
 */

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function proxy(req: NextRequest) {
  if (process.env.BASIC_AUTH_DISABLED === "true") return NextResponse.next();

  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) {
    return new NextResponse("Sign-in is not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD (or BASIC_AUTH_DISABLED=true for local use only), then restart.", {
      status: 503,
    });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && token) {
    const decoded = Buffer.from(token, "base64").toString();
    const i = decoded.indexOf(":"); // the password itself may contain ":"
    if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MA Studio", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
