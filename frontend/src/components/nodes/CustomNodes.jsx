import React from 'react';
import { Handle, Position } from 'reactflow';
import './CustomNodes.css';

export const LabelBlockNode = ({ data, selected }) => {
  return (
    <div className={`label-block-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <div className="node-icon">L</div>
        <div className="node-title">Label</div>
      </div>
      <div className="node-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const ActionNode = ({ data, selected }) => {
  return (
    <div className={`action-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const IfBlockNode = ({ data, selected }) => {
  return (
    <div className={`if-block-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <div className="node-icon">IF</div>
        <div className="node-title">Condition</div>
      </div>
      <div className="node-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const MenuBlockNode = ({ data, selected }) => {
  return (
    <div className={`menu-block-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <div className="node-icon">M</div>
        <div className="node-title">Menu</div>
      </div>
      <div className="node-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const MenuOptionNode = ({ data, selected }) => {
  return (
    <div className={`menu-option-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <div className="node-icon">⋮</div>
        <div className="node-title">Option</div>
      </div>
      <div className="node-content">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const EndBlockNode = ({ data, selected }) => {
  return (
    <div className={`end-block-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-content">{data.label}</div>
    </div>
  );
};