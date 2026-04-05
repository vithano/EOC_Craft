import { NextRequest, NextResponse } from 'next/server';

const SPREADSHEET_ID = '1VlL4_rTVD8g3wOdstBNB43JuGk25QygqTB6dLCr5ROM';

export async function GET(request: NextRequest) {
  const tab = request.nextUrl.searchParams.get('tab');
  if (!tab) {
    return NextResponse.json({ error: 'Missing tab parameter' }, { status: 400 });
  }

  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Google Sheets returned ${res.status}` },
        { status: res.status }
      );
    }
    const csv = await res.text();
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
