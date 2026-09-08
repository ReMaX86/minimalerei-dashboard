import type { SVGProps } from 'react';

// Solid-style nav icons (24x24, filled with currentColor) — replace the
// emoji nav icons with a consistent, modern icon set.

export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.6 2.4 11a1 1 0 0 0 .66 1.75H4.5V20a1.2 1.2 0 0 0 1.2 1.2H18.3A1.2 1.2 0 0 0 19.5 20v-7.25h1.44A1 1 0 0 0 21.6 11L12 2.6ZM10.2 20v-5.3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1V20h-3.6Z"
      />
    </svg>
  );
}

export function IconJersey(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M10 6.2 8.7 6.9 4.3 8.7v3.4l4-2v9.2h7.4v-9.2l4 2V8.7l-4.4-1.8-1.3-.7-2 1.8Z" />
    </svg>
  );
}

export function IconClipboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.5 5h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3.2 5.4h6.6v1.3H8.7Zm0 3.4h6.6v1.3H8.7Zm0 3.4h4v1.3h-4Z"
      />
      <rect x="9" y="3.3" width="6" height="3" rx="1" />
    </svg>
  );
}

export function IconTeam(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        opacity="0.85"
        d="M15.4 13.7a5 5 0 0 1 6.6 4.7v1.2a1 1 0 0 1-1 1h-2.3v-1.9a6.8 6.8 0 0 0-3.3-5Z"
      />
      <circle opacity="0.85" cx="16.9" cy="6.9" r="2.6" />
      <path d="M2.2 20.6v-.7a5.4 5.4 0 0 1 5.4-5.4h2.8a5.4 5.4 0 0 1 5.4 5.4v.7a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1Z" />
      <circle cx="9" cy="7.5" r="3.6" />
    </svg>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4 8V6.3A1.3 1.3 0 0 1 5.3 5h13.4A1.3 1.3 0 0 1 20 6.3V8Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 8h16v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V8Zm2.6 2.6h2.4v2.1H6.6Zm4.5 0h2.4v2.1h-2.4Zm4.5 0h2.4v2.1h-2.4ZM6.6 14.4h2.4v2.1H6.6Zm4.5 0h2.4v2.1h-2.4Z"
      />
      <rect x="7" y="3.3" width="2" height="3.2" rx="1" />
      <rect x="15" y="3.3" width="2" height="3.2" rx="1" />
    </svg>
  );
}

export function IconGear(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="12" r="3.3" />
      <rect x="10.8" y="1.6" width="2.4" height="4.2" rx="1.2" />
      <rect x="10.8" y="18.2" width="2.4" height="4.2" rx="1.2" />
      <rect x="10.8" y="1.6" width="2.4" height="4.2" rx="1.2" transform="rotate(90 12 12)" />
      <rect x="10.8" y="18.2" width="2.4" height="4.2" rx="1.2" transform="rotate(90 12 12)" />
      <rect x="10.8" y="1.6" width="2.4" height="4.2" rx="1.2" transform="rotate(45 12 12)" />
      <rect x="10.8" y="18.2" width="2.4" height="4.2" rx="1.2" transform="rotate(45 12 12)" />
      <rect x="10.8" y="1.6" width="2.4" height="4.2" rx="1.2" transform="rotate(135 12 12)" />
      <rect x="10.8" y="18.2" width="2.4" height="4.2" rx="1.2" transform="rotate(135 12 12)" />
    </svg>
  );
}
