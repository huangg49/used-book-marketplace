import { z } from "zod";
import { session } from "../lib/session";

const serviceAreasSchema = z.object({
  code: z.literal("HCM-DEMO-v1"),
  name: z.literal("TP.HCM"),
  demoOnly: z.literal(true),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});

export const serviceAreasQuery = {
  queryKey: ["service-areas"] as const,
  queryFn: () => session.request("/service-areas", serviceAreasSchema),
};
