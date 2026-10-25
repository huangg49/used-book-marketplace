import { AutumnLeavesCanvas } from "./AutumnLeavesCanvas";
import styles from "./AutumnAerialMapBackground.module.css";

export function AutumnAerialMapBackground() {

  return (
    <div className={styles.container} aria-hidden="true">
      <div className={styles.artboard}>
        {/* Layer 0: Subtle Earth Texture Grid */}
        <div className={styles.textureGrid} />

        {/* Layer 1: Master Illustrated Autumn Aerial Map SVG */}
        <svg
          viewBox="0 0 760 760"
          className={styles.mapSvg}
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Field Hatch Patterns */}
            <pattern
              id="aerial-hatch-ripe"
              width="20"
              height="20"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="20"
                stroke="#fef08a"
                strokeWidth="3"
                opacity="0.45"
              />
            </pattern>
            <pattern
              id="aerial-hatch-amber"
              width="22"
              height="22"
              patternTransform="rotate(-45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="22"
                stroke="#ea580c"
                strokeWidth="3.5"
                opacity="0.35"
              />
            </pattern>
            <pattern
              id="aerial-hatch-gold"
              width="18"
              height="18"
              patternTransform="rotate(25 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="18"
                stroke="#ca8a04"
                strokeWidth="2.5"
                opacity="0.35"
              />
            </pattern>

            {/* Autumn River Gradient */}
            <linearGradient
              id="aerial-riverGrad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="50%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>

            {/* Soft Shadow for Elements */}
            <filter
              id="aerial-shadow"
              x="-20%"
              y="-20%"
              width="150%"
              height="150%"
            >
              <feDropShadow
                dx="3"
                dy="6"
                stdDeviation="5"
                floodColor="#452718"
                floodOpacity="0.22"
              />
            </filter>
          </defs>

          {/* Base Earth Plot */}
          <rect width="760" height="760" fill="#edd6bc" />

          {/* Top-Left Terraced Region */}
          <rect x="40" y="40" width="160" height="110" rx="14" fill="#fbbf24" />
          <rect
            x="40"
            y="40"
            width="160"
            height="110"
            rx="14"
            fill="url(#aerial-hatch-gold)"
          />

          <rect x="220" y="40" width="160" height="110" rx="14" fill="#f59e0b" />
          <rect
            x="220"
            y="40"
            width="160"
            height="110"
            rx="14"
            fill="url(#aerial-hatch-ripe)"
          />

          <rect x="40" y="170" width="160" height="150" rx="14" fill="#fef08a" />
          <rect x="220" y="170" width="160" height="150" rx="14" fill="#d97706" />

          {/* Top-Right Terraced Region */}
          <rect x="440" y="40" width="150" height="110" rx="14" fill="#ea580c" />
          <rect
            x="440"
            y="40"
            width="150"
            height="110"
            rx="14"
            fill="url(#aerial-hatch-amber)"
          />

          <rect x="610" y="40" width="110" height="110" rx="14" fill="#b45309" />

          <rect x="440" y="170" width="150" height="150" rx="14" fill="#fbbf24" />
          <rect
            x="440"
            y="170"
            width="150"
            height="150"
            rx="14"
            fill="url(#aerial-hatch-gold)"
          />

          <rect x="610" y="170" width="110" height="150" rx="14" fill="#9a3412" />

          {/* Middle Valley Region */}
          <rect x="40" y="340" width="190" height="170" rx="14" fill="#f59e0b" />

          <rect x="250" y="340" width="130" height="170" rx="14" fill="#ea580c" />
          <rect
            x="250"
            y="340"
            width="130"
            height="170"
            rx="14"
            fill="url(#aerial-hatch-amber)"
          />

          <rect x="440" y="340" width="190" height="170" rx="14" fill="#eab308" />
          <rect
            x="440"
            y="340"
            width="190"
            height="170"
            rx="14"
            fill="url(#aerial-hatch-ripe)"
          />

          <rect x="650" y="340" width="70" height="170" rx="14" fill="#78350f" />

          {/* Bottom Region */}
          <rect x="40" y="530" width="130" height="190" rx="14" fill="#facc15" />
          <rect
            x="40"
            y="530"
            width="130"
            height="190"
            rx="14"
            fill="url(#aerial-hatch-gold)"
          />

          <rect x="190" y="530" width="190" height="190" rx="14" fill="#c2410c" />

          <rect x="440" y="530" width="180" height="190" rx="14" fill="#eab308" />
          <rect
            x="440"
            y="530"
            width="180"
            height="190"
            rx="14"
            fill="url(#aerial-hatch-ripe)"
          />

          <rect x="640" y="530" width="80" height="190" rx="14" fill="#92400e" />

          {/* Rural Roads (Light paths with lane dashes) */}
          <g stroke="#ffffff" opacity="0.65">
            <line x1="20" y1="160" x2="740" y2="160" strokeWidth="14" />
            <line x1="20" y1="330" x2="740" y2="330" strokeWidth="16" />
            <line x1="20" y1="520" x2="740" y2="520" strokeWidth="14" />
            <line x1="210" y1="20" x2="210" y2="740" strokeWidth="14" />
            <line x1="600" y1="20" x2="600" y2="740" strokeWidth="14" />
          </g>

          <g stroke="#edd6bc" strokeWidth="2" strokeDasharray="8 8">
            <line x1="20" y1="160" x2="740" y2="160" />
            <line x1="20" y1="330" x2="740" y2="330" />
            <line x1="20" y1="520" x2="740" y2="520" />
            <line x1="210" y1="20" x2="210" y2="740" />
          </g>

          {/* Winding Autumn Stream */}
          <path
            d="M 405,0 C 400,120 425,180 410,300 C 395,420 420,530 405,650 C 395,710 425,760 425,760"
            fill="none"
            stroke="#0284c7"
            strokeWidth="38"
            strokeLinecap="round"
            filter="url(#aerial-shadow)"
          />
          <path
            d="M 405,0 C 400,120 425,180 410,300 C 395,420 420,530 405,650 C 395,710 425,760 425,760"
            fill="none"
            stroke="url(#aerial-riverGrad)"
            strokeWidth="30"
            strokeLinecap="round"
          />
          <path
            d="M 405,0 C 400,120 425,180 410,300 C 395,420 420,530 405,650 C 395,710 425,760 425,760"
            fill="none"
            stroke="#bae6fd"
            strokeWidth="4"
            strokeLinecap="round"
            className={styles.animateStream}
            opacity="0.8"
          />

          {/* Wooden Bridges */}
          <g filter="url(#aerial-shadow)">
            <rect x="382" y="148" width="58" height="24" rx="4" fill="#a16207" />
            <line x1="388" y1="154" x2="434" y2="154" stroke="#78350f" strokeWidth="2" />
            <line x1="388" y1="166" x2="434" y2="166" stroke="#78350f" strokeWidth="2" />
          </g>
          <g filter="url(#aerial-shadow)">
            <rect x="385" y="508" width="62" height="24" rx="4" fill="#78350f" />
            <line x1="390" y1="514" x2="442" y2="514" stroke="#451a03" strokeWidth="2" />
            <line x1="390" y1="526" x2="442" y2="526" stroke="#451a03" strokeWidth="2" />
          </g>

          {/* Rural Granaries / Houses */}
          <g filter="url(#aerial-shadow)">
            <rect x="235" y="185" width="28" height="20" rx="3" fill="#92400e" />
            <polygon points="230,195 249,180 268,195" fill="#b45309" />
          </g>
          <g filter="url(#aerial-shadow)">
            <rect x="525" y="380" width="26" height="18" rx="3" fill="#92400e" />
            <polygon points="520,388 538,375 556,388" fill="#d97706" />
          </g>

          {/* Swaying Autumn Trees (Ginkgo & Maple) */}
          <g>
            <g className={styles.treeNode} style={{ transformOrigin: "165px 145px" }}>
              <circle cx="165" cy="148" r="14" fill="#451a03" opacity="0.25" />
              <circle cx="165" cy="145" r="14" fill="#c2410c" />
              <circle cx="163" cy="142" r="5" fill="#ea580c" opacity="0.6" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "360px 320px" }}>
              <circle cx="360" cy="323" r="12" fill="#451a03" opacity="0.25" />
              <circle cx="360" cy="320" r="12" fill="#f59e0b" />
              <circle cx="358" cy="318" r="4" fill="#fef08a" opacity="0.6" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "685px 150px" }}>
              <circle cx="685" cy="153" r="15" fill="#451a03" opacity="0.25" />
              <circle cx="685" cy="150" r="15" fill="#ea580c" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "505px 255px" }}>
              <circle cx="505" cy="258" r="16" fill="#451a03" opacity="0.25" />
              <circle cx="505" cy="255" r="16" fill="#b45309" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "470px 190px" }}>
              <circle cx="470" cy="193" r="18" fill="#451a03" opacity="0.25" />
              <circle cx="470" cy="190" r="18" fill="#d97706" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "480px 510px" }}>
              <circle cx="480" cy="513" r="16" fill="#451a03" opacity="0.25" />
              <circle cx="480" cy="510" r="16" fill="#b91c1c" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "610px 600px" }}>
              <circle cx="610" cy="603" r="15" fill="#451a03" opacity="0.25" />
              <circle cx="610" cy="600" r="15" fill="#ea580c" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "125px 515px" }}>
              <circle cx="125" cy="518" r="14" fill="#451a03" opacity="0.25" />
              <circle cx="125" cy="515" r="14" fill="#d97706" />
            </g>
            <g className={styles.treeNode} style={{ transformOrigin: "142px 525px" }}>
              <circle cx="142" cy="528" r="16" fill="#451a03" opacity="0.25" />
              <circle cx="142" cy="525" r="16" fill="#c2410c" />
            </g>
          </g>
        </svg>

        {/* Layer 2: Floating Clouds */}
        <div className={styles.cloudsLayer}>
          <div className={styles.cloud1}>
            <svg width="150" height="75" viewBox="0 0 150 75" fill="none">
              <path
                d="M 25 50 A 20 20 0 0 1 55 30 A 26 26 0 0 1 100 24 A 24 24 0 0 1 135 50 Z"
                fill="#ffffff"
                fillOpacity="0.9"
              />
            </svg>
          </div>
          <div className={styles.cloud2}>
            <svg width="180" height="90" viewBox="0 0 180 90" fill="none">
              <path
                d="M 30 60 A 24 24 0 0 1 70 36 A 32 32 0 0 1 125 30 A 28 28 0 0 1 165 60 Z"
                fill="#ffffff"
                fillOpacity="0.88"
              />
            </svg>
          </div>
        </div>

        {/* Layer 3: Miniature Gliding Monoplane */}
        <div className={styles.planeLayer}>
          <div className={styles.animatePlane}>
            <svg
              width="52"
              height="52"
              viewBox="0 0 24 24"
              fill="none"
              style={{ filter: "drop-shadow(2px 14px 10px rgba(55,25,10,0.38))" }}
            >
              <path
                d="M21 16V14L13 9V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9L2 14V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z"
                fill="#ffffff"
                stroke="#c2410c"
                strokeWidth="0.8"
              />
              <circle cx="11.5" cy="5.5" r="1.2" fill="#ea580c" />
            </svg>
          </div>
        </div>

        {/* Layer 4: Interactive Golden Harvest Falling Leaves (Physics & 3D Flips) */}
        <div className={styles.leavesCanvasLayer}>
          <AutumnLeavesCanvas />
        </div>

        {/* Layer 5: Parchment Wash & Golden Hour Light Glow */}
        <div className={styles.parchmentWash} />
        <div className={styles.sunlightGlow} />
      </div>
    </div>
  );
}
