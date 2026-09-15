import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import GpsFixedOutlinedIcon from '@mui/icons-material/GpsFixedOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProjectGraphDeletionImpact } from '../../utils/projectGraphDeletion';

interface ProjectGraphDeleteDialogProps {
  impact: ProjectGraphDeletionImpact;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onGoToNode: (nodeId: string) => void;
}

export const ProjectGraphDeleteDialog = ({
  impact,
  pending = false,
  error = null,
  onCancel,
  onConfirm,
  onGoToNode,
}: ProjectGraphDeleteDialogProps) => {
  const { t } = useTranslation();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, pending]);

  const deletedCount = Object.values(impact.deleteEntityIds).reduce((sum, ids) => sum + ids.length, 0);
  const hasBlockers = !impact.canDelete;

  return (
    <div className="project-graph-delete-dialog__backdrop project-graph-canvas__overlay" role="presentation">
      <section
        aria-label={t('canvas.deleteDialog.aria')}
        aria-modal="true"
        className="project-graph-delete-dialog"
        role="dialog"
      >
        <header className="project-graph-delete-dialog__header">
          <div className={`project-graph-delete-dialog__icon${hasBlockers ? ' project-graph-delete-dialog__icon--blocked' : ''}`}>
            {hasBlockers ? <ShieldOutlinedIcon /> : <DeleteForeverOutlinedIcon />}
          </div>
          <div>
            <div className="project-graph-delete-dialog__eyebrow">
              {t(`canvas.deleteDialog.entity.${impact.entity.kind}`)}
            </div>
            <h2>{hasBlockers ? t('canvas.deleteDialog.blockedTitle') : t('canvas.deleteDialog.title')}</h2>
            <code>{impact.entity.title}</code>
          </div>
        </header>

        <p className="project-graph-delete-dialog__summary">
          {hasBlockers
            ? t('canvas.deleteDialog.blockedSummary')
            : t('canvas.deleteDialog.summary', { count: deletedCount })}
        </p>

        {impact.incomingReferences.length > 0 ? (
          <div className="project-graph-delete-dialog__section">
            <h3><LinkOutlinedIcon fontSize="small" />{t('canvas.deleteDialog.incoming', { count: impact.incomingReferences.length })}</h3>
            <div className="project-graph-delete-dialog__references">
              {impact.incomingReferences.map((reference) => (
                <article className="project-graph-delete-dialog__reference" key={reference.edgeId}>
                  <div>
                    <strong>{reference.kind.toUpperCase()}</strong>
                    <span>{reference.sourceFilePath} · {reference.sourceLabelQualifiedName}</span>
                    <code>{reference.sourceNodeContent}</code>
                  </div>
                  <button onClick={() => onGoToNode(reference.sourceNodeId)} type="button">
                    <GpsFixedOutlinedIcon fontSize="small" />
                    {t('canvas.deleteDialog.goToReference')}
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {impact.blockers.length > 0 ? (
          <div className="project-graph-delete-dialog__section">
            <h3><ShieldOutlinedIcon fontSize="small" />{t('canvas.deleteDialog.protection')}</h3>
            {impact.blockers.map((blocker, index) => (
              <div className="project-graph-delete-dialog__blocker" key={`${blocker.code}-${blocker.nodeId ?? index}`}>
                <span>{t(`canvas.deleteDialog.blocker.${blocker.code}`)}</span>
                {blocker.nodeId ? (
                  <button onClick={() => onGoToNode(blocker.nodeId!)} type="button">
                    <GpsFixedOutlinedIcon fontSize="small" />{t('canvas.deleteDialog.goToReference')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {impact.warnings.length > 0 ? (
          <div className="project-graph-delete-dialog__section">
            <h3><WarningAmberOutlinedIcon fontSize="small" />{t('canvas.deleteDialog.consequences')}</h3>
            <ul>
              {impact.warnings.map((warning) => (
                <li key={warning.code}>{t(`canvas.deleteDialog.warning.${warning.code}`, { count: warning.count })}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <div className="project-graph-delete-dialog__error" role="alert">{error}</div> : null}
        <footer>
          <button disabled={pending} onClick={onCancel} type="button">{t('canvas.deleteDialog.cancel')}</button>
          <button className="project-graph-delete-dialog__delete" disabled={hasBlockers || pending} onClick={onConfirm} type="button">
            {pending ? t('canvas.deleteDialog.deleting') : t('canvas.deleteDialog.confirm')}
          </button>
        </footer>
      </section>
    </div>
  );
};
