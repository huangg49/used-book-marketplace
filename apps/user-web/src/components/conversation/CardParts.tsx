import type { ReactNode } from "react";
import { Clock3 } from "lucide-react";
import type { Fact } from "./transaction-status";
import card from "./TransactionCard.module.css";

/** The next step, always shown, so every card answers "what now?". */
export function NextStep({ children }: { children: ReactNode }) {
  return (
    <p className={card.callout}>
      <Clock3 size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Two or three short facts in one row, the same place on every card. */
export function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className={card.facts}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
