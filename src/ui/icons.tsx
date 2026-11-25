/**
 * Tessera icon set: authored on a 20px grid, 1.5px stroke, round joins.
 * One family for dock, palette, Atlas, blocks and controls.
 */
const P: Record<string, JSX.Element> = {
  note: <><path d="M5 4.5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" /><path d="M7 8h6M7 11h6M7 14h3.5" /></>,
  todo: <><path d="m4.5 6.2 1.4 1.4 2.4-2.6M4.5 12.2l1.4 1.4 2.4-2.6" /><path d="M10.5 6.5h5M10.5 12.5h5" /></>,
  link: <><path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M11.4 8.6a3 3 0 0 0-4.2 0l-2.3 2.3a3 3 0 0 0 4.2 4.2l.9-.9" /></>,
  board: <><rect x="4" y="4" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="4" width="4.5" height="3.5" rx="1" /><rect x="11.5" y="9.5" width="4.5" height="6.5" rx="1" /><rect x="4" y="11.5" width="5.5" height="4.5" rx="1" /></>,
  frame: <><path d="M4 7V5a1 1 0 0 1 1-1h2M13 4h2a1 1 0 0 1 1 1v2M16 13v2a1 1 0 0 1-1 1h-2M7 16H5a1 1 0 0 1-1-1v-2" /></>,
  image: <><rect x="4" y="4.5" width="12" height="11" rx="1.5" /><circle cx="8" cy="8.5" r="1.2" /><path d="m4.5 14 3.6-3.4 2.6 2.4 2-1.8 2.8 2.6" /></>,
  file: <><path d="M6 3.8h5l3.2 3.2V16a.7.7 0 0 1-.7.7H6a.7.7 0 0 1-.7-.7V4.5a.7.7 0 0 1 .7-.7Z" /><path d="M11 3.8V7h3.2" /></>,
  upload: <><path d="M10 13V4.5M6.8 7.6 10 4.4l3.2 3.2" /><path d="M4.5 12.5v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2" /></>,
  download: <><path d="M10 4.5V13M6.8 9.8 10 13l3.2-3.2" /><path d="M4.5 15.5h11" /></>,
  search: <><circle cx="9" cy="9" r="4.8" /><path d="m12.6 12.6 3.4 3.4" /></>,
  plus: <path d="M10 5v10M5 10h10" />,
  minus: <path d="M5 10h10" />,
  fit: <><path d="M4 7.5V4h3.5M16 7.5V4h-3.5M4 12.5V16h3.5M16 12.5V16h-3.5" /></>,
  open: <><path d="M8 5h7v7M15 5l-9.5 9.5" /></>,
  collapse: <><rect x="3.5" y="4" width="13" height="12" rx="2" /><path d="M8 4v12M12.5 8.2 10.6 10l1.9 1.8" /></>,
  expand: <><rect x="3.5" y="4" width="13" height="12" rx="2" /><path d="M8 4v12M10.8 8.2l1.9 1.8-1.9 1.8" /></>,
  chevron: <path d="m8 6 4 4-4 4" />,
  undo: <><path d="M7.5 6 4.5 9l3 3" /><path d="M5 9h7a3.5 3.5 0 0 1 0 7H9" /></>,
  redo: <><path d="M12.5 6l3 3-3 3" /><path d="M15 9H8a3.5 3.5 0 0 0 0 7h3" /></>,
  copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>,
  trash: <><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.3a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6" /></>,
  select: <><path d="M5 4.5 15 9l-4.3 1.4L9.2 15Z" /></>,
  home: <><path d="M4 9.2 10 4.5l6 4.7V15a1 1 0 0 1-1 1h-3v-4H8v4H5a1 1 0 0 1-1-1Z" /></>,
  up: <><path d="M10 15.5V5M6 9l4-4 4 4" /></>,
  contrast: <><circle cx="10" cy="10" r="6" /><path d="M10 4a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" /></>,
  export: <><path d="M10 12V4M7 7l3-3 3 3" /><path d="M5 10.5v4A1.5 1.5 0 0 0 6.5 16h7a1.5 1.5 0 0 0 1.5-1.5v-4" /></>,
  import: <><path d="M10 4v8M7 9l3 3 3-3" /><path d="M5 10.5v4A1.5 1.5 0 0 0 6.5 16h7a1.5 1.5 0 0 0 1.5-1.5v-4" /></>,
  folder: <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H8l1.5 1.5h5A1.5 1.5 0 0 1 16 8v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14Z" />,
  command: <><path d="M7.5 7.5h5v5h-5Z" /><path d="M7.5 7.5V6a1.5 1.5 0 1 0-1.5 1.5Zm5 0H14a1.5 1.5 0 1 0-1.5-1.5Zm0 5V14a1.5 1.5 0 1 0 1.5-1.5Zm-5 0H6a1.5 1.5 0 1 0 1.5 1.5Z" /></>,
  edit: <><path d="M12.6 4.8 15.2 7.4 8 14.6l-3.3.7.7-3.3Z" /><path d="m11.2 6.2 2.6 2.6" /></>,
  front: <><rect x="7.5" y="7.5" width="8.5" height="8.5" rx="1.5" /><path d="M12.5 4.5H5.5A1 1 0 0 0 4.5 5.5v7" strokeDasharray="1.6 1.8" /></>,
  back: <><rect x="4" y="4" width="8.5" height="8.5" rx="1.5" strokeDasharray="1.6 1.8" /><path d="M7.5 15.5h7.5a1 1 0 0 0 1-1v-7" /></>,
  move: <><path d="M4 10h9M10 6.5 13.5 10 10 13.5" /><path d="M16 4.5v11" /></>,
  paste: <><rect x="5" y="5" width="10" height="11.5" rx="1.5" /><path d="M8 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" /><path d="M8 10h4M8 13h2.5" /></>,
  'win-min': <path d="M5.5 10.5h9" />,
  'win-max': <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />,
  'win-restore': <><rect x="5" y="7.5" width="7.5" height="7.5" rx="1.3" /><path d="M7.5 5.5h5.5a1.5 1.5 0 0 1 1.5 1.5v5.5" /></>,
  'win-close': <path d="m6 6 8 8M14 6l-8 8" />,
  fullscreen: <><path d="M4.5 8V4.5H8M12 4.5h3.5V8M15.5 12v3.5H12M8 15.5H4.5V12" /></>,
  keyboard: <><rect x="3.5" y="5.5" width="13" height="9" rx="1.5" /><path d="M6.5 8.5h.01M9 8.5h.01M11.5 8.5h.01M14 8.5h-.5M7 11.5h6" /></>,
  info: <><circle cx="10" cy="10" r="6.5" /><path d="M10 9.2v4M10 6.8h.01" /></>,
  quit: <><path d="M11.5 4.5h-6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6" /><path d="M9 10h7.5M13.5 7l3 3-3 3" /></>,
  'line-curve': <path d="M4.5 15c1.5-6.5 4.5-9.5 11-10.5" />,
  'line-straight': <path d="M4.5 15.5 15.5 4.5" />,
  'line-elbow': <path d="M4.5 15.5h5.5V4.5h5.5" />,
  'arrow-end': <><path d="M4 10h11" /><path d="m12 7 3 3-3 3" /></>,
  'arrow-both': <><path d="M5 10h10" /><path d="m12 7 3 3-3 3M8 7l-3 3 3 3" /></>,
  'arrow-none': <path d="M4 10h12" />,
  reset: <><path d="M5 9.5a5.2 5.2 0 1 1 1.6 4.3" /><path d="M5 5.5v4h4" /></>,
  axes: <><path d="M4.5 15.5V9.5h6V4.5h5" /><path d="M4.5 4.5v2M4.5 4.5h2" strokeDasharray="1.5 1.5" /></>,
  'bend-remove': <><path d="M3.5 14c2-5 4-7.5 6.5-7.5S14.5 9 16.5 14" strokeDasharray="2 2" /><circle cx="10" cy="6.5" r="2.2" /><path d="m8.6 5.1 2.8 2.8M11.4 5.1 8.6 7.9" /></>,
  thread: <><circle cx="5.5" cy="14.5" r="1.6" /><circle cx="14.5" cy="5.5" r="1.6" /><path d="M6.8 13.2c1.4-4.6 2.8-6.1 6.4-6.4" /></>,
};

export type IconName = keyof typeof P;
export const hasIcon = (n: string): n is IconName => n in P;

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const body = P[name] ?? P.note;
  return <svg className={'ic' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{body}</svg>;
}
