import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { Box, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { FlowNodeDataPayload } from '../../utils/flowTransformer';
import type { NodeStatus } from '../../utils/nodeMetadata';
import { NODE_STATUS_TRANSLATION_KEYS } from '../../utils/nodeMetadata';

const statusColorMap: Record<NodeStatus, (palette: Theme['palette']) => string> = {
  Done: (palette) => palette.success.main,
  'In progress': (palette) => palette.warning.main,
  'To Do': (palette) => palette.error.main,
};

const zoomSelector = (state: any) => state.transform?.[2] ?? 1;

const VisualNode = memo<NodeProps<FlowNodeDataPayload>>(({ data, selected }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const display = data?.display;
  const zoom = useStore(zoomSelector);

  const skeletonWidths = useMemo(() => {
    const length = display?.title?.length ?? 0;
    const clamped = Math.min(Math.max(length, 6), 28);
    const ratio = clamped / 28;
    return {
      primary: 45 + ratio * 35,
      secondary: 30 + ratio * 25,
    };
  }, [display?.title]);

  if (!display) {
    return null;
  }

  const accent = display.accentColor || theme.palette.primary.main;
  const statusColor = display.status ? statusColorMap[display.status]?.(theme.palette) : undefined;
  const statusLabel = display.status
    ? t(NODE_STATUS_TRANSLATION_KEYS[display.status], display.status)
    : undefined;
  const authorPrefix = t('editor.nodeEditor.authorChipPrefix', 'by');
  const showFullDetails = zoom >= 0.55;
  const showTitleText = zoom >= 0.35;
  const isUltraCompact = zoom < 0.2;
  const baseBackground = theme.palette.mode === 'dark'
    ? alpha(accent, showFullDetails ? 0.26 : 0.18)
    : alpha(accent, showFullDetails ? 0.16 : 0.1);
  const backgroundGradient = showFullDetails
    ? `linear-gradient(135deg, ${alpha(accent, 0.32)} 0%, ${alpha(accent, 0.08)} 100%)`
    : 'none';
  const borderColor = alpha(accent, showFullDetails ? 0.95 : 0.65);
  const restingShadow = showFullDetails
    ? (selected
        ? `0 18px 40px ${alpha(accent, 0.32)}`
        : `0 12px 28px ${alpha(accent, 0.18)}`
      )
    : 'none';
  const hoverShadow = `0 20px 44px ${alpha(accent, 0.28)}`;
  const skeletonBase = theme.palette.mode === 'dark'
    ? theme.palette.common.white
    : theme.palette.common.black;
  const skeletonPrimary = alpha(skeletonBase, 0.55);
  const skeletonSecondary = alpha(skeletonBase, 0.35);
  const titleColor = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, showFullDetails ? 0.94 : 0.85)
    : alpha(theme.palette.common.black, showFullDetails ? 0.9 : 0.78);
  const verticalPadding = showFullDetails ? 18 : 14;
  const horizontalPadding = showFullDetails ? 20 : 16;
  const contentLeftPadding = statusColor ? horizontalPadding + 14 : horizontalPadding;
  const handleShadow = showFullDetails ? `0 0 0 3px ${alpha(accent, 0.12)}` : 'none';
  const handleBorder = alpha(accent, theme.palette.mode === 'dark' ? 0.5 : 0.25);
  const authorChipBorder = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.25)
    : alpha(theme.palette.common.black, 0.2);
  const authorChipColor = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.75)
    : alpha(theme.palette.common.black, 0.7);
  const authorChipBackground = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.08)
    : alpha(theme.palette.common.white, 0.6);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: alpha(accent, 0.85),
          border: `2px solid ${handleBorder}`,
          boxShadow: handleShadow,
        }}
      />

      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          border: `2px solid ${borderColor}`,
          backgroundColor: baseBackground,
          backgroundImage: backgroundGradient,
          boxShadow: restingShadow,
          overflow: 'hidden',
          minHeight: 88,
          transform: showFullDetails && selected ? 'translateY(-2px)' : 'translateY(0)',
          transition: theme.transitions.create(['box-shadow', 'transform', 'border-color', 'background-color'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: -3,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            border: `2px solid ${alpha(accent, 0.55)}`,
            boxShadow: `0 0 0 4px ${alpha(accent, 0.18)}`,
            opacity: selected ? 1 : 0,
            transition: theme.transitions.create(['opacity'], {
              duration: theme.transitions.duration.shorter,
            }),
          },
          '&:hover': showFullDetails
            ? {
                boxShadow: hoverShadow,
                borderColor: accent,
                transform: 'translateY(-4px)',
              }
            : undefined,
          '&:hover::after': showFullDetails
            ? {
                opacity: 1,
              }
            : undefined,
        }}
      >
        {statusColor && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: 6,
              background: `linear-gradient(180deg, ${alpha(statusColor, 0.95)} 0%, ${alpha(statusColor, 0.5)} 100%)`,
            }}
          />
        )}

        {statusColor && statusLabel && showTitleText && (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              px: 1.25,
              py: 0.4,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${alpha(statusColor, 0.85)} 0%, ${alpha(statusColor, 0.55)} 100%)`,
              color: theme.palette.getContrastText(statusColor),
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              boxShadow: `0 10px 18px ${alpha(statusColor, 0.35)}`,
            }}
          >
            {statusLabel}
          </Box>
        )}

        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: showFullDetails ? 1 : 0.75,
            justifyContent: showTitleText ? 'flex-start' : 'center',
            py: `${verticalPadding}px`,
            pr: `${horizontalPadding}px`,
            pl: `${contentLeftPadding}px`,
            minHeight: 88,
          }}
        >
          {showTitleText ? (
            <Typography
              variant={showFullDetails ? 'subtitle1' : 'body2'}
              sx={{
                fontWeight: 700,
                lineHeight: 1.25,
                color: titleColor,
                textTransform: showFullDetails ? 'none' : 'uppercase',
                letterSpacing: showFullDetails ? 0.3 : 1.1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {display.title}
            </Typography>
          ) : (
            <Box
              sx={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: skeletonPrimary,
                  width: `${skeletonWidths.primary}%`,
                }}
              />
              {!isUltraCompact && (
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: skeletonSecondary,
                    width: `${skeletonWidths.secondary}%`,
                  }}
                />
              )}
            </Box>
          )}

          {showFullDetails && display.author && (
            <Chip
              size="small"
              variant="outlined"
              label={`${authorPrefix} ${display.author}`}
              sx={{
                mt: 0.75,
                alignSelf: 'flex-start',
                borderColor: authorChipBorder,
                color: authorChipColor,
                fontWeight: 600,
                backgroundColor: authorChipBackground,
                backdropFilter: 'blur(4px)',
              }}
            />
          )}
        </Box>
      </Box>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: alpha(accent, 0.85),
          border: `2px solid ${handleBorder}`,
          boxShadow: handleShadow,
        }}
      />
    </Box>
  );
});

VisualNode.displayName = 'VisualNode';

export default VisualNode;
