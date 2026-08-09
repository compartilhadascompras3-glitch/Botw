import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.mercadolibre.com/sites/MLB/categories', {
      next: { revalidate: 86400 }, // cache for 24h
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('ML categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
