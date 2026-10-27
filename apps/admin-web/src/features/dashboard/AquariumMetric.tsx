import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { aquariumBase, oceanDetailsBase, mountAquarium } from "./aquarium-runtime";
import styles from "./AquariumMetric.module.css";

export function AquariumMetric({ value, catalog }: { value: number | null; catalog: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ReturnType<typeof mountAquarium> | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!stage.current || !canvas.current) return;
    const scene = mountAquarium(stage.current, canvas.current, setReady);
    runtime.current = scene;
    return () => { scene.dispose(); runtime.current = null; };
  }, []);
  return <div className={styles.tank}>
    <div ref={stage} className={styles.scene} aria-hidden="true">
      <div className={styles.still}>
        <img className={styles.water} src={`${aquariumBase}assets/water.webp`} alt="" />
        <img className={styles.plant} src={`${aquariumBase}assets/ribbon-plant.webp`} alt="" />
        <span className={styles.fish}>
          <img className={styles.tail} src={`${aquariumBase}assets/tail.webp`} alt="" />
          <img className={styles.body} src={`${aquariumBase}assets/fish-body.webp`} alt="" />
        </span>
        <img className={styles.coral} src={`${oceanDetailsBase}fan-coral.webp`} alt="" />
        <img className={styles.branchCoral} src={`${oceanDetailsBase}branch-coral.webp`} alt="" />
        <img className={styles.shell} src={`${oceanDetailsBase}shell.webp`} alt="" />
        <img className={styles.snail} src={`${oceanDetailsBase}sea-snail.webp`} alt="" />
      </div>
      <canvas ref={canvas} />
    </div>
    <dt className={styles.label}>Hồ sơ đang chờ <small>hiện tại</small></dt>
    <dd className={styles.value}>{value ?? "—"}</dd>
    <p className={styles.caption}>{catalog ? "Bài đăng sách và đầu sách" : "Bài đăng sách"}</p>
    <button type="button" className={styles.pause} disabled={!ready} aria-pressed={paused}
      aria-label={paused ? "Tiếp tục chuyển động bể cá" : "Tạm dừng chuyển động bể cá"}
      title={ready ? (paused ? "Tiếp tục bể cá" : "Tạm dừng bể cá") : "Bể cá tĩnh"}
      onClick={() => { const next = !paused; runtime.current?.pause(next); setPaused(next); }}>
      {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
    </button>
    <span className={styles.srOnly}>Cá là hình trang trí, không biểu thị số hồ sơ.</span>
  </div>;
}
