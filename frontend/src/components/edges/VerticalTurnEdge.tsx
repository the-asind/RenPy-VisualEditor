import { memo, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from 'reactflow';

const APPROACH_OFFSET = 10;
const CORNER_RADIUS = 12;
const EPSILON = 0.0001;

const formatPadding = (padding?: number | [number, number]): string | undefined => {
  if (typeof padding === 'number') {
    return `${padding}px`;
  }

  if (Array.isArray(padding) && padding.length === 2) {
    const [horizontal, vertical] = padding;
    return `${vertical}px ${horizontal}px`;
  }

  return undefined;
};

const VerticalTurnEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) => {
  const verticalDistance = targetY - sourceY;
  const direction = verticalDistance >= 0 ? 1 : -1;
  const distanceMagnitude = Math.abs(verticalDistance);

  const approachDistance = distanceMagnitude > APPROACH_OFFSET
    ? APPROACH_OFFSET
    : distanceMagnitude / 2;

  const approachY = distanceMagnitude < EPSILON
    ? sourceY
    : targetY - direction * approachDistance;

  const points: Array<[number, number]> = [[sourceX, sourceY]];

  if (Math.abs(approachY - sourceY) > EPSILON) {
    points.push([sourceX, approachY]);
  }

  if (Math.abs(targetX - sourceX) > EPSILON) {
    points.push([targetX, approachY]);
  }

  if (Math.abs(targetY - approachY) > EPSILON) {
    points.push([targetX, targetY]);
  }

  const path = buildRoundedPath(points, CORNER_RADIUS);

  const hasHorizontalSegment = points.length >= 3;
  const labelX = hasHorizontalSegment
    ? (sourceX + targetX) / 2
    : (sourceX + targetX) / 2;
  const labelY = hasHorizontalSegment
    ? approachY
    : sourceY + (targetY - sourceY) / 2;

  const combinedLabelStyle: CSSProperties = {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
    pointerEvents: 'all',
    ...labelStyle,
  };

  if (labelShowBg) {
    Object.assign(combinedLabelStyle, {
      background: 'rgba(255, 255, 255, 0.8)',
      borderRadius: labelBgBorderRadius ?? 2,
      padding: formatPadding(labelBgPadding) ?? '2px 4px',
      ...labelBgStyle,
    });
  }

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div style={combinedLabelStyle}>{label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(VerticalTurnEdge);

function buildRoundedPath(points: Array<[number, number]>, radius: number): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x},${y}`;
  }

  const commands: string[] = [];
  const firstPoint = points[0];
  commands.push(`M ${firstPoint[0]},${firstPoint[1]}`);

  for (let i = 1; i < points.length; i += 1) {
    const current = points[i];
    const prev = points[i - 1];
    const next = points[i + 1];

    if (!next) {
      commands.push(`L ${current[0]},${current[1]}`);
      break;
    }

    const segmentIn: [number, number] = [current[0] - prev[0], current[1] - prev[1]];
    const segmentOut: [number, number] = [next[0] - current[0], next[1] - current[1]];

    if (
      (Math.abs(segmentIn[0]) < EPSILON && Math.abs(segmentIn[1]) < EPSILON) ||
      (Math.abs(segmentOut[0]) < EPSILON && Math.abs(segmentOut[1]) < EPSILON)
    ) {
      commands.push(`L ${current[0]},${current[1]}`);
      continue;
    }

    const lengthIn = Math.hypot(segmentIn[0], segmentIn[1]);
    const lengthOut = Math.hypot(segmentOut[0], segmentOut[1]);
    const cornerRadius = Math.min(radius, lengthIn / 2, lengthOut / 2);

    if (cornerRadius < EPSILON) {
      commands.push(`L ${current[0]},${current[1]}`);
      continue;
    }

    const [unitInX, unitInY] = [segmentIn[0] / lengthIn, segmentIn[1] / lengthIn];
    const [unitOutX, unitOutY] = [segmentOut[0] / lengthOut, segmentOut[1] / lengthOut];

    const cornerStart: [number, number] = [
      current[0] - unitInX * cornerRadius,
      current[1] - unitInY * cornerRadius,
    ];
    const cornerEnd: [number, number] = [
      current[0] + unitOutX * cornerRadius,
      current[1] + unitOutY * cornerRadius,
    ];

    commands.push(`L ${cornerStart[0]},${cornerStart[1]}`);
    commands.push(`Q ${current[0]},${current[1]} ${cornerEnd[0]},${cornerEnd[1]}`);
  }

  return commands.join(' ');
}
