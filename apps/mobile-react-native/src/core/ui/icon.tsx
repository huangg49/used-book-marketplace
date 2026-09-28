import Svg, { Path } from "react-native-svg";
import { colors as c } from "./theme";
const paths = {
  search: "M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  plus: "M12 5v14M5 12h14",
  back: "M19 12H5m6-6-6 6 6 6",
  close: "m6 6 12 12M18 6 6 18",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  book: "M12 5v16M3 3c4 0 6 0 9 2 3-2 5-2 9-2v16c-4 0-6 0-9 2-3-2-5-2-9-2V3Z",
  check: "m5 12 4 4L19 6",
  image: "M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M8 7h.01",
  tune: "M4 7h16M4 17h16M9 4v6M15 14v6",
  pin: "M12 22s7-8 7-13a7 7 0 1 0-14 0c0 5 7 13 7 13Zm0-16a3 3 0 1 1 0 6 3 3 0 0 1 0-6",
  info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  wifi: "m3 3 18 18M2 8a17 17 0 0 1 4-2m4-1a17 17 0 0 1 12 3M5 12a12 12 0 0 1 5-2m4 0 5 2M8 16a6 6 0 0 1 6-1M12 20h.01",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 22,
  color = c.forest,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}
