export interface BrandIconProps {
  size?: number;
  className?: string;
  variant?: "owl" | "symbol";
}

/**
 * Official Lật Lại Brand Icon
 * - "owl": Crops the official owner-approved owl mascot from /brand/logo-original.png
 * - "symbol": Pure SVG of the Lật Lại open book with page-turning motif
 */
export function BrandIcon({
  size = 14,
  className,
  variant = "owl",
}: BrandIconProps) {
  if (variant === "symbol") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{
          display: "inline-block",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <path d="M12 28 Q34 17 58 34 L58 108 Q34 91 12 99 Z" />
        <path d="M70 34 Q90 20 116 27 L116 99 Q91 92 70 108 Z" />
        <path d="M70 34 L92 9 L92 65 L70 86 Z" opacity="0.85" />
      </svg>
    );
  }

  // Ratio from Header: width 52, height 42
  const height = size;
  const width = Math.round(size * (52 / 42));
  const scale = size / 42;
  const imgWidth = Math.round(240 * scale);
  const imgLeft = Math.round(-94 * scale);
  const imgTop = Math.round(-72 * scale);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
        overflow: "hidden",
        verticalAlign: "middle",
        flexShrink: 0,
        borderRadius: "2.5px",
        boxShadow: "0 1px 2px rgba(92, 2, 2, 0.2)",
      }}
      aria-hidden="true"
    >
      <img
        src="/brand/logo-original.png"
        alt=""
        style={{
          position: "absolute",
          width: `${imgWidth}px`,
          maxWidth: "none",
          left: `${imgLeft}px`,
          top: `${imgTop}px`,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}
