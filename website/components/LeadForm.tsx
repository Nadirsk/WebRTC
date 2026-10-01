'use client';

import { useState } from 'react';

type Props = { type: 'beta' | 'sales' };

const useCases = [
  'Social or voice chat rooms',
  'Dating or 1-to-1 calls',
  'Online classes',
  'Telehealth',
  'Customer support',
  'Gaming',
  'Live shopping or events',
  'Something else',
];

const volumes = ['Just exploring', 'Under 100,000', '100,000 to 1 million', '1 to 10 million', 'Over 10 million'];

export function LeadForm({ type }: Props) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, type }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'The form could not be sent.');
      setEmail(String(data.email ?? ''));
      setStatus('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The form could not be sent.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="notice success" role="status">
        <strong>{type === 'beta' ? 'Request received' : 'Message sent'}</strong>
        <span className="muted">
          {type === 'beta'
            ? `We'll email ${email} when your beta access is ready.`
            : `Our team will reply to ${email} by email.`}
        </span>
      </div>
    );
  }

  return (
    <form className="panel form" onSubmit={submit} noValidate={false}>
      <div className="field">
        <label htmlFor="lf-name">Your name</label>
        <input id="lf-name" name="name" required autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="lf-email">Work email</label>
        <input id="lf-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="lf-company">Company</label>
        <input id="lf-company" name="company" required autoComplete="organization" />
      </div>
      <div className="field">
        <label htmlFor="lf-country">Country</label>
        <input id="lf-country" name="country" autoComplete="country-name" />
      </div>
      <div className="field">
        <label htmlFor="lf-usecase">What are you building?</label>
        <select id="lf-usecase" name="useCase" defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {useCases.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lf-volume">Expected minutes per month</label>
        <select id="lf-volume" name="monthlyMinutes" defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {volumes.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="field full">
        <label htmlFor="lf-message">{type === 'beta' ? 'Anything we should know? (optional)' : 'How can we help?'}</label>
        <textarea id="lf-message" name="message" required={type === 'sales'} />
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}>
        <label htmlFor="lf-website">Website</label>
        <input id="lf-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="full actions">
        <button className="btn btn-primary" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : type === 'beta' ? 'Request beta access' : 'Send message'}
        </button>
      </div>
      {error && (
        <p className="form-error full" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
