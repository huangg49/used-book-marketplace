import { File } from "expo-file-system";
export async function photoBytes(
  uri: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const file = new File(uri);
  if (file.size > 10_000_000) throw new Error("PhotoTooLarge");
  return new Uint8Array(await file.arrayBuffer());
}
