import { useTranslation } from 'react-i18next';

export const ActionEditorDragHandle = () => {
  const { t } = useTranslation();
  return (
    <button className="action-editor-drag-handle" type="button" aria-label={t('actionEditor.writer.reorder')}>
      {Array.from({ length: 6 }, (_value, index) => (
        <span className="action-editor-drag-handle__dot" aria-hidden="true" key={index} />
      ))}
    </button>
  );
};

export default ActionEditorDragHandle;
