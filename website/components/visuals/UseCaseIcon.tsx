const paths: Record<string, React.ReactNode> = {
  social: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
      <path d="M15 14.4c2.6-.3 4.6 1.2 5.4 4" />
    </>
  ),
  dating: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  education: (
    <>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" />
      <path d="M6.5 11v4.2c1.6 1.5 3.4 2.3 5.5 2.3s3.9-.8 5.5-2.3V11" />
    </>
  ),
  health: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  support: (
    <>
      <path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13" />
      <rect x="3.5" y="12.5" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="12.5" width="4" height="6" rx="1.5" />
      <path d="M18.5 18.5c0 1.5-1.8 2.5-4.5 2.5" />
    </>
  ),
  gaming: (
    <>
      <path d="M7 8h10a4 4 0 0 1 4 4.4l-.5 3.4a2.3 2.3 0 0 1-4 1L15 15H9l-1.5 1.8a2.3 2.3 0 0 1-4-1L3 12.4A4 4 0 0 1 7 8Z" />
      <path d="M8 11v3M6.5 12.5h3" />
      <circle cx="16" cy="11.5" r=".6" />
      <circle cx="17.6" cy="13.2" r=".6" />
    </>
  ),
  commerce: (
    <>
      <path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
};

export function UseCaseIcon({ id }: { id: string }) {
  return (
    <span className="case-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {paths[id]}
      </svg>
    </span>
  );
}
