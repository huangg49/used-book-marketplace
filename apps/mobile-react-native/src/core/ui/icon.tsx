import Svg, { Path } from "react-native-svg";
import { colors as c } from "./theme";
const paths = {
  wallet: "M3 5h16v4M3 5v14h18V9H3V5Zm18 6h-6v6h6M17 14h.01",
  search: "M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  person: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
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
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  bag: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0",
  gavel: "m14 13-7.5 7.5a2.12 2.12 0 1 1-3-3L11 10m3 3 3-3m-3 3-2-2m5-1 4-4a2.12 2.12 0 0 0-3-3l-4 4m3 3L11 10",
  tag: "m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h8.59l9.99 9.99a2 2 0 0 1 0 2.82ZM7 7h.01",
  sync: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
  diamond: "M6 3h12l4 6-10 12L2 9Z",
  truck: "M1 3h15v13H1ZM16 8h4l3 3v5h-7V8ZM5.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  ticket: "M2 9a3 3 0 0 1 0 6v5h20V15a3 3 0 0 1 0-6V4H2ZM9 9h6M9 15h6",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-1.63-1.5-2.5-1.5-4.5 0-1.5.5-2.5 1.5-3.5-3 1.5-5 4-5 7.5ZM12 2c5 5 8 9.5 8 13.5a8 8 0 1 1-16 0c0-4 3-8.5 8-13.5Z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  heart: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z",
  home: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM9 22V12h6v10",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  celebration: "m12 2 2.4 7.2h7.6l-6.2 4.5 2.4 7.3-6.2-4.5-6.2 4.5 2.4-7.3-6.2-4.5h7.6z",
  mic: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm5 9a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z",
  explore: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.47 6.53-2.12 5.3a1 1 0 0 1-.58.58l-5.3 2.12 2.12-5.3a1 1 0 0 1 .58-.58Z",
  filterList: "M10 18h4v-2h-4v2ZM3 6v2h18V6H3Zm3 7h12v-2H6v2Z",
  mail: "M3 5h18v14H3V5zm0 0l9 7 9-7",
  lock: "M5 11h14v10H5V11zm3 0V7a4 4 0 0 1 8 0v4",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
  pen: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  dotsVertical: "M12 12h.01M12 5h.01M12 19h.01",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  verified: "M12 2l2.4 2.4 3.4-.4 1.2 3.2 3 1.6-1 3.2 1 3.2-3 1.6-1.2 3.2-3.4-.4L12 22l-2.4-2.4-3.4.4-1.2-3.2-3-1.6 1-3.2-1-3.2 3-1.6 1.2-3.2 3.4.4L12 2zm-2 10l-2-2-1.4 1.4L10 14.8l6.4-6.4-1.4-1.4L10 12z",
  swap: "M7 10h14l-4-4m4 8H3l4 4",
  clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v4l3 2",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 22,
  color = c.forest,
  filled = false,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}
