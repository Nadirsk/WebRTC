import { AnimatedHeadline } from './motion/AnimatedHeadline';
import { Reveal } from './motion/Reveal';
import { HeroCanvas } from './visuals/HeroCanvas';

type Props = {
  title: string;
  lede?: React.ReactNode;
  crumb?: React.ReactNode;
  children?: React.ReactNode;
  /** Optional illustration shown beside the text on wide screens. */
  visual?: React.ReactNode;
};

/** Header for inner pages: soft moving glows, the network canvas, and a headline that slides in. */
export function PageHero({ title, lede, crumb, children, visual }: Props) {
  return (
    <section className="page-hero">
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />
      <HeroCanvas className="hero-canvas faint" />
      <div className={`wrap page-hero-inner ${visual ? 'with-visual' : ''}`}>
        <div className="page-hero-copy">
          {crumb && <div className="crumb">{crumb}</div>}
          <AnimatedHeadline text={title} />
          {lede && (
            <Reveal delay={0.25}>
              <p className="lede">{lede}</p>
            </Reveal>
          )}
          {children && <Reveal delay={0.4}>{children}</Reveal>}
        </div>
        {visual && (
          <Reveal delay={0.3} className="page-hero-visual">
            {visual}
          </Reveal>
        )}
      </div>
    </section>
  );
}
