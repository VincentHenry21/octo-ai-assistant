import type { JSX } from 'react';

const paths: Record<string, JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  chat: <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4v-14a1 1 0 0 1 0-1z" />,
  tasks: <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3 7 2 2 5-5" />,
  memory: <path d="M12 3a7 7 0 1 0 0 18c1.5 0 2-.8 2-2v-2a2 2 0 0 0-2-2h-1a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h4" />,
  settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2 .3a7 7 0 0 0-.5-1.4l1.4-1.6-2-2-1.6 1.4a7 7 0 0 0-1.4-.5L14.5 6h-5l-.3 2a7 7 0 0 0-1.4.5L6.2 7.1l-2 2L5.6 10.7a7 7 0 0 0-.5 1.4L3 12.5v3l2 .3a7 7 0 0 0 .5 1.4L4.1 18.8l2 2 1.6-1.4a7 7 0 0 0 1.4.5l.3 2h5l.3-2a7 7 0 0 0 1.4-.5l1.6 1.4 2-2-1.4-1.6a7 7 0 0 0 .5-1.4l2-.3z" />,
  mic: <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm7-3a7 7 0 0 1-14 0M12 18v3" />,
  send: <path d="M3 12 21 3l-9 18-2.5-7.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />,
  copy: <path d="M8 8h11v12H8zM4 4h11v3" />,
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm10 17-5-5" />,
  core: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><circle cx="12" cy="5" r="1.4" /><circle cx="19" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /><circle cx="5" cy="12" r="1.4" /></>,
  camera: <><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  avatar: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  flip: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  bolt: <path d="M13 2 5 14h6l-1 8 8-12h-6z" />,
};

export function Icon({ name, size = 22, label }: { name: keyof typeof paths; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label || name}>
      {paths[name]}
    </svg>
  );
}
