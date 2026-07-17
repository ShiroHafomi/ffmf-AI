import { NextRequest, NextResponse } from 'next/server';

// Gate the dashboard behind the presence of the httpOnly refresh cookie.
// (The access token lives in client memory; the refresh cookie is the
// server-readable proof of an active session.)
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has('refresh_token');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/insights/:path*', '/expenses/:path*', '/admin/:path*'],
};
