import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from '@tanstack/react-router';

/**
 * Back to the Play tab's menu of modes (the user's: on a finished run, Training); "Return to Play" (`label`) from a run or a
 * Battle Tower challenge under way, which the mode's tile on the menu opens again.
 */
export function ReturnToHome({ className = '', label = 'Return to Home' }: { className?: string; label?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-1.5 rounded bg-slate-600 px-4 py-2 text-sm font-semibold transition hover:bg-slate-500 active:scale-95 ${className}`}>
      <ArrowBackIcon sx={{ fontSize: 16 }} /> {label}
    </Link>
  );
}
