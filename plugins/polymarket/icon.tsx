import type React from "react";

export function PolymarketIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      fill="none"
      role="img"
      style={style}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Polymarket</title>
      <circle cx="16" cy="16" fill="#0E1E38" r="15" stroke="#1E3A8A" strokeWidth="2" />
      <path
        d="M10 20.5L16 9.5L22 20.5H18L16 16.5L14 20.5H10Z"
        fill="#3B82F6"
      />
      <path
        d="M16 13L19 18.5H13L16 13Z"
        fill="#60A5FA"
      />
    </svg>
  );
}
