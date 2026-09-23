import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, ViewportPortal, useOnViewportChange, type Node, type ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { buildDemoChapters, chapterCopyPosition, viewportForDemoChapter } from './demoChapters';

const CursorPointer = () => <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
  <path d="M3 2L3 20L8.2 15.2L11.2 22L15.2 20.35L12.25 13.8H19.5L3 2Z" />
</svg>;

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
  const [presenceRun, setPresenceRun] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(() => typeof window === 'undefined' ? 1200 : window.innerWidth);
  const [canvasHeight, setCanvasHeight] = useState(() => typeof window === 'undefined' ? 800 : window.innerHeight);
  const started = useRef(false);

  useEffect(() => {
    const host = document.querySelector('.landing-demo-canvas');
    if (!host) return;
    const observer = new ResizeObserver(() => {
      setCanvasWidth(host.clientWidth);
      setCanvasHeight(host.clientHeight);
    });
    observer.observe(host);
    setCanvasWidth(host.clientWidth);
    setCanvasHeight(host.clientHeight);
    return () => observer.disconnect();
  }, []);

  const go = useCallback((index: number, animate = true) => {
    if (!flow) return;
    const chapter = chapters[index];
    const host = document.querySelector('.landing-demo-canvas');
    const width = host?.clientWidth ?? 1200;
    const height = host?.clientHeight ?? 800;
    const viewport = viewportForDemoChapter(chapter, width, height);
    void flow.setViewport(viewport, {
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 650 : 0,
    });
    setActive(chapter.id);
    if (chapter.id === 'collaboration') setPresenceRun(run => run + 1);
  }, [flow, chapters]);

  useEffect(() => {
    if (!flow || started.current) return;
    started.current = true;
    go(0, false);
  }, [flow, go]);

  useOnViewportChange({ onEnd: viewport => {
    const host = document.querySelector('.landing-demo-canvas');
    const width = host?.clientWidth ?? 1200;
    const height = host?.clientHeight ?? 800;
    const visible = chapters.find(chapter => {
      const expected = viewportForDemoChapter(chapter, width, height);
      return Math.abs(expected.x - viewport.x) < 40 && Math.abs(expected.y - viewport.y) < 40 &&
        Math.abs(expected.zoom - viewport.zoom) < 0.04;
    });
    setActive(visible?.id ?? '');
  } });

  const lookAround = () => {
    if (!flow) return;
    const roots = nodes.filter(node => !node.parentId);
    if (roots.length === 0) return;
    const graphBounds = flow.getNodesBounds(roots);
    const bounds = { ...graphBounds };
    document.querySelectorAll('.landing-demo-canvas .demo-story-copy').forEach(element => {
      const rect = element.getBoundingClientRect();
      const start = flow.screenToFlowPosition({ x: rect.left, y: rect.top });
      const end = flow.screenToFlowPosition({ x: rect.right, y: rect.bottom });
      const right = Math.max(bounds.x + bounds.width, end.x);
      const bottom = Math.max(bounds.y + bounds.height, end.y);
      bounds.x = Math.min(bounds.x, start.x);
      bounds.y = Math.min(bounds.y, start.y);
      bounds.width = right - bounds.x;
      bounds.height = bottom - bounds.y;
    });
    void flow.fitBounds(bounds, {
      padding: 0.06,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
    });
    setActive('');
  };

  const focus = (index: number) => {
    const chapter = chapters[index];
    if (chapter.id === 'collaboration') {
      if (active !== chapter.id) go(index);
      else setPresenceRun(run => run + 1);
      return;
    }
    if (chapter.id === 'files') {
      lookAround();
      return;
    }
    if (!flow || !chapter.targetNodeId) return;
    void flow.setCenter(chapter.focus.x, chapter.focus.y, {
      zoom: chapter.id === 'branches' ? 0.9 : 1,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
    });
    setActive('');
  };

  const team = chapters[2];
  const teamCursorFocus = canvasWidth >= 600 && canvasHeight < 760
    ? { x: team.focus.x, y: team.focus.y - 120 } : team.focus;
  return <>
    <Panel position="top-center" className="demo-chapter-nav">
      <nav aria-label={t('story.navLabel')}>
        {chapters.map((chapter, index) => <button key={chapter.id} type="button" aria-pressed={active === chapter.id} onClick={() => go(index)}>{chapter.label}</button>)}
        <a href="#how-it-works">{t('story.overview')} ↓</a>
      </nav>
    </Panel>
    <ViewportPortal>
      {chapters.map((chapter, index) => {
        const copy = chapterCopyPosition(chapter, canvasWidth, canvasHeight);
        const actionLabel = chapter.id === 'intro' ? t('story.inspectFirstScene') : chapter.id === 'branches'
          ? t('story.inspectChoice') : chapter.id === 'collaboration' ? t('story.replayCollaboration') : t('story.lookAround');
        return <article key={chapter.id} className="demo-story-copy" aria-label={chapter.label} onFocusCapture={event => {
          if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) go(index);
        }} style={{ transform: `translate(${copy.x}px, ${copy.y}px)`, width: chapter.width }}>
          <p className="demo-story-eyebrow">{chapter.eyebrow}</p>
          {index === 0 ? <h1>{chapter.title}</h1> : <h2>{chapter.title}</h2>}
          <p className="demo-story-description">{chapter.text}</p>
          <p className="demo-story-hint">{chapter.hint}</p>
          <div className="demo-story-actions nodrag nopan">
            {index < chapters.length - 1 ? <button type="button" onClick={() => go(index + 1)}>{index === 0 ? t('story.follow') : index === 1 ? t('story.collaborationAction') : t('story.filesAction')} →</button> : <a href="/login?intent=import">{t('story.openProject')} →</a>}
            <button type="button" onClick={() => focus(index)}>{actionLabel}</button>
          </div>
        </article>;
      })}
      {active === 'collaboration' && presenceRun > 0 && team.targetNodeId ? <div key={presenceRun} className="demo-presence" aria-hidden="true" style={{ transform: `translate(${teamCursorFocus.x}px, ${teamCursorFocus.y}px)` }}>
        <span className="demo-presence-cursor demo-presence-cursor--author" style={{ '--remote-cursor-color': '#7350ba' } as React.CSSProperties}>
          <span className="project-graph-canvas__remote-cursor-pointer"><CursorPointer /></span>
          <span className="project-graph-canvas__remote-cursor-label">the-asind · {t('story.editing')}</span>
        </span>
        <span className="demo-presence-cursor demo-presence-cursor--peer" style={{ '--remote-cursor-color': '#118c9a' } as React.CSSProperties}>
          <span className="project-graph-canvas__remote-cursor-pointer"><CursorPointer /></span>
          <span className="project-graph-canvas__remote-cursor-label">Mira · {t('story.viewing')}</span>
        </span>
      </div> : null}
    </ViewportPortal>
  </>;
}
