import type { Metadata } from 'next';
import { PageHero } from '@/components/PageHero';
import { DemoRoom } from '@/components/DemoRoom';
import { site } from '@/site.config';

export const metadata: Metadata = {
  title: 'Live demo',
  description: 'Join a real voice room on our servers from your browser.',
};

export default function DemoPage() {
  return (
    <>
      <PageHero
        title="Live demo"
        lede="A real voice room on our servers, built with the same SDK you would use. Open it on two devices, join the same room, and talk."
      />
      <section className="section band">
        <div className="wrap">
          <DemoRoom allocatorUrl={site.allocatorUrl} appId={site.demoAppId || undefined} />
        </div>
      </section>
    </>
  );
}
