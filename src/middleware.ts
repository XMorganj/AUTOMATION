import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');

  // Get credentials from environment variables (with fallback defaults)
const expectedUser = process.env.BASIC_AUTH_USER || 'admin';
const expectedPassword = process.env.BASIC_AUTH_PASSWORD || 'securepassword';
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    if (authValue) {
      // Decode the Base64 credentials
      const [user, pwd] = Buffer.from(authValue, 'base64').toString().split(':');

      if (user === expectedUser && pwd === expectedPassword) {
        return NextResponse.next();
      }
    }
  }

  // If credentials are missing or incorrect, prompt the browser login popup
  return new NextResponse('Authentication Required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Automation Studio"',
    },
  });
}

// Configure which routes are protected
export const config = {
  matcher: [
    /*
     * Match all request paths except for static files, image optimizations, and favicons.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
