import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nip = searchParams.get("nip");

  if (!nip) {
    return NextResponse.json({ error: "Missing NIP" }, { status: 400 });
  }

  const response = await fetch(`https://dane.biznes.gov.pl/api/ceidg/v3/firma?nip=${nip}`, {
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
