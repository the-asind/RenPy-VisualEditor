export const ActionEditorDragHandle = () => (
  <button className="action-editor-drag-handle" type="button" aria-label="Reorder row">
    {Array.from({ length: 6 }, (_value, index) => (
      <span className="action-editor-drag-handle__dot" aria-hidden="true" key={index} />
    ))}
  </button>
);

export default ActionEditorDragHandle;
