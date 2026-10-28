import { useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { attachEcosystemPlayback } from "./ecosystem-playback";
import styles from "./SkyMetric.module.css";

const base = `${import.meta.env.BASE_URL}ecosystems/sky/`;
const detailsBase = `${import.meta.env.BASE_URL}ecosystems/details-v2/`;
export function SkyMetric({ value, days }: { value: number | null; days: 7 | 30 }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof attachEcosystemPlayback> | null>(null);
  const [ready, setReady] = useState(false), [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const pausedRef = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    const scene = attachEcosystemPlayback(host.current, "skyPlaying");
    scene.pause(pausedRef.current); runtime.current = scene;
    setReady(false); setFailed(false);
    void Promise.all(Array.from(host.current.querySelectorAll("img"), img => img.decode())).then(() => {
      if (alive) { scene.ready(true); setReady(true); }
    }).catch(() => { if (alive) { scene.ready(false); setReady(false); setFailed(true); } });
    return () => { alive = false; scene.dispose(); runtime.current = null; };
  }, [attempt]);
  const image = (file: string, className: string, shared = false) => <img
    src={`${shared ? detailsBase : base}${file}.webp`} alt="" className={className} decoding="async"
    onError={event => { event.currentTarget.hidden = true; }} />;
  return <div ref={host} className={styles.sky} data-sky-playing="false">
    <div key={attempt} className={styles.scene} aria-hidden="true">
      {image("sky", styles.backdrop)}
      {image("cloud", styles.cloudBack)}
      <span className={styles.balloonFlight}>
        {image("balloon", styles.canopy)}
        <span className={styles.cargo}>
          {image("books", styles.books)}
          {image("basket", styles.basket)}
        </span>
      </span>
      {image("kite", styles.kite)}
      <span className={styles.birdFlight}>
        {image("blue-bird-body", styles.birdBody, true)}
        {image("blue-bird-wing", styles.wing, true)}
      </span>
      <span className={styles.planeFlight}>{image("paper-plane", styles.plane)}</span>
      {image("feather", styles.feather, true)}
      <span className={styles.distantBalloon}>
        {image("balloon", styles.distantCanopy)}
        {image("basket", styles.distantBasket)}
      </span>
      {image("cloud", styles.cloudLeft)}
      {image("cloud", styles.cloudRight)}
      <span className={styles.spark} /><span className={styles.sparkTwo} />
    </div>
    <dt className={styles.label}>Lượt gửi duyệt <small>trong {days} ngày</small></dt>
    <dd className={styles.value}>{value ?? "—"}</dd>
    <p className={styles.caption}>Tính cả các lần gửi lại</p>
    <button className={styles.pause} type="button" disabled={!ready && !failed} aria-pressed={failed ? undefined : paused}
      aria-label={failed ? "Tải lại cảnh bầu trời" : paused ? "Tiếp tục chuyển động bầu trời" : "Tạm dừng chuyển động bầu trời"}
      title={failed ? "Chưa tải đủ cảnh. Bấm để thử lại." : ready ? (paused ? "Tiếp tục bầu trời" : "Tạm dừng bầu trời") : "Bầu trời tĩnh"}
      onClick={() => {
        if (failed) { setAttempt(n => n + 1); return; }
        const next = !paused; pausedRef.current = next; runtime.current?.pause(next); setPaused(next);
      }}>
      {failed ? <RefreshCw size={16} aria-hidden="true" /> : paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
    </button>
    <span className={styles.srOnly}>Cảnh bầu trời là hình trang trí, không biểu thị số hồ sơ.</span>
  </div>;
}
