import { CosmeticsPanel } from '../components/CosmeticsPanel';
import { PageHeader } from '../components/PageHeader';
import { PAGE_WIDTH } from '../utils/layout';

/**
 * The Cosmetics tab (`/cosmetics`): the card backs and playmats (CosmeticsPanel), used, bought with banked ₱, or unlocked
 * by beating a Gym Challenge or Champion run.
 */
export function CosmeticsPage() {
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader title="Cosmetics" />
      <CosmeticsPanel />
    </div>
  );
}
