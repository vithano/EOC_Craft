import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { url } = (await req.json()) as { url: string };
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`TinyURL ${res.status}`);
    const shortUrl = (await res.text()).trim();
    return NextResponse.json({ shortUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
