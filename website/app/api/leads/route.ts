import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

/**
 * Stores beta sign-ups and sales enquiries as JSON lines in website/data/leads.jsonl.
 * Good enough until the platform backend (P2) owns accounts; on serverless hosting,
 * swap this for a database or email service.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = new Set(['beta', 'sales']);

type Lead = {
  type: string;
  name: string;
  email: string;
  company: string;
  country?: string;
  useCase?: string;
  monthlyMinutes?: string;
  message?: string;
};

function clean(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send the form as JSON.' }, { status: 400 });
  }

  // Bots tend to fill every field, including this hidden one.
  if (clean(body.website)) return NextResponse.json({ ok: true });

  const lead: Lead = {
    type: clean(body.type, 10),
    name: clean(body.name, 100),
    email: clean(body.email, 200).toLowerCase(),
    company: clean(body.company, 150),
    country: clean(body.country, 80),
    useCase: clean(body.useCase, 80),
    monthlyMinutes: clean(body.monthlyMinutes, 40),
    message: clean(body.message, 3000),
  };

  const missing = [
    !TYPES.has(lead.type) && 'form type',
    !lead.name && 'name',
    !EMAIL.test(lead.email) && 'a valid work email',
    !lead.company && 'company',
  ].filter(Boolean);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Please add ${missing.join(', ')}.` }, { status: 400 });
  }

  const dir = path.join(process.cwd(), 'data');
  await mkdir(dir, { recursive: true });
  await appendFile(
    path.join(dir, 'leads.jsonl'),
    `${JSON.stringify({ ...lead, receivedAt: new Date().toISOString() })}\n`,
  );

  return NextResponse.json({ ok: true });
}
