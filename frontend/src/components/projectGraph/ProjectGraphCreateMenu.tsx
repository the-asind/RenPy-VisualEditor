import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import { useTranslation } from 'react-i18next';

import type { GraphPoint } from '../../utils/projectGraphProjection';
import type { ProjectGraphStructureCommand } from '../../utils/projectGraphStructure';
import { isValidRenpyNameComponent, normalizeRelationTargetFilePath } from '../actionEditor/relationTargetModel';

export interface ProjectGraphCreateMenuFile {
  id: string;
  path: string;
}

export interface ProjectGraphCreateMenuLabel {
  id: string;
  fileId: string;
  qualifiedName: string;
}

export type ProjectGraphCreateMenuTarget =
  | { kind: 'canvas' }
  | { kind: 'file'; fileId: string; path: string }
  | { kind: 'label'; labelId: string; qualifiedName: string }
  | { kind: 'scenario'; nodeId: string; title: string };

export interface ProjectGraphCreateMenuState {
  client: GraphPoint;
  flow: GraphPoint;
  target: ProjectGraphCreateMenuTarget;
}

interface ProjectGraphCreateMenuProps {
  files: ProjectGraphCreateMenuFile[];
  labels: ProjectGraphCreateMenuLabel[];
  menu: ProjectGraphCreateMenuState;
  onCancel: () => void;
  onCreate: (command: ProjectGraphStructureCommand) => void | Promise<void>;
  onRequestDelete?: (entityId: string) => void;
}

type CreateMode = 'file' | 'label' | 'sublabel' | null;

export const ProjectGraphCreateMenu = ({ files, labels, menu, onCancel, onCreate, onRequestDelete }: ProjectGraphCreateMenuProps) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CreateMode>(null);
  const [value, setValue] = useState('');
  const [selectedFileId, setSelectedFileId] = useState(
    menu.target.kind === 'file' ? menu.target.fileId : files[0]?.id ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const parentLabel = useMemo(
    () => menu.target.kind === 'label' ? labels.find((label) => label.id === menu.target.labelId) : undefined,
    [labels, menu.target],
  );

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) onCancel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onCancel]);

  const chooseMode = (nextMode: Exclude<CreateMode, null>) => {
    setMode(nextMode);
    setValue('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    let command: ProjectGraphStructureCommand;
    if (mode === 'file') {
      const normalizedPath = normalizeRelationTargetFilePath(trimmed);
      if (!normalizedPath) {
        setError(t('canvas.createMenu.invalidFileName'));
        return;
      }
      command = { kind: 'file', path: normalizedPath, position: menu.flow };
    } else if (mode === 'label') {
      if (!selectedFileId) return;
      if (!isValidRenpyNameComponent(trimmed)) {
        setError(t('canvas.createMenu.invalidLabelName'));
        return;
      }
      command = { kind: 'label', fileId: selectedFileId, name: trimmed };
    } else if (mode === 'sublabel' && parentLabel) {
      if (!isValidRenpyNameComponent(trimmed)) {
        setError(t('canvas.createMenu.invalidLabelName'));
        return;
      }
      command = { kind: 'sublabel', parentLabelId: parentLabel.id, name: trimmed };
    } else {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCreate(command);
      onCancel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('canvas.createMenu.failed'));
      setPending(false);
    }
  };

  const maxLeft = typeof window === 'undefined' ? menu.client.x : Math.max(12, window.innerWidth - 356);
  const maxTop = typeof window === 'undefined' ? menu.client.y : Math.max(12, window.innerHeight - 320);
  const position = { left: Math.min(menu.client.x, maxLeft), top: Math.min(menu.client.y, maxTop) };

  return (
    <div
      aria-label={t('canvas.createMenu.aria')}
      className="project-graph-create-menu project-graph-canvas__overlay"
      ref={menuRef}
      role="menu"
      style={position}
    >
      <div className="project-graph-create-menu__eyebrow">
        {menu.target.kind === 'label'
          ? t('canvas.createMenu.insideLabel', { label: menu.target.qualifiedName })
          : menu.target.kind === 'scenario'
            ? menu.target.title
          : t('canvas.createMenu.addToProject')}
      </div>
      {menu.target.kind !== 'scenario' ? <button className="project-graph-create-menu__action" onClick={() => chooseMode('file')} role="menuitem" type="button">
          <CreateNewFolderOutlinedIcon fontSize="small" />
          <span>{t('canvas.createMenu.createFile')}</span>
        </button> : null}
      {menu.target.kind === 'label' ? (
        <button className="project-graph-create-menu__action" onClick={() => chooseMode('sublabel')} role="menuitem" type="button">
          <SubdirectoryArrowRightIcon fontSize="small" />
          <span>{t('canvas.createMenu.createSublabel', { label: menu.target.qualifiedName })}</span>
        </button>
      ) : menu.target.kind !== 'scenario' ? (
        <button className="project-graph-create-menu__action" disabled={files.length === 0} onClick={() => chooseMode('label')} role="menuitem" type="button">
          <BookmarkAddOutlinedIcon fontSize="small" />
          <span>{t('canvas.createMenu.createLabel')}</span>
        </button>
      ) : null}

      {onRequestDelete && menu.target.kind !== 'canvas' ? (
        <button
          className="project-graph-create-menu__action project-graph-create-menu__action--danger"
          onClick={() => {
            const entityId = menu.target.kind === 'file' ? menu.target.fileId : menu.target.kind === 'label' ? menu.target.labelId : menu.target.nodeId;
            onCancel();
            onRequestDelete(entityId);
          }}
          role="menuitem"
          type="button"
        >
          <DeleteOutlineOutlinedIcon fontSize="small" />
          <span>{t(`canvas.deleteDialog.menu.${menu.target.kind}`)}</span>
        </button>
      ) : null}

      {mode ? (
        <form className="project-graph-create-menu__form" onSubmit={submit}>
          <label>
            <span>{mode === 'file' ? t('canvas.createMenu.filePath') : t('canvas.createMenu.labelName')}</span>
            <input
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              placeholder={mode === 'file' ? 'chapter.rpy' : 'chapter_name'}
              spellCheck={false}
              value={value}
            />
          </label>
          {mode === 'label' && menu.target.kind !== 'file' ? (
            <label>
              <span>{t('canvas.createMenu.destinationFile')}</span>
              <select onChange={(event) => setSelectedFileId(event.target.value)} value={selectedFileId}>
                {files.map((file) => <option key={file.id} value={file.id}>{file.path}</option>)}
              </select>
            </label>
          ) : null}
          {error ? <div className="project-graph-create-menu__error" role="alert">{error}</div> : null}
          <div className="project-graph-create-menu__footer">
            <button onClick={() => setMode(null)} type="button">{t('canvas.createMenu.back')}</button>
            <button disabled={pending || !value.trim()} type="submit">{pending ? t('canvas.createMenu.creating') : t('canvas.createMenu.create')}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
};
