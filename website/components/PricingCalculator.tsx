'use client';

import { useId, useState } from 'react';
import { pricing, type RateId } from '@/site.config';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: pricing.currency, minimumFractionDigits: 2 });

/**
 * Free minutes are applied to the cheapest usage first (voice), the same way the bill will work.
 */
export function PricingCalculator() {
  const id = useId();
  const [minutes, setMinutes] = useState<Record<RateId, number>>({
    voice: 150_000,
    videoSd: 20_000,
    videoHd: 0,
    videoFhd: 0,
  });

  let freeLeft = pricing.freeMinutesPerMonth;
  const lines = pricing.rates.map((rate) => {
    const used = minutes[rate.id] || 0;
    const free = Math.min(used, freeLeft);
    freeLeft -= free;
    const billable = used - free;
    return { ...rate, used, free, cost: (billable / 1000) * rate.per1000 };
  });
  const total = lines.reduce((sum, l) => sum + l.cost, 0);
  const totalMinutes = lines.reduce((sum, l) => sum + l.used, 0);

  return (
    <div className="panel calc">
      <div>
        <h3 style={{ marginBottom: 6 }}>Estimate your monthly bill</h3>
        <p className="small muted" style={{ marginBottom: 12 }}>
          Participant-minutes per month. Example: 500 daily users in 20-minute voice rooms is about 300,000 minutes.
        </p>
        {pricing.rates.map((rate) => (
          <div className="calc-row" key={rate.id}>
            <label htmlFor={`${id}-${rate.id}`}>
              <strong style={{ fontWeight: 600 }}>{rate.label}</strong>
              <span className="small muted" style={{ display: 'block' }}>
                {rate.detail}, ${rate.per1000.toFixed(2)} per 1,000
              </span>
            </label>
            <input
              id={`${id}-${rate.id}`}
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={minutes[rate.id]}
              onChange={(e) =>
                setMinutes((m) => ({ ...m, [rate.id]: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </div>
        ))}
      </div>
      <div className="calc-total" aria-live="polite">
        <span className="muted">Estimated monthly total</span>
        <span className="amount">{money(total)}</span>
        <span className="small muted">
          {totalMinutes.toLocaleString('en-US')} minutes, of which{' '}
          {Math.min(totalMinutes, pricing.freeMinutesPerMonth).toLocaleString('en-US')} are free
        </span>
        <ul className="stat-list" style={{ marginTop: 16 }}>
          {lines
            .filter((l) => l.used > 0)
            .map((l) => (
              <li key={l.id}>
                <span>{l.label}</span>
                <span>{money(l.cost)}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
