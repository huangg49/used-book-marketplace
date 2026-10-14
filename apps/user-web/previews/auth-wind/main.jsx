import { memo, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Play, RotateCcw, Pause } from 'lucide-react';
import { AuthLayout } from '../../src/layouts/AuthLayout';
import { LoginPage } from '../../src/pages/LoginPage';
import { JourneyContext } from '../../src/components/auth/paper-journey';
import auth from '../../src/layouts/AuthLayout.module.css';
import '../../src/styles/global.css';
import './preview.css';
import { snapshotPaper } from './capture.mjs';
import { createPaper, DURATION } from './paper.mjs';
import { createStack } from './stack.mjs';
import { stampFlightFrame, STAMP_FLIGHT_DURATION, STAMP_DURATION } from './stamp-flight.mjs';
import { createJourney, JOURNEY_TIMING } from './journey.mjs';
import { Destination } from './destination';

const journeyPreview = location.pathname.includes('/auth-wind/journey/');
const stackPreview = journeyPreview || location.pathname.includes('/auth-wind/stack/');
const duration = journeyPreview ? JOURNEY_TIMING.end : stackPreview ? STAMP_FLIGHT_DURATION : DURATION;

const Source = memo(function Source() {
  return <MemoryRouter initialEntries={['/login']}><JourneyContext.Provider value={async () => {}}>
    <Routes><Route element={<AuthLayout />}><Route path="/login" element={<LoginPage />} /></Route></Routes>
  </JourneyContext.Provider></MemoryRouter>;
});

export function Preview() {
  const host = useRef(null), canvas = useRef(null), shadow = useRef(null);
  const outside = useRef(null), breeze = useRef(null), destination = useRef(null), journey = useRef(null);
  const rig = useRef(null), frame = useRef(0), clock = useRef(0), disposed = useRef(false);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0), [slow, setSlow] = useState(false);
  const [status, setStatus] = useState('Đang chuẩn bị tờ giấy…');
  const [view, setView] = useState('dom');
  const [revision, setRevision] = useState(0);
  const paper = () => host.current?.querySelector('[data-auth-paper]');
  const sheets = () => [paper(), host.current?.querySelector(`.${auth.middleSheet}`), host.current?.querySelector(`.${auth.backSheet}`)];
  const showSource = visible => sheets().filter(Boolean).forEach(sheet => { sheet.style.visibility = visible ? 'visible' : 'hidden'; });
  function stackPoses() {
    const front = paper().getBoundingClientRect();
    const scale = front.width / paper().offsetWidth;
    return sheets().map(sheet => {
      const rect = sheet.getBoundingClientRect(), transform = new DOMMatrix(getComputedStyle(sheet).transform);
      const width = sheet.offsetWidth * scale, height = sheet.offsetHeight * scale;
      return { left: rect.left + rect.width / 2 - width / 2, top: rect.top + rect.height / 2 - height / 2,
        width, height, angle: -Math.atan2(transform.b, transform.a) };
    });
  }
  const pause = () => { cancelAnimationFrame(frame.current); frame.current = 0; setPlaying(false); };
  function pose(p, mode = 'mesh') {
    if (!rig.current) return;
    if (clock.current === 0 || p === 0) {
      const rect = paper().getBoundingClientRect();
      rig.current.align(stackPreview ? stackPoses() : rect);
      canvas.current.dataset.alignedRect = JSON.stringify(rect.toJSON());
      Object.assign(shadow.current.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    clock.current = p;
    const stamp = stackPreview ? stampFlightFrame(Math.min(1, p * duration / STAMP_FLIGHT_DURATION)) : null;
    const motion = stackPreview ? rig.current.render(stamp.flightProgress, stamp) : rig.current.render(p);
    canvas.current.dataset.profile = JSON.stringify(motion.profile);
    canvas.current.dataset.angles = JSON.stringify(motion.angles);
    canvas.current.dataset.maxBend = String(motion.maxBend);
    if (stackPreview) {
      canvas.current.dataset.stamp = JSON.stringify(stamp);
      canvas.current.dataset.fragments = JSON.stringify(motion.fragments);
      canvas.current.dataset.actors = String(motion.actors);
      canvas.current.dataset.localProgress = JSON.stringify(motion.localProgress);
      canvas.current.dataset.depthGaps = JSON.stringify(motion.depthGaps);
      canvas.current.dataset.frontScaleRatio = String(motion.frontScaleRatio);
      canvas.current.dataset.flightStates = JSON.stringify(motion.states);
      canvas.current.dataset.sheetProfiles = JSON.stringify(motion.profiles);
    }
    showSource(mode === 'dom');
    if (journeyPreview) {
      const arrived = journey.current?.render(p * duration) ?? false;
      host.current.style.visibility = arrived ? 'hidden' : 'visible';
      destination.current.style.visibility = arrived ? 'visible' : 'hidden';
      destination.current.dataset.arrived = String(arrived);
      canvas.current.dataset.journeyTime = String(p * duration);
    }
    canvas.current.style.visibility = mode === 'dom' ? 'hidden' : 'visible';
    shadow.current.style.opacity = mode === 'dom' ? '0' : String((1 - motion.lift) ** 3 * (1 - motion.release));
    shadow.current.style.transform = `translate(${motion.release * 24}px,${motion.release * 16}px) scale(${1 + motion.release * .08})`;
    setProgress(p); setView(mode);
  }
  useEffect(() => {
    let cancelled = false;
    disposed.current = false;
    async function prepare() {
      try {
        await document.fonts.load('800 36px "Auth Bricolage"');
        await document.fonts.load('400 32px "Auth Melody"');
        await document.fonts.ready;
        if (journeyPreview) {
          await Promise.all([document.fonts.load('400 48px Anton'),
            ...[...destination.current.querySelectorAll('img')].map(image => image.decode().catch(() => {}))]);
          if (cancelled) return;
        }
        const element = paper();
        const controlsHeight = document.querySelector('.wind-controls').getBoundingClientRect().height;
        const margin = Math.min(70, innerHeight * .09);
        const room = innerHeight - controlsHeight - margin * 2;
        const scale = Math.min(1, room / element.offsetHeight);
        const stage = host.current.querySelector(`.${auth.stage}`);
        stage.style.transform = `scale(${scale})`;
        stage.style.transformOrigin = 'top center';
        host.current.querySelector(`.${auth.root}`).style.paddingTop = `${margin + Math.max(0, room - element.offsetHeight * scale) / 2}px`;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const [front, back, middle, rear] = await Promise.all([snapshotPaper(element), snapshotPaper(element, true),
          ...(stackPreview ? sheets().slice(1).map(sheet => snapshotPaper(sheet)) : [])]);
        if (cancelled) return;
        if (stackPreview) {
          // Reuse the real Auth stamp art; keep it off the live resting form.
          const stamp = document.createElement('div');
          stamp.className = auth.stamp; stamp.dataset.previewStamp = '';
          stamp.textContent = 'ĐÃ MƯỢN';
          const date = document.createElement('span'); date.textContent = new Date().toLocaleDateString('vi-VN');
          stamp.append(date);
          Object.assign(stamp.style, { animation: 'none', visibility: 'hidden' });
          element.append(stamp);
          try {
            const rect = stamp.getBoundingClientRect(), parent = element.getBoundingClientRect();
            const ink = await snapshotPaper(element, false, true);
            front.stamp = { canvas: ink.canvas, centre: [(rect.left + rect.width / 2 - parent.left) / parent.width,
              1 - (rect.top + rect.height / 2 - parent.top) / parent.height] };
          } finally { stamp.remove(); }
          if (cancelled) return;
        }
        rig.current = stackPreview ? createStack(canvas.current, [{ front, back }, { front: middle, back: middle }, { front: rear, back: rear }]) : createPaper(canvas.current, front, back);
        if (stackPreview) rig.current.align(stackPoses());
        if (journeyPreview) { journey.current = createJourney(outside.current, breeze.current, element.getBoundingClientRect()); journey.current.render(0); }
        Object.assign(shadow.current.style, { left: `${front.rect.left}px`, top: `${front.rect.top}px`, width: `${front.rect.width}px`, height: `${front.rect.height}px` });
        canvas.current.dataset.captureMs = String(front.milliseconds);
        canvas.current.dataset.captureRect = JSON.stringify(front.rect.toJSON());
        canvas.current.dataset.vertices = String(rig.current.render(0).vertices);
        setReady(true); setStatus(journeyPreview ? 'Bản thử toàn chuỗi · kệ trống minh họa, không đăng nhập thật' : stackPreview ? 'Đã mượn → giấy bay và mảnh nhỏ · bản thử' : 'Bản thử một tờ · chưa nối với đăng nhập');
        document.title = journeyPreview ? 'Đăng nhập → vào trang · Lật lại' : `${stackPreview ? 'Ba' : 'Một'} tờ giấy theo gió · Lật lại`;
      } catch (error) {
        if (!cancelled) setStatus(`Chưa dựng được bản thử. ${error.message}. Tải lại để thử lại.`);
      }
    }
    void prepare();
    const stop = () => {
      if (document.hidden) pause();
      else if (journeyPreview && rig.current) {
        journey.current?.dispose();
        journey.current = createJourney(outside.current, breeze.current, stackPoses()[0]);
        pose(clock.current);
      }
    };
    const restoreJourney = () => {
      if (!journeyPreview) return;
      host.current.style.visibility = 'visible'; destination.current.style.visibility = 'hidden';
      journey.current?.render(0);
    };
    const surface = canvas.current;
    const lost = event => {
      event.preventDefault(); pause(); setReady(false);
      showSource(true);
      restoreJourney();
      surface.style.visibility = 'hidden'; shadow.current.style.opacity = '0';
      setStatus('Chưa dựng được bản thử. Mất kết nối đồ họa.');
    };
    surface.addEventListener('webglcontextlost', lost);
    let resizeTimer;
    const resize = () => {
      pause();
      clearTimeout(resizeTimer);
      // Resize invalidates both the capture and the camera; show the DOM again.
      showSource(true);
      restoreJourney();
      canvas.current.style.visibility = 'hidden';
      shadow.current.style.opacity = '0';
      setReady(false);
      setStatus('Đang chuẩn bị tờ giấy…');
      resizeTimer = setTimeout(() => { clock.current = 0; setProgress(0); setView('dom'); setRevision(value => value + 1); }, 200);
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', stop);
    return () => {
      cancelled = true; disposed.current = true;
      cancelAnimationFrame(frame.current); clearTimeout(resizeTimer);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', stop);
      surface.removeEventListener('webglcontextlost', lost);
      rig.current?.dispose(); rig.current = null;
      journey.current?.dispose(); journey.current = null;
    };
  }, [revision]);
  function play() {
    pause();
    const initial = clock.current >= .99 ? 0 : clock.current;
    const start = performance.now();
    setPlaying(true);
    function tick(now) {
      if (disposed.current) return;
      const p = Math.min(1, initial + (now - start) / duration * (slow ? .35 : 1));
      pose(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else { frame.current = 0; setPlaying(false); }
    }
    frame.current = requestAnimationFrame(tick);
  }
  const label = journeyPreview ? progress === 0 ? 'Sẵn sàng đăng nhập' : progress * duration < STAMP_DURATION ? 'Đóng dấu Đã mượn' : progress * duration < JOURNEY_TIMING.coverStart ? 'Ba tờ giấy bay theo gió' : progress * duration < JOURNEY_TIMING.covered ? 'Giấy ngoài che màn hình' : progress * duration < JOURNEY_TIMING.arrived ? 'Mở trang Đấu giá' : progress < 1 ? 'Bồ công anh còn thoảng lại' : 'Đã vào trang'
    : stackPreview ? progress === 0 ? 'Xấp giấy đang nghỉ' : progress * duration < STAMP_DURATION ? 'Đóng dấu Đã mượn' : progress < .84 ? 'Bay theo gió' : 'Bay khỏi khung hình'
    : progress === 0 ? 'Giấy đang nghỉ' : progress < .25 ? 'Giấy chao theo gió' : progress < .45 ? 'Gió luồn qua thân giấy' : progress < .80 ? 'Trượt ra · cuốn theo gió' : 'Bay khỏi khung hình';
  return <>
    <style>{`.wind-source .${auth.annotation},.wind-source .${auth.signature},.wind-source .${auth.back},.wind-source .${auth.status}${stackPreview ? '' : `,.wind-source .${auth.backSheet},.wind-source .${auth.middleSheet}`}{display:none}.wind-source .${auth.root}{padding:20px;min-height:0;height:100dvh;display:flex;align-items:flex-start;justify-content:center}.wind-source .${auth.pages}{min-height:600px}@media(max-width:600px){.wind-source .${auth.pages}{min-height:0}}`}</style>
    <div ref={host} className="wind-source" inert aria-hidden="true">
      <Source />
    </div>
    <div ref={shadow} className="paper-shadow" aria-hidden="true" />
    <canvas ref={canvas} className="paper-canvas" aria-hidden="true" onContextMenu={event => event.preventDefault()} />
    {journeyPreview && <>
      <div ref={destination} className="journey-destination" inert aria-hidden="true"><Destination /></div>
      <div ref={outside} className="journey-outside" aria-hidden="true" />
      <div ref={breeze} className="journey-breeze" aria-hidden="true" />
    </>}
    <section className="wind-controls" aria-label="Bản thử chuyển động giấy">
      <div className="wind-caption"><h1>{journeyPreview ? 'Đăng nhập → vào trang' : `${stackPreview ? 'Ba' : 'Một'} tờ giấy theo gió`}</h1><p role="status">{status}</p>{status.startsWith('Chưa dựng') && <button type="button" onClick={() => location.reload()}>Tải lại bản thử</button>}</div>
      <div className="wind-playback">
        <button type="button" disabled={!ready} className="wind-primary" onClick={playing ? pause : play}>{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? 'Tạm dừng' : progress >= .99 ? 'Xem lại' : stackPreview ? 'Đăng nhập' : 'Thổi gió'}</button>
        <button type="button" disabled={!ready} onClick={() => { pause(); pose(0, 'dom'); }} aria-label="Về trạng thái đầu"><RotateCcw size={18} /></button>
        <label className="wind-slow"><input type="checkbox" checked={slow} onChange={event => { pause(); setSlow(event.target.checked); }} />Xem chậm</label>
      </div>
      <div className="wind-scrub"><label htmlFor="wind-time">{label}<span>{(progress * duration / 1000).toFixed(2)} s</span></label><input id="wind-time" type="range" min="0" max="1000" value={Math.round(progress * 1000)} disabled={!ready} onChange={event => { pause(); pose(Number(event.target.value) / 1000); }} /></div>
      <button className="wind-compare" type="button" disabled={!ready || playing} onClick={() => { pause(); pose(0, view === 'dom' ? 'mesh' : 'dom'); }}>{view === 'dom' ? 'Đối chiếu: bản trên lưới' : 'Đối chiếu: form gốc'}</button>
    </section>
  </>;
}
createRoot(document.getElementById('root')).render(<Preview />);
