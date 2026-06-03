import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import LoginIcon from '@mui/icons-material/Login';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import { parseActionEditorContent, type ActionEditorCommandRow } from './actionEditorModel';

export type ActionEditorNextAction = 'menu' | 'conditional' | 'jump' | 'call' | 'return';

export interface ActionEditorSidebarProps {
  content: string;
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

const sceneStateFromRows = (rows: ActionEditorCommandRow[]) => {
  const background = findLastCommand(rows, 'scene')?.primary ?? 'unknown';
  const visibleImages = rows.filter((row) => row.kind === 'show').map((row) => row.primary);
  const music = findLastCommand(rows, 'music')?.primary ?? 'none';
  const sound = findLastCommand(rows, 'sound')?.primary ?? 'none';
  return { background, visibleImages, music, sound };
};

export const ActionEditorSidebar = ({ content, onNextAction }: ActionEditorSidebarProps) => {
  const commandRows = parseActionEditorContent(content).filter(
    (row): row is ActionEditorCommandRow =>
      row.kind === 'scene' ||
      row.kind === 'show' ||
      row.kind === 'hide' ||
      row.kind === 'music' ||
      row.kind === 'sound' ||
      row.kind === 'transition',
  );
  const sceneState = sceneStateFromRows(commandRows);

  return (
    <aside className="action-editor__sidebar action-editor-sidebar" aria-label="Scene writing aids">
      <section className="action-editor__side-panel action-editor-sidebar__preview">
        <div className="action-editor-sidebar__panel-header">
          <h2>Scene preview</h2>
          <VisibilityOutlinedIcon aria-hidden="true" fontSize="small" />
        </div>
        <div className="action-editor__preview-placeholder action-editor-sidebar__scene-art">
          <div className="action-editor-sidebar__classroom" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="action-editor-sidebar__standees" aria-hidden="true">
            {sceneState.visibleImages.slice(0, 2).map((image, index) => (
              <span
                className={`action-editor-sidebar__standee action-editor-sidebar__standee--${index === 0 ? 'left' : 'right'}`}
                key={image}
              />
            ))}
          </div>
          <span className="action-editor-sidebar__background">{sceneState.background}</span>
          <div className="action-editor-sidebar__characters">
            {sceneState.visibleImages.map((image) => (
              <span className="action-editor-sidebar__character" key={image}>
                {image}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="action-editor__side-panel">
        <h2>Audio</h2>
        <div className="action-editor__audio-row">
          <MusicNoteIcon aria-hidden="true" fontSize="small" />
          <span>Music:</span>
          <strong>{sceneState.music}</strong>
        </div>
        <div className="action-editor__audio-row">
          <MusicNoteIcon aria-hidden="true" fontSize="small" />
          <span>Sound:</span>
          <strong>{sceneState.sound}</strong>
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
};

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
