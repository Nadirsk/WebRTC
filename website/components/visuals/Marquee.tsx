type Props = { items: string[]; reverse?: boolean };

/** An endless strip of labels. CSS-only; stops on hover and under reduced motion. */
export function Marquee({ items, reverse = false }: Props) {
  const row = (hidden: boolean) => (
    <ul className="marquee-row" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <div className={`marquee ${reverse ? 'reverse' : ''}`}>
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
