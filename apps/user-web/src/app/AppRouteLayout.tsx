import { PaperStormLayout } from '../components/auth/PaperStormLayout';
import { RouteNavigationStatus } from './RouteFeedback';
import { useGlobalSmoothScroll } from '../hooks/useSmoothScroll';

export function AppRouteLayout() {
  useGlobalSmoothScroll();
  return <><RouteNavigationStatus /><PaperStormLayout /></>;
}
