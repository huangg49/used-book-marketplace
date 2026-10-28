import { useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { attachForestPlayback } from "./forest-playback";
import styles from "./ForestMetric.module.css";

const base = `${import.meta.env.BASE_URL}ecosystems/forest/`;
export function ForestMetric({ value, days }: { value: number | null; days: 7 | 30 }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof attachForestPlayback> | null>(null);
  const [ready, setReady] = useState(false), [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const pausedRef = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    const scene = attachForestPlayback(host.current);
    scene.pause(pausedRef.current);
    runtime.current = scene;
    setReady(false); setFailed(false);
    void Promise.all(Array.from(host.current.querySelectorAll("img"), img => img.decode())).then(() => {
      if (alive) { scene.ready(true); setReady(true); }
    }).catch(() => { if (alive) { scene.ready(false); setReady(false); setFailed(true); } });
    return () => { alive = false; scene.dispose(); runtime.current = null; };
  }, [attempt]);
  const image = (file: string, className: string) => <img src={`${base}${file}.webp`} alt="" className={className} decoding="async" onError={event => { event.currentTarget.hidden = true; }} />;
  return <div ref={host} className={styles.forest} data-forest-playing="false">
    <div key={attempt} className={styles.scene} aria-hidden="true">
      {image("forest", styles.backdrop)}
      {image("tree", styles.treeBack)}
      {image("tree", styles.treeLeft)}
      {image("tree", styles.treeRight)}
      <span className={styles.fox}>
        {image("fox-tail", styles.tail)}
        {image("fox-body", styles.body)}
      </span>
      <span className={styles.bird}>
        {image("bird-body", styles.birdBody)}
        {image("bird-wing", styles.wing)}
      </span>
      <span className={styles.butterflyPath}>{image("butterfly", styles.butterfly)}</span>
      {image("fern", styles.fernLeft)}
      {image("fern", styles.fernRight)}
      {image("mushrooms", styles.mushrooms)}
      <span className={styles.mote} /><span className={styles.moteTwo} /><span className={styles.moteThree} />
    </div>
    <dt className={styles.label}>Lượt đã xử lý <small>trong {days} ngày</small></dt>
    <dd className={styles.value}>{value ?? "—"}</dd>
    <p className={styles.caption}>Chấp thuận và từ chối</p>
    <button className={styles.pause} type="button" disabled={!ready && !failed} aria-pressed={failed ? undefined : paused}
      aria-label={failed ? "Tải lại cảnh khu rừng" : paused ? "Tiếp tục chuyển động khu rừng" : "Tạm dừng chuyển động khu rừng"}
      title={failed ? "Chưa tải đủ cảnh. Bấm để thử lại." : ready ? (paused ? "Tiếp tục khu rừng" : "Tạm dừng khu rừng") : "Khu rừng tĩnh"}
      onClick={() => {
        if (failed) { setAttempt(n => n + 1); return; }
        const next = !paused; pausedRef.current = next; runtime.current?.pause(next); setPaused(next);
      }}>
      {failed ? <RefreshCw size={16} aria-hidden="true" /> : paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
    </button>
    <span className={styles.srOnly}>Cảnh rừng là hình trang trí, không biểu thị số hồ sơ.</span>
  </div>;
}
