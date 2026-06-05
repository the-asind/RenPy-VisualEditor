import { memo, useEffect, useMemo, useRef } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import LoginIcon from '@mui/icons-material/Login';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';

import { parseActionEditorContent, type ActionEditorCommandRow, type ActionEditorRow } from './actionEditorModel';
import {
  buildActionEditorAssetContext,
  playLocalAudioPreview,
  resolveAudioAsset,
  resolveImageAsset,
  type ActionEditorAssetContext,
} from '../../utils/assetCatalogResolver';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';

export type ActionEditorNextAction = 'menu' | 'conditional' | 'jump' | 'call' | 'return';

export interface ActionEditorSidebarProps {
  activeRowId?: string | null;
  assetCatalog?: ProjectAssetCatalogPayload | null;
  content: string;
  localAssetUrls?: Record<string, string>;
  onNextAction: (action: ActionEditorNextAction) => void;
}

const findLastCommand = (
  rows: ActionEditorCommandRow[],
  kind: ActionEditorCommandRow['kind'],
): ActionEditorCommandRow | undefined => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].kind === kind) {
      return rows[index];
    }
  }
  return undefined;
};

const rowsThroughActiveRow = (rows: ActionEditorRow[], activeRowId?: string | null): ActionEditorRow[] => {
  const activeRowIndex = activeRowId ? rows.findIndex((row) => row.id === activeRowId) : -1;
  return activeRowIndex === -1 ? rows : rows.slice(0, activeRowIndex + 1);
};

const imageTagFromName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

const imageNameWithAttributes = (imageTag: string, attributes: string[]): string =>
  [imageTag, ...attributes.map((attribute) => attribute.trim()).filter(Boolean)].join(' ').trim();

const sceneStateFromRows = (rows: ActionEditorRow[], assetContext: ActionEditorAssetContext) => {
  const commandRows = rows.filter((row): row is ActionEditorCommandRow =>
    row.kind === 'scene' ||
    row.kind === 'show' ||
    row.kind === 'hide' ||
    row.kind === 'music' ||
    row.kind === 'sound' ||
    row.kind === 'transition',
  );
  const background = findLastCommand(commandRows, 'scene')?.primary ?? 'unknown';
  const musicRow = findLastCommand(commandRows, 'music');
  const soundRow = findLastCommand(commandRows, 'sound');
  const visibleImagesByTag = new Map<string, { name: string; placement: string }>();
  for (const row of rows) {
    if (row.kind === 'show') {
      const tag = imageTagFromName(row.primary);
      if (tag) {
        visibleImagesByTag.set(tag, { name: row.primary, placement: row.suffix });
      }
      continue;
    }
    if (row.kind === 'hide') {
      const tag = imageTagFromName(row.primary);
      if (tag) {
        visibleImagesByTag.delete(tag);
      }
      continue;
    }
    if (row.kind === 'dialogue' && row.imageAttributes?.length) {
      const imageTag = assetContext.characterImages[row.speaker];
      if (!imageTag) {
        continue;
      }
      const previous = visibleImagesByTag.get(imageTag);
      visibleImagesByTag.set(imageTag, {
        name: imageNameWithAttributes(imageTag, row.imageAttributes),
        placement: previous?.placement ?? '',
      });
    }
  }
  const visibleImages = [...visibleImagesByTag.values()].map((image) => ({
    ...image,
    asset: resolveImageAsset(assetContext, image.name),
  }));
  const music = musicRow?.primary ?? 'none';
  const musicOptions = musicRow?.suffix ?? '';
  const sound = soundRow?.primary ?? 'none';
  const soundOptions = soundRow?.suffix ?? '';
  return {
    background,
    backgroundAsset: resolveImageAsset(assetContext, background),
    visibleImages,
    music,
    musicAsset: resolveAudioAsset(assetContext, music),
    musicOptions,
    sound,
    soundAsset: resolveAudioAsset(assetContext, sound),
    soundOptions,
  };
};

export const ActionEditorSidebar = memo(function ActionEditorSidebar({
  activeRowId,
  assetCatalog,
  content,
  localAssetUrls,
  onNextAction,
}: ActionEditorSidebarProps) {
  const rows = useMemo(() => parseActionEditorContent(content), [content]);
  const scopedRows = useMemo(() => rowsThroughActiveRow(rows, activeRowId), [activeRowId, rows]);
  const assetContext = useMemo(() => buildActionEditorAssetContext(assetCatalog, localAssetUrls), [assetCatalog, localAssetUrls]);
  const sceneState = useMemo(() => sceneStateFromRows(scopedRows, assetContext), [assetContext, scopedRows]);
  const previewHasBackgroundImage = Boolean(sceneState.backgroundAsset.url);
  const loggedAssetDiagnosticsRef = useRef(new Set<string>());

  useEffect(() => {
    const logOnce = (key: string, level: 'warn' | 'error', message: string, details: Record<string, unknown>) => {
      if (loggedAssetDiagnosticsRef.current.has(key)) {
        return;
      }
      loggedAssetDiagnosticsRef.current.add(key);
      console[level](message, details);
    };

    const reportImage = (role: string, name: string, asset: { path: string | null; localAvailable: boolean }) => {
      if (!name || name === 'black' || name === 'unknown') {
        return;
      }
      if (!asset.path) {
        logOnce(`image:no-match:${role}:${name}`, 'warn', '[ActionEditorAssets] No image catalog match for RenPy image name.', {
          role,
          name,
          imageCatalogEntries: assetContext.imageEntries.length,
        });
        return;
      }
      if (!asset.localAvailable) {
        logOnce(`image:no-url:${asset.path}`, 'warn', '[ActionEditorAssets] Image catalog match has no local object URL.', {
          role,
          name,
          path: asset.path,
        });
      }
    };

    reportImage('background', sceneState.background, sceneState.backgroundAsset);
    for (const image of sceneState.visibleImages) {
      reportImage('show', image.name, image.asset);
    }

    if (sceneState.music !== 'none') {
      if (!sceneState.musicAsset.path) {
        logOnce('audio:no-match:music', 'warn', '[ActionEditorAssets] No audio catalog match for RenPy audio name.', {
          name: sceneState.music,
          audioCatalogEntries: assetContext.audioEntries.length,
        });
      } else if (!sceneState.musicAsset.localAvailable) {
        logOnce(`audio:no-url:${sceneState.musicAsset.path}`, 'warn', '[ActionEditorAssets] Audio catalog match has no local object URL.', {
          name: sceneState.music,
          path: sceneState.musicAsset.path,
        });
      }
    }
  }, [assetContext.audioEntries.length, assetContext.imageEntries.length, sceneState]);

  return (
    <aside className="action-editor__sidebar action-editor-sidebar" aria-label="Scene writing aids">
      <section className="action-editor__side-panel action-editor-sidebar__preview">
        <div className="action-editor-sidebar__panel-header">
          <h2>Scene preview</h2>
          <VisibilityOutlinedIcon aria-hidden="true" fontSize="small" />
        </div>
        <div
          className={`action-editor__preview-placeholder action-editor-sidebar__missing-preview ${
            sceneState.background === 'black' ? 'action-editor-sidebar__missing-preview--black' : ''
          }`}
          data-asset-path={sceneState.backgroundAsset.path ?? undefined}
        >
          {previewHasBackgroundImage ? (
            <img
              alt={sceneState.background}
              className="action-editor-sidebar__background-image"
              onError={() =>
                console.error('[ActionEditorAssets] Failed to render local background image.', {
                  name: sceneState.background,
                  path: sceneState.backgroundAsset.path,
                  url: sceneState.backgroundAsset.url,
                })
              }
              src={sceneState.backgroundAsset.url ?? undefined}
            />
          ) : null}
          <span className="action-editor-sidebar__background">{sceneState.background}</span>
          <div className="action-editor-sidebar__missing-assets">
            {sceneState.visibleImages.map((image) => (
              image.asset.url ? (
                <span
                  className="action-editor-sidebar__local-asset"
                  data-asset-path={image.asset.path ?? undefined}
                  key={`${image.name}-${image.placement}`}
                >
                  <img
                    alt={image.name}
                    onError={() =>
                      console.error('[ActionEditorAssets] Failed to render local shown image.', {
                        name: image.name,
                        path: image.asset.path,
                        url: image.asset.url,
                      })
                    }
                    src={image.asset.url}
                  />
                  {image.placement ? <small>{image.placement}</small> : null}
                </span>
              ) : (
                <span
                  className="action-editor-sidebar__missing-asset"
                  data-asset-path={image.asset.path ?? undefined}
                  key={`${image.name}-${image.placement}`}
                >
                  <strong>{image.name}</strong>
                  {image.placement ? <small>{image.placement}</small> : null}
                </span>
              )
            ))}
          </div>
        </div>
      </section>

      <section className="action-editor__side-panel">
        <h2>Audio</h2>
        <div className="action-editor__audio-stack">
          <div className="action-editor__audio-row action-editor__audio-row--music">
            <MusicNoteIcon aria-hidden="true" fontSize="small" />
            <span>Music:</span>
            <span className="action-editor__audio-value">
              <strong>{sceneState.music}</strong>
              {sceneState.musicOptions ? <small>{sceneState.musicOptions}</small> : null}
            </span>
            <button
              className="action-editor__audio-control"
              data-audio-path={sceneState.musicAsset.path ?? undefined}
              disabled={sceneState.music !== 'none' && !sceneState.musicAsset.localAvailable}
              onClick={() =>
                void playLocalAudioPreview(sceneState.musicAsset.url).catch((error) => {
                  console.error('[ActionEditorAssets] Failed to play local music preview.', {
                    name: sceneState.music,
                    path: sceneState.musicAsset.path,
                    url: sceneState.musicAsset.url,
                    error,
                  });
                })
              }
              type="button"
              aria-label="Preview music"
            >
              <PlayArrowIcon aria-hidden="true" fontSize="small" />
            </button>
            <button className="action-editor__audio-control" type="button" aria-label="Music options">
              <MoreVertIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
          <div className="action-editor__audio-row action-editor__audio-row--sound">
            <VolumeUpIcon aria-hidden="true" fontSize="small" />
            <span>Sound:</span>
            <span className="action-editor__audio-value">
              <strong>{sceneState.sound}</strong>
              {sceneState.soundOptions ? <small>{sceneState.soundOptions}</small> : null}
            </span>
            <span />
            <button
              className="action-editor__audio-control"
              data-audio-path={sceneState.soundAsset.path ?? undefined}
              type="button"
              aria-label="Sound options"
            >
              <MoreVertIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
        </div>
      </section>

      <section className="action-editor__side-panel">
        <h2>Next</h2>
        <div className="action-editor__next-grid">
          <NextButton
            action="menu"
            description="Create a menu of options"
            icon={<CallSplitIcon aria-hidden="true" fontSize="small" />}
            label="Player Choice"
            onNextAction={onNextAction}
          />
          <NextButton
            action="conditional"
            description="Add an if/elif/else path"
            icon={<AltRouteIcon aria-hidden="true" fontSize="small" />}
            label="Conditional Path"
            onNextAction={onNextAction}
          />
          <NextButton
            action="jump"
            description="Jump to another label"
            icon={<LoginIcon aria-hidden="true" fontSize="small" />}
            label="Go to Label"
            onNextAction={onNextAction}
          />
          <NextButton
            action="call"
            description="Call another label"
            icon={<SubdirectoryArrowRightIcon aria-hidden="true" fontSize="small" />}
            label="Call Sub-scene"
            onNextAction={onNextAction}
          />
          <NextButton
            action="return"
            description="Return to the previous label"
            icon={<ArrowBackIcon aria-hidden="true" fontSize="small" />}
            label="Return"
            onNextAction={onNextAction}
          />
        </div>
      </section>
    </aside>
  );
});

const NextButton = ({
  action,
  description,
  icon,
  label,
  onNextAction,
}: {
  action: ActionEditorNextAction;
  description: string;
  icon: JSX.Element;
  label: string;
  onNextAction: (action: ActionEditorNextAction) => void;
}) => (
  <button className={`action-editor-sidebar__next action-editor-sidebar__next--${action}`} onClick={() => onNextAction(action)} type="button">
    {icon}
    <span>
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
  </button>
);

export default ActionEditorSidebar;
