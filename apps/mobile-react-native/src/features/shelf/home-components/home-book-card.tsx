import { BookCard, type BookCardProps } from "../../../core/ui";

export type HomeBookCardProps = BookCardProps;

export function HomeBookCard(props: HomeBookCardProps) {
  return <BookCard variant="shelf" {...props} />;
}
