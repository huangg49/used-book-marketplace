import React from "react";
import { router } from "expo-router";
import { Button } from "../../core/ui";
import type { Exchange } from "./contracts";

// One review journey retains ADR0052 editing, publication and replay semantics.
export function ExchangeReviewsCard({ exchange }: { exchange: Exchange }) {
  if (exchange.status !== "Completed") return null;
  return (
    <Button
      wine
      secondary
      title="Xem hoặc viết đánh giá"
      onPress={() =>
        router.push({
          pathname: "/reviews",
          params: { type: "Exchange", id: exchange.id },
        })
      }
    />
  );
}
