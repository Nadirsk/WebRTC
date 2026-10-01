import { statusLabel, type ProductStatus } from '@/content/products';

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>;
}
