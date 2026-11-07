import { useSyncExternalStore } from 'react';
import { listingActions } from '../services/my-listings';

export function useListingActions(listingId?: string) {
  useSyncExternalStore(listingActions.subscribe, listingActions.getVersion, () => 0);
  return listingActions.pending().filter(action => !listingId || action.listingId === listingId);
}
