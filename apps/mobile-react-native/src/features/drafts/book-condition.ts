import type { components } from "@used-books/api-contract";
import { z } from "zod";

export const bookCondition = z.enum(["LikeNew", "Good", "Fair", "Worn"]);

export const conditionLabels = {
  LikeNew: "Gần như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
} satisfies Record<components["schemas"]["BookCondition"], string>;

export const conditionOptions = bookCondition.options.map((value) => ({
  value,
  label: conditionLabels[value],
}));
