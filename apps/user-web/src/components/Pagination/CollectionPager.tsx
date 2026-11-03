import { Pagination, type PaginationProps } from './Pagination';
import { useEffect, useRef } from 'react';
import { getLenis } from '../../hooks/useSmoothScroll';
import styles from './CollectionPager.module.css';

export function CollectionPager({ model, itemLabel, label, anchorId }: {
  model: { visible: boolean; busy: boolean; error?: string; props: PaginationProps };
  itemLabel: string;
  label?: string;
  anchorId?: string;
}) {
  const requested = useRef<number | undefined>(undefined);
  const previous = useRef(model.props.page);
  useEffect(() => {
    if (previous.current !== model.props.page) {
      if (requested.current === model.props.page && anchorId) {
        const start = document.getElementById(anchorId);
        const lenis = getLenis();
        if (start && lenis) lenis.scrollTo(start, { offset: -112, duration: 0.65 });
        else start?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        start?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus({ preventScroll: true });
      }
      requested.current = undefined;
      previous.current = model.props.page;
    }
  }, [model.props.page, anchorId]);
  if (!model.visible) return null;
  return <div className={styles.footer}>
    {model.error && <p className={styles.error} role="alert">{model.error}</p>}
    {model.busy && <p className={styles.status} role="status">Đang tải trang tiếp theo…</p>}
    <Pagination {...model.props} itemLabel={itemLabel} ariaLabel={label}
      onPageChange={page => { requested.current = page; model.props.onPageChange(page); }} />
  </div>;
}
