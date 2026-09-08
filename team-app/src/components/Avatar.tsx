import type { Player } from '../types/database';

export function Avatar({ player, size }: { player: Player; size: 'xs' | 'sm' | 'lg' }) {
  const dims =
    size === 'lg' ? 'h-24 w-24 text-2xl' : size === 'sm' ? 'h-16 w-16 text-lg' : 'h-6 w-6 text-[10px]';
  const initials = player.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (player.photo_url) {
    return (
      <img
        src={player.photo_url}
        alt=""
        className={`${dims} shrink-0 rounded-full object-cover ring-2 ring-white shadow`}
      />
    );
  }
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center rounded-full bg-tbw-navy font-bold text-white shadow`}
    >
      {initials}
    </div>
  );
}
