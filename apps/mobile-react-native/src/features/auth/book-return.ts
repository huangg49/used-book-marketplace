import { z } from "zod";

// Only a book ID can be returned to; never accept an arbitrary redirect URL.
export function returnBookId(value: string | string[] | undefined) {
  const result = z.string().uuid().safeParse(value);
  return result.success ? result.data : undefined;
}
