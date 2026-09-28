import { z } from "zod";
import type { components } from "@used-books/api-contract";
export type AddressInput = components["schemas"]["AddressInput"];
export type Address = components["schemas"]["PrivateAddress"];
export const addressBook = z.object({
  version: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        recipientName: z.string(),
        phone: z.string(),
        serviceAreaCode: z.string(),
        localityCode: z.string(),
        detail: z.string(),
        isDefault: z.boolean(),
      }),
    )
    .max(10),
});
export const directory = z.object({
  code: z.literal("HCM-DEMO-v1"),
  name: z.literal("TP.HCM"),
  demoOnly: z.literal(true),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
export const addressReceipt = z.object({
  id: z.string().uuid(),
  entityType: z.literal("AddressBook"),
  entityId: z.string().uuid(),
  version: z.number().int(),
  addressId: z.string().uuid(),
  serverTime: z.string(),
});
export const emptyAddress: AddressInput = {
  recipientName: "",
  phone: "",
  serviceAreaCode: "HCM-DEMO-v1",
  localityCode: "",
  detail: "",
};
export type AddressErrors = Partial<Record<keyof AddressInput, string>>;
const controls = (text: string) =>
  [...text].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
export function cleanAddress(a: AddressInput): AddressInput {
  return {
    ...a,
    recipientName: a.recipientName.trim(),
    phone: a.phone.trim(),
    detail: a.detail.trim(),
  };
}
export function validateAddress(
  a: AddressInput,
  localities: string[],
): AddressErrors {
  const v = cleanAddress(a),
    e: AddressErrors = {};
  if (
    [...v.recipientName].length < 2 ||
    [...v.recipientName].length > 100 ||
    controls(v.recipientName)
  )
    e.recipientName = "Nhập tên từ 2 đến 100 ký tự, không xuống dòng.";
  if (!/^0[0-9]{9}$/.test(v.phone)) e.phone = "Nhập 10 chữ số, bắt đầu bằng 0.";
  if (
    [...v.detail].length < 5 ||
    [...v.detail].length > 300 ||
    controls(v.detail)
  )
    e.detail = "Nhập địa chỉ từ 5 đến 300 ký tự, không xuống dòng.";
  if (
    v.serviceAreaCode !== "HCM-DEMO-v1" ||
    !localities.includes(v.localityCode)
  )
    e.localityCode = "Chọn khu vực phục vụ.";
  return e;
}
