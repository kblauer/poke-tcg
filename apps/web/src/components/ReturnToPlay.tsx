import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from '@tanstack/react-router';

/**
 * Back to the Play tab's menu of modes (the user's: on a run, under way or finished, a Battle Tower challenge under way,
 * Training); a mode's tile on the menu opens what's under way in it again. `small`: a phone's run heading's, on one line with it.
 */
export function ReturnToPlay({ className = '', small = false }: { className?: string; small?: boolean }) {
  return (
    <Link to="/" className={`inline-flex shrink-0 items-center whitespace-nowrap rounded bg-slate-600 font-semibold transition hover:bg-slate-500 active:scale-95 ${small ? 'gap-1 px-2 py-1 text-xs' : 'gap-1.5 px-4 py-2 text-sm'} ${className}`}>
      <ArrowBackIcon sx={{ fontSize: small ? 14 : 16 }} /> Return to Play
    </Link>
  );
}
