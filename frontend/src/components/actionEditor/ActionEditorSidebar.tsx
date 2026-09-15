import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import LoginIcon from '@mui/icons-material/Login';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTranslation } from 'react-i18next';

import { parseActionEditorContent, type ActionEditorCommandRow, type ActionEditorRow } from './actionEditorModel';
import {
  buildActionEditorAssetContext,
  describeLocalAssetUrlState,
  getActionEditorAudioPreviewVolume,
  playLocalAudioPreview,
  resolveAudioAsset,
  resolveImageAsset,
  setActionEditorAudioPreviewVolume,
  shouldReportMissingLocalAssetUrl,
  stopLocalAudioPreview,
  updateLocalAudioPreviewVolume,
  type ActionEditorAudioPreviewChannel,
  type ActionEditorAssetContext,
  type ActionEditorResolvedAsset,
} from '../../utils/assetCatalogResolver';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';
import type { ConditionalContinuationDraft, MenuContinuationDraft } from './actionEditorContinuation';
import type { RelationTargetSelection } from './relationTargetModel';

export type ActionEditorNextAction = 'menu' | 'conditional' | 'jump' | 'call' | 'return';

export interface ActionEditorNextTargetLabel {
  id: string;
  qualifiedName: string;
  labelStartNodeId: string;
  fileId?: string;
  filePath?: string;
  scope?: string;
  current?: boolean;
}

export interface ActionEditorNextActionRequest {
  action: ActionEditorNextAction;
  targetLabelId?: string;
  target?: RelationTargetSelection;
  conditionalDraft?: ConditionalContinuationDraft;
  menuDraft?: MenuContinuationDraft;
}

export interface ActionEditorSidebarProps {
  activeRowId?: string | null;
  assetCatalog?: ProjectAssetCatalogPayload | null;
  content: string;
  localAssetUrls?: Record<string, string>;
  nextTargetLabels?: ActionEditorNextTargetLabel[];
  onNextAction?: (request: ActionEditorNextActionRequest) => void;
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

const defaultLayer = 'master';

const imageTagFromName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

const imageNameWithAttributes = (imageTag: string, attributes: string[]): string =>
  [imageTag, ...attributes.map((attribute) => attribute.trim()).filter(Boolean)].join(' ').trim();

const layerFromCommandRow = (row: ActionEditorCommandRow): string => {
  const match = row.suffix.match(/\bonlayer\s+([A-Za-z_][A-Za-z0-9_.]*)/);
  return match?.[1] ?? defaultLayer;
};

const placementFromCommandRow = (row: ActionEditorCommandRow): string =>
  row.suffix.replace(/\bonlayer\s+[A-Za-z_][A-Za-z0-9_.]*/g, '').replace(/\s+/g, ' ').trim();

const isLayerTransformShow = (row: ActionEditorCommandRow): boolean =>
  row.kind === 'show' && /^layer\s+\S+/.test(row.primary);

const isExpressionShow = (row: ActionEditorCommandRow): boolean =>
  row.kind === 'show' && /^expression\b/.test(row.primary);

const previewPlacementSlots = new Set([
  'left',
  'right',
  'center',
  'truecenter',
  'top',
  'topleft',
  'topright',
  'offscreenleft',
  'offscreenright',
]);

const placementAtValue = (placement: string): string => {
  const match = placement.match(/\bat\s+(.+?)(?:\s+with\b|$)/);
  return match?.[1]?.trim() ?? '';
};

const positionStyleFromAtValue = (atValue: string): CSSProperties | null => {
  const positionMatch = atValue.match(/\bPosition\s*\(([^)]*)\)/);
  if (!positionMatch) {
    return null;
  }
  const args = positionMatch[1];
  const xalignMatch = args.match(/\bxalign\s*=\s*(-?\d+(?:\.\d+)?)/);
  const yalignMatch = args.match(/\byalign\s*=\s*(-?\d+(?:\.\d+)?)/);
  const xalign = xalignMatch ? Number.parseFloat(xalignMatch[1]) : 0.5;
  const yalign = yalignMatch ? Number.parseFloat(yalignMatch[1]) : 1;
  if (!Number.isFinite(xalign) || !Number.isFinite(yalign)) {
    return null;
  }
  const xPercent = xalign * 100;
  const yPercent = yalign * 100;
  return {
    left: `${xPercent}%`,
    top: `${yPercent}%`,
    bottom: 'auto',
    transform: `translate(${-xPercent}%, ${-yPercent}%)`,
  };
};

const previewPlacementFromPlacement = (placement: string): { slot: string; style?: CSSProperties } => {
  const atValue = placementAtValue(placement);
  const positionStyle = positionStyleFromAtValue(atValue);
  if (positionStyle) {
    return { slot: 'position', style: positionStyle };
  }
  const candidates = atValue
    .split(',')
    .flatMap((part) => part.trim().split(/\s+/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const slot = candidates.find((candidate) => previewPlacementSlots.has(candidate));
  return { slot: slot ?? 'center' };
};

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
  const layerImages = new Map<string, Map<string, { name: string; placement: string }>>();
  let temporaryMasterLayerImages: Map<string, { name: string; placement: string }> | null = null;
  const imagesForLayer = (layer: string): Map<string, { name: string; placement: string }> => {
    const existing = layerImages.get(layer);
    if (existing) {
      return existing;
    }
    const next = new Map<string, { name: string; placement: string }>();
    layerImages.set(layer, next);
    return next;
  };

  for (const row of rows) {
    temporaryMasterLayerImages = null;
    if (row.kind === 'scene') {
      const layer = layerFromCommandRow(row);
      imagesForLayer(layer).clear();
      continue;
    }
    if (row.kind === 'show') {
      if (isLayerTransformShow(row) || isExpressionShow(row)) {
        continue;
      }
      const tag = imageTagFromName(row.primary);
      if (tag) {
        const imagesOnLayer = imagesForLayer(layerFromCommandRow(row));
        const previous = imagesOnLayer.get(tag);
        const explicitPlacement = placementFromCommandRow(row);
        imagesOnLayer.set(tag, {
          name: row.primary,
          placement: placementAtValue(explicitPlacement) ? explicitPlacement : previous?.placement ?? '',
        });
      }
      continue;
    }
    if (row.kind === 'hide') {
      const tag = imageTagFromName(row.primary);
      if (tag) {
        imagesForLayer(layerFromCommandRow(row)).delete(tag);
      }
      continue;
    }
    if (row.kind === 'dialogue' && row.imageAttributes?.length) {
      const imageNamePrefix = assetContext.characterImages[row.speaker];
      const imageTag = imageNamePrefix ? imageTagFromName(imageNamePrefix) : '';
      if (!imageNamePrefix || !imageTag) {
        continue;
      }
      const masterLayerImages = imagesForLayer(defaultLayer);
      const previous = masterLayerImages.get(imageTag);
      if (!previous) {
        continue;
      }
      const isTemporary = row.imageAttributes[0] === '@';
      const persistentAttributes = isTemporary ? row.imageAttributes.slice(1) : row.imageAttributes;
      const nextImage = {
        name: imageNameWithAttributes(imageNamePrefix, persistentAttributes),
        placement: previous.placement,
      };
      if (isTemporary) {
        temporaryMasterLayerImages = new Map([[imageTag, nextImage]]);
        continue;
      }
      masterLayerImages.set(imageTag, nextImage);
    }
  }
  const masterLayerImages = new Map(imagesForLayer(defaultLayer));
  if (temporaryMasterLayerImages) {
    temporaryMasterLayerImages.forEach((image, tag) => {
      masterLayerImages.set(tag, image);
    });
  }
  const visibleImages = [...masterLayerImages.values()].map((image) => ({
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
  const { t } = useTranslation();
  const rows = useMemo(() => parseActionEditorContent(content), [content]);
  const scopedRows = useMemo(() => rowsThroughActiveRow(rows, activeRowId), [activeRowId, rows]);
  const assetContext = useMemo(() => buildActionEditorAssetContext(assetCatalog, localAssetUrls), [assetCatalog, localAssetUrls]);
  const sceneState = useMemo(() => sceneStateFromRows(scopedRows, assetContext), [assetContext, scopedRows]);
  const previewHasBackgroundImage = Boolean(sceneState.backgroundAsset.url);
  const loggedAssetDiagnosticsRef = useRef(new Set<string>());
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<Record<ActionEditorAudioPreviewChannel, boolean>>({
    music: false,
    sound: false,
  });
  const [audioVolumes, setAudioVolumes] = useState<Record<ActionEditorAudioPreviewChannel, number>>(() => ({
    music: getActionEditorAudioPreviewVolume('music'),
    sound: getActionEditorAudioPreviewVolume('sound'),
  }));
  const musicUrlRef = useRef(sceneState.musicAsset.url);
  const soundUrlRef = useRef(sceneState.soundAsset.url);

  useEffect(() => {
    const logOnce = (key: string, level: 'warn' | 'error', message: string, details: Record<string, unknown>) => {
      if (loggedAssetDiagnosticsRef.current.has(key)) {
        return;
      }
      loggedAssetDiagnosticsRef.current.add(key);
      console[level](message, details);
    };

    const reportImage = (
      role: string,
      name: string,
      asset: {
        path: string | null;
        localAvailable: boolean;
        composite?: {
          layers: Array<{ path: string; localAvailable: boolean }>;
        };
      },
    ) => {
      if (!name || name === 'black' || name === 'unknown') {
        return;
      }
      if (asset.composite) {
        const missingLayer = asset.composite.layers.find((layer) => !layer.localAvailable);
        if (!missingLayer || !shouldReportMissingLocalAssetUrl(assetContext, missingLayer.path)) {
          return;
        }
        logOnce(`image:no-url:${missingLayer.path}`, 'warn', '[ActionEditorAssets] Composite image layer has no local object URL.', {
          role,
          name,
          ...describeLocalAssetUrlState(assetContext, missingLayer.path),
        });
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
        if (!shouldReportMissingLocalAssetUrl(assetContext, asset.path)) {
          return;
        }
        logOnce(`image:no-url:${asset.path}`, 'warn', '[ActionEditorAssets] Image catalog match has no local object URL.', {
          role,
          name,
          ...describeLocalAssetUrlState(assetContext, asset.path),
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
        if (!shouldReportMissingLocalAssetUrl(assetContext, sceneState.musicAsset.path)) {
          return;
        }
        logOnce(`audio:no-url:${sceneState.musicAsset.path}`, 'warn', '[ActionEditorAssets] Audio catalog match has no local object URL.', {
          name: sceneState.music,
          ...describeLocalAssetUrlState(assetContext, sceneState.musicAsset.path),
        });
      }
    }
  }, [assetContext.audioEntries.length, assetContext.imageEntries.length, sceneState]);

  useEffect(
    () => () => {
      stopLocalAudioPreview('music');
      stopLocalAudioPreview('sound');
    },
    [],
  );

  useEffect(() => {
    if (musicUrlRef.current === sceneState.musicAsset.url) {
      return;
    }
    musicUrlRef.current = sceneState.musicAsset.url;
    stopLocalAudioPreview('music');
    setPlayingAudio((current) => ({ ...current, music: false }));
  }, [sceneState.musicAsset.url]);

  useEffect(() => {
    if (soundUrlRef.current === sceneState.soundAsset.url) {
      return;
    }
    soundUrlRef.current = sceneState.soundAsset.url;
    stopLocalAudioPreview('sound');
    setPlayingAudio((current) => ({ ...current, sound: false }));
  }, [sceneState.soundAsset.url]);

  const handleAudioPreview = useCallback(
    async (
      channel: ActionEditorAudioPreviewChannel,
      asset: ActionEditorResolvedAsset,
      details: { name: string; label: string },
    ) => {
      if (playingAudio[channel]) {
        stopLocalAudioPreview(channel);
        setPlayingAudio((current) => ({ ...current, [channel]: false }));
        return;
      }
      try {
        const result = await playLocalAudioPreview(asset.url, {
          channel,
          volume: audioVolumes[channel],
          onEnded: () => setPlayingAudio((current) => ({ ...current, [channel]: false })),
        });
        setPlayingAudio((current) => ({ ...current, [channel]: result === 'playing' }));
      } catch (error) {
        setPlayingAudio((current) => ({ ...current, [channel]: false }));
        console.error(`[ActionEditorAssets] Failed to play local ${details.label} preview.`, {
          name: details.name,
          path: asset.path,
          url: asset.url,
          error,
        });
      }
    },
    [audioVolumes, playingAudio],
  );

  const handleAudioVolumeChange = useCallback((channel: ActionEditorAudioPreviewChannel, value: string) => {
    const nextVolume = setActionEditorAudioPreviewVolume(channel, Number.parseFloat(value));
    setAudioVolumes((current) => ({ ...current, [channel]: nextVolume }));
    updateLocalAudioPreviewVolume(channel, nextVolume);
  }, []);

  return (
    <aside className="action-editor__sidebar action-editor-sidebar" aria-label={t('actionEditor.sidebar.aria')}>
      <section
        className={
          expandedPreview
            ? 'action-editor__side-panel action-editor-sidebar__preview action-editor-sidebar__preview--expanded'
            : 'action-editor__side-panel action-editor-sidebar__preview'
        }
      >
        <div className="action-editor-sidebar__panel-header">
          <h2>{t('actionEditor.sidebar.scenePreview')}</h2>
          <button
            aria-expanded={expandedPreview}
            aria-label={expandedPreview ? t('actionEditor.sidebar.collapsePreview') : t('actionEditor.sidebar.expandPreview')}
            className="action-editor-sidebar__preview-toggle"
            onClick={() => setExpandedPreview((current) => !current)}
            type="button"
          >
            <VisibilityOutlinedIcon aria-hidden="true" fontSize="small" />
          </button>
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
            {sceneState.visibleImages.map((image) => {
              const previewPlacement = previewPlacementFromPlacement(image.placement);
              if (image.asset.composite && image.asset.localAvailable) {
                const size = image.asset.composite.size;
                return (
                  <span
                    className={`action-editor-sidebar__local-asset action-editor-sidebar__local-asset--${previewPlacement.slot}`}
                    data-preview-image-name={image.name}
                    data-preview-placement={previewPlacement.slot}
                    key={`${image.name}-${image.placement}`}
                    style={previewPlacement.style}
                  >
                    {image.placement ? <small>{image.placement}</small> : null}
                    <span
                      className="action-editor-sidebar__composite-asset"
                      style={{ aspectRatio: `${size.width} / ${size.height}` }}
                    >
                      {image.asset.composite.layers.map((layer) => (
                        <img
                          alt={image.name}
                          data-composite-layer-path={layer.path}
                          key={layer.path}
                          onError={() =>
                            console.error('[ActionEditorAssets] Failed to render local composite image layer.', {
                              name: image.name,
                              path: layer.path,
                              url: layer.url,
                            })
                          }
                          src={layer.url ?? undefined}
                          style={{
                            left: `${(layer.x / size.width) * 100}%`,
                            top: `${(layer.y / size.height) * 100}%`,
                          }}
                        />
                      ))}
                    </span>
                  </span>
                );
              }
              return image.asset.url ? (
                <span
                  className={`action-editor-sidebar__local-asset action-editor-sidebar__local-asset--${previewPlacement.slot}`}
                  data-asset-path={image.asset.path ?? undefined}
                  data-preview-placement={previewPlacement.slot}
                  key={`${image.name}-${image.placement}`}
                  style={previewPlacement.style}
                >
                  {image.placement ? <small>{image.placement}</small> : null}
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
                </span>
              ) : (
                <span
                  className={`action-editor-sidebar__missing-asset action-editor-sidebar__missing-asset--${previewPlacement.slot}`}
                  data-asset-path={image.asset.path ?? undefined}
                  data-preview-placement={previewPlacement.slot}
                  key={`${image.name}-${image.placement}`}
                  style={previewPlacement.style}
                >
                  {image.placement ? <small>{image.placement}</small> : null}
                  <strong>{image.name}</strong>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="action-editor__side-panel">
        <h2>{t('actionEditor.sidebar.audio')}</h2>
        <div className="action-editor__audio-stack">
          <div className="action-editor__audio-row action-editor__audio-row--music">
            <MusicNoteIcon aria-hidden="true" fontSize="small" />
            <span>{t('actionEditor.sidebar.music')}:</span>
            <span className="action-editor__audio-value">
              <strong>{sceneState.music}</strong>
              {sceneState.musicOptions ? <small>{sceneState.musicOptions}</small> : null}
            </span>
            <button
              className="action-editor__audio-control"
              data-audio-path={sceneState.musicAsset.path ?? undefined}
              disabled={!sceneState.musicAsset.localAvailable}
              onClick={() => void handleAudioPreview('music', sceneState.musicAsset, { name: sceneState.music, label: 'music' })}
              type="button"
              aria-label={playingAudio.music ? t('actionEditor.sidebar.stopMusic') : t('actionEditor.sidebar.previewMusic')}
            >
              {playingAudio.music ? <StopIcon aria-hidden="true" fontSize="small" /> : <PlayArrowIcon aria-hidden="true" fontSize="small" />}
            </button>
            <label className="action-editor__audio-volume">
              <input
                aria-label={t('actionEditor.sidebar.musicVolume')}
                max="1"
                min="0"
                onChange={(event) => handleAudioVolumeChange('music', event.target.value)}
                step="0.05"
                type="range"
                value={audioVolumes.music}
              />
            </label>
            <button className="action-editor__audio-control" type="button" aria-label={t('actionEditor.sidebar.musicOptions')}>
              <MoreVertIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
          <div className="action-editor__audio-row action-editor__audio-row--sound">
            <VolumeUpIcon aria-hidden="true" fontSize="small" />
            <span>{t('actionEditor.sidebar.sound')}:</span>
            <span className="action-editor__audio-value">
              <strong>{sceneState.sound}</strong>
              {sceneState.soundOptions ? <small>{sceneState.soundOptions}</small> : null}
            </span>
            <button
              className="action-editor__audio-control"
              data-audio-path={sceneState.soundAsset.path ?? undefined}
              disabled={!sceneState.soundAsset.localAvailable}
              onClick={() => void handleAudioPreview('sound', sceneState.soundAsset, { name: sceneState.sound, label: 'sound' })}
              type="button"
              aria-label={playingAudio.sound ? t('actionEditor.sidebar.stopSound') : t('actionEditor.sidebar.previewSound')}
            >
              {playingAudio.sound ? <StopIcon aria-hidden="true" fontSize="small" /> : <PlayArrowIcon aria-hidden="true" fontSize="small" />}
            </button>
            <label className="action-editor__audio-volume">
              <input
                aria-label={t('actionEditor.sidebar.soundVolume')}
                max="1"
                min="0"
                onChange={(event) => handleAudioVolumeChange('sound', event.target.value)}
                step="0.05"
                type="range"
                value={audioVolumes.sound}
              />
            </label>
            <button
              className="action-editor__audio-control"
              data-audio-path={sceneState.soundAsset.path ?? undefined}
              type="button"
              aria-label={t('actionEditor.sidebar.soundOptions')}
            >
              <MoreVertIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
        </div>
      </section>

      {onNextAction ? (
        <section className="action-editor__side-panel">
          <h2>{t('actionEditor.sidebar.next')}</h2>
          <div className="action-editor__next-grid">
          <NextButton
            action="menu"
            description={t('actionEditor.sidebar.choiceDescription')}
            icon={<CallSplitIcon aria-hidden="true" fontSize="small" />}
            label={t('actionEditor.sidebar.choice')}
            onNextAction={onNextAction}
          />
          <NextButton
            action="conditional"
            description={t('actionEditor.sidebar.conditionalDescription')}
            icon={<AltRouteIcon aria-hidden="true" fontSize="small" />}
            label={t('actionEditor.sidebar.conditional')}
            onNextAction={onNextAction}
          />
          <NextButton
            action="jump"
            description={t('actionEditor.sidebar.jumpDescription')}
            icon={<LoginIcon aria-hidden="true" fontSize="small" />}
            label={t('actionEditor.sidebar.jump')}
            onNextAction={onNextAction}
          />
          <NextButton
            action="call"
            description={t('actionEditor.sidebar.callDescription')}
            icon={<SubdirectoryArrowRightIcon aria-hidden="true" fontSize="small" />}
            label={t('actionEditor.sidebar.call')}
            onNextAction={onNextAction}
          />
          <NextButton
            action="return"
            description={t('actionEditor.sidebar.returnDescription')}
            icon={<ArrowBackIcon aria-hidden="true" fontSize="small" />}
            label={t('actionEditor.sidebar.return')}
            onNextAction={onNextAction}
          />
          </div>
        </section>
      ) : null}
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
  onNextAction: (request: ActionEditorNextActionRequest) => void;
}) => {
  return (
    <button
      className={`action-editor-sidebar__next action-editor-sidebar__next--${action}`}
      onClick={() => onNextAction({ action })}
      type="button"
    >
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
};

export default ActionEditorSidebar;
