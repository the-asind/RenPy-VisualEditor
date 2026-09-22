import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, ViewportPortal, useOnViewportChange, type Node, type ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { buildDemoChapters } from './demoChapters';

export function DemoStory({ nodes, flow }: { nodes: Node[]; flow: ReactFlowInstance | null }) {
  const { t } = useTranslation();
  const chapters = useMemo(() => {
    const source = buildDemoChapters(nodes);
    const labels = [t('story.idea'), t('story.connections'), t('story.collaboration'), t('story.files')];
    const titles = t('story.titles').split('|');
    const eyebrows = t('story.eyebrows').split('|');
    const descriptions = t('story.descriptions').split('|');
    const hints = t('story.hints').split('|');
    return source.map((chapter, index) => ({
      ...chapter,
      label: labels[index],
      title: titles[index] ?? chapter.title,
      eyebrow: eyebrows[index] ?? chapter.eyebrow,
      text: descriptions[index] ?? chapter.text,
      hint: hints[index] ?? chapter.hint,
    }));
  }, [nodes, t]);
  const [active, setActive] = useState('intro');
  const started = useRef(false);
  const go = useCallback((index: number, animate = true) => {
    if (!flow) return;
    const chapter = chapters[index];
    const host = document.querySelector('.landing-demo-canvas');
    const width = host?.clientWidth ?? 1200;
    const height = host?.clientHeight ?? 800;
    const zoom = Math.max(0.25, Math.min(1, width < 600 ? 1 : (width - 48) / 620, (height - 180) / 540));
    const readingTop = width < 600 ? 165 : 100;
    void flow.setViewport({ x: 32 - chapter.x * zoom, y: readingTop - chapter.y * zoom, zoom }, {
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
    const readingTop = (document.querySelector('.landing-demo-canvas')?.clientWidth ?? 1200) < 600 ? 165 : 100;
    const visible = chapters.find(c => Math.abs(c.x * viewport.zoom + viewport.x - 32) < 40 && Math.abs(c.y * viewport.zoom + viewport.y - readingTop) < 40);
    setActive(visible?.id ?? '');
  } });
  return <>
    <Panel position="top-center" className="demo-chapter-nav">
      <nav aria-label={t('story.navLabel')}>
        {chapters.map((c, i) => <button key={c.id} type="button" aria-pressed={active === c.id} onClick={() => go(i)}>{c.label}</button>)}
        <a href="#how-it-works">{t('story.overview')} ↓</a>
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
          {i < chapters.length - 1 ? <button type="button" onClick={() => go(i + 1)}>{i === 0 ? t('story.follow') : i === 1 ? t('story.collaborationAction') : t('story.filesAction')} →</button> : <a href="/login?intent=import">{t('story.openProject')} →</a>}
          <button type="button" onClick={() => {
            if (flow) void flow.setCenter(c.scene.x, c.scene.y, { zoom: 0.85, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
            setActive('');
          }}>{t('story.exploreScenes')}</button>
        </div>
      </article>)}
    </ViewportPortal>
  </>;
}
