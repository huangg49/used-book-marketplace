import { createContext, useContext } from "react";

type StartJourney = (target: string, source: HTMLElement | null) => Promise<void>;
export const JourneyContext = createContext<StartJourney | null>(null);
// Destination entrances can yield to the successful Login's paper transition.
export const PaperArrivalContext = createContext(false);
export function usePaperJourney() {
  const start = useContext(JourneyContext);
  if (!start) throw new Error("Paper journey requires PaperStormLayout");
  return start;
}
