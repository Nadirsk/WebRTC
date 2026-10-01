export type Solution = {
  id: string;
  name: string;
  body: string;
  points: string[];
  products: string[];
};

export const solutions: Solution[] = [
  {
    id: 'social',
    name: 'Social apps and voice rooms',
    body: 'Rooms where a few people talk and many listen, with hosts who can bring anyone on stage.',
    points: ['Host, speaker and listener roles', 'Speaking indicators for avatars', 'Large listening audiences'],
    products: ['voice-calling', 'live-streaming'],
  },
  {
    id: 'dating',
    name: 'Dating and 1-to-1 calling',
    body: 'Let matches talk inside your app before they swap numbers, by voice first and video when both agree.',
    points: ['Voice and video in one SDK', 'Nobody shares a phone number', 'Camera on and off during the call'],
    products: ['voice-calling', 'video-calling'],
  },
  {
    id: 'education',
    name: 'Online classes and tutoring',
    body: 'Live lessons where the teacher is on camera and students ask questions out loud.',
    points: ['Teacher on stage, students invited up', 'Works on low-cost phones', 'Recordings for students who missed class (coming soon)'],
    products: ['video-calling', 'live-streaming', 'cloud-recording'],
  },
  {
    id: 'health',
    name: 'Telehealth',
    body: 'Private doctor and patient consultations from inside your clinic’s app.',
    points: ['Encrypted in transit', 'Voice fallback when video struggles', 'Consultation recording (coming soon)'],
    products: ['video-calling', 'voice-calling', 'cloud-recording'],
  },
  {
    id: 'support',
    name: 'Customer support',
    body: 'A call button in your app that connects customers to an agent, with the context already attached.',
    points: ['No phone lines to rent', 'Calls tied to the customer’s account', 'Recording for quality checks (coming soon)'],
    products: ['voice-calling', 'cloud-recording'],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    body: 'Team voice chat that keeps up with the match and stays quiet when nobody talks.',
    points: ['Low delay between teammates', 'Silence sends no data', 'Push-to-talk with mute and unmute'],
    products: ['voice-calling'],
  },
  {
    id: 'commerce',
    name: 'Live shopping and events',
    body: 'Hosts present live to a big audience, and buyers can come on stage to ask questions.',
    points: ['Real-time, not broadcast delay', 'Invite buyers on stage', 'Stream out to YouTube or a CDN (planned)'],
    products: ['live-streaming'],
  },
];
