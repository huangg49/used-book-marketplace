import { BookCard, type BookCardProps } from "../../core/ui";

export type SearchBookCardProps = BookCardProps;

export function SearchBookCard(props: SearchBookCardProps) {
  return <BookCard variant="search" showAuthor {...props} />;
}
