import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, ViewportPortal, useOnViewportChange, type Node, type ReactFlowInstance } from '@xyflow/react';
import { buildDemoChapters } from './demoChapters';

export function DemoStory({ nodes, flow }: { nodes: Node[]; flow: ReactFlowInstance | null }) {
  const chapters = useMemo(() => buildDemoChapters(nodes), [nodes]);
  const [active, setActive] = useState('intro');
  const started = useRef(false);
  const go = useCallback((index: number, animate = true) => {
    if (!flow) return;
    const chapter = chapters[index];
    const host = document.querySelector('.landing-demo-canvas');
    const width = host?.clientWidth ?? 1200;
    const height = host?.clientHeight ?? 800;
    const zoom = Math.max(0.25, Math.min(1, width < 600 ? 1 : (width - 48) / 620, (height - 180) / 540));
    void flow.setViewport({ x: 32 - chapter.x * zoom, y: 100 - chapter.y * zoom, zoom }, {
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 650 : 0,
    });
    setActive(chapter.id);
  }, [flow, chapters]);
  useEffect(() => {
    if (!flow || started.current) return;
    started.current = true;
    go(0, false);
  }, [flow, go]);
  useOnViewportChange({ onEnd: viewport => {
    const visible = chapters.find(c => Math.abs(c.x * viewport.zoom + viewport.x - 32) < 40 && Math.abs(c.y * viewport.zoom + viewport.y - 100) < 40);
    setActive(visible?.id ?? '');
  } });
  return <>
    <Panel position="top-center" className="demo-chapter-nav">
      <nav aria-label="Explore the demo">
        {chapters.map((c, i) => <button key={c.id} type="button" aria-pressed={active === c.id} onClick={() => go(i)}>{c.label}</button>)}
        <a href="#how-it-works">Overview ↓</a>
      </nav>
    </Panel>
    <ViewportPortal>
      {chapters.map((c, i) => <article key={c.id} className="demo-story-copy" aria-label={c.label} onFocusCapture={event => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) go(i);
      }} style={{ transform: `translate(${c.x}px, ${c.y}px)`, width: c.width }}>
        <p className="demo-story-eyebrow">{c.eyebrow}</p>
        {i === 0 ? <h1>{c.title}</h1> : <h2>{c.title}</h2>}
        <p className="demo-story-description">{c.text}</p>
        <p className="demo-story-hint">{c.hint}</p>
        <div className="demo-story-actions nodrag nopan">
          {i < 2 ? <button type="button" onClick={() => go(i + 1)}> {i === 0 ? 'Follow the story' : 'What about my files?'} →</button> : <a href="/login?intent=import">Open your project →</a>}
          <button type="button" onClick={() => {
            if (flow) void flow.setCenter(c.scene.x, c.scene.y, { zoom: 0.85, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
            setActive('');
          }}>Explore the scenes</button>
        </div>
      </article>)}
    </ViewportPortal>
  </>;
}
