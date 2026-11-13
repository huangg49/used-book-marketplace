import { z } from "zod";

export const demoExchangeDeadlineSchema = z.enum([
  "Proposal", "Funding", "Shipping", "Transit", "Inspection",
  "Evidence", "Appeal", "Return", "ReturnCheck",
]);
export type DemoExchangeDeadline = z.infer<typeof demoExchangeDeadlineSchema>;

export const demoExchangeDeadlineLabel: Record<DemoExchangeDeadline, string> = {
  Proposal: "hạn phản hồi",
  Funding: "hạn đặt cọc",
  Shipping: "hạn gửi sách",
  Transit: "hạn vận chuyển",
  Inspection: "hạn kiểm tra",
  Evidence: "hạn bổ sung bằng chứng",
  Appeal: "hạn kháng nghị",
  Return: "hạn trả sách",
  ReturnCheck: "hạn kiểm tra sách hoàn",
};
