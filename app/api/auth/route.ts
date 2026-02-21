import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-authenticate": 'Basic realm="Secure Area"',
    },
  });
}
