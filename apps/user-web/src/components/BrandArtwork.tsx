import { useState, type ComponentPropsWithoutRef } from "react";

type Artwork = "logo-original" | "hero-lettering";
type BrandArtworkProps = Omit<ComponentPropsWithoutRef<"img">, "src" | "srcSet" | "onError"> & {
  artwork: Artwork;
};

/** Prefer the pixel-identical WebP, with the original PNG as a one-time fallback. */
export function BrandArtwork({ artwork, ...props }: BrandArtworkProps) {
  const [failed, setFailed] = useState<Artwork>();
  const fallback = failed === artwork;
  return (
    <img
      {...props}
      src={`/brand/${artwork}.${fallback ? "png" : "webp"}`}
      onError={fallback ? undefined : () => setFailed(artwork)}
    />
  );
}
