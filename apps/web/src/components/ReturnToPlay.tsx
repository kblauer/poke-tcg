import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from '@tanstack/react-router';

/**
 * Back to the Play tab's menu of modes (the user's: on a run, under way or finished, a Battle Tower challenge under way,
 * Training); a mode's tile on the menu opens what's under way in it again.
 */
export function ReturnToPlay({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-1.5 rounded bg-slate-600 px-4 py-2 text-sm font-semibold transition hover:bg-slate-500 active:scale-95 ${className}`}>
      <ArrowBackIcon sx={{ fontSize: 16 }} /> Return to Play
    </Link>
  );
}
