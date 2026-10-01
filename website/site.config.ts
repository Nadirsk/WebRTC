/**
 * Everything brand- and business-specific lives here so it can change in one place.
 * The brand is "Nadir Network Communication", named for the founder, Nadir Shaikh.
 */
export const site = {
  name: 'Nadir Network Communication',
  tagline: 'Voice and video calling for your app',
  description:
    'Add voice calls, video calls and live audio rooms to any app with a few lines of code. Real-time infrastructure built for South Asia and the Gulf.',
  url: 'https://nadir-network.example',
  salesEmail: 'sales@nadir-network.example',
  supportEmail: 'support@nadir-network.example',
  year: 2026,
  /** npm package name used in code samples (the SDK is not published yet). */
  sdkPackage: '@nadir-network/web',
  sdkPackageRn: '@nadir-network/react-native',
  /** Name of our global real-time network (the counterpart of Agora's SD-RTN). */
  networkName: 'Nadir Network Communication — Real-Time Network',
  /** Access point (allocator) the live demo uses. */
  allocatorUrl: process.env.NEXT_PUBLIC_ALLOCATOR_URL ?? 'http://localhost:4100',
  /** App ID of the public testing-mode demo project. Empty = ask the allocator (/v1/demo). */
  demoAppId: process.env.NEXT_PUBLIC_DEMO_APP_ID ?? '',
  /** Example access point used in code samples. */
  apiUrl: 'https://api.nadir-network.example',
};

/**
 * Placeholder prices, US dollars per 1,000 participant-minutes. Set real prices after the
 * Phase 0 cost measurements. Every page reads from here.
 */
export const pricing = {
  freeMinutesPerMonth: 10_000,
  currency: 'USD',
  rates: [
    { id: 'voice', label: 'Voice', detail: 'Calls, voice rooms and live audio', per1000: 0.79 },
    { id: 'videoSd', label: 'Video, SD', detail: 'Up to 640×480', per1000: 3.49 },
    { id: 'videoHd', label: 'Video, HD', detail: 'Up to 1280×720', per1000: 7.99 },
    { id: 'videoFhd', label: 'Video, Full HD', detail: 'Up to 1920×1080', per1000: 15.99 },
  ],
  recordingPer1000: 1.49,
} as const;

export type RateId = (typeof pricing.rates)[number]['id'];

export const regions = [
  { code: 'DXB', city: 'Dubai', status: 'first' as const, lon: 55.4, lat: 25.3 },
  { code: 'KHI', city: 'Karachi', status: 'evaluating' as const, lon: 67.0, lat: 24.9 },
  { code: 'BOM', city: 'Mumbai', status: 'next' as const, lon: 72.9, lat: 19.1 },
  { code: 'FRA', city: 'Frankfurt', status: 'next' as const, lon: 8.7, lat: 50.1 },
  { code: 'SIN', city: 'Singapore', status: 'next' as const, lon: 103.8, lat: 1.35 },
];

export const regionStatusLabel = {
  first: 'Launch region',
  next: 'Next',
  evaluating: 'Under evaluation',
} as const;
