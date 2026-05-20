import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = new URL("https://dane.biznes.gov.pl/api/ceidg/v3/firmy");

  searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const response = await fetch(targetUrl.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.CEIDG_JWT}`,
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "API Error" }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
