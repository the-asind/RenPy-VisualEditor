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

  const accent = display.tagColor?.trim() || display.accentColor || theme.palette.primary.main;
  const statusColor = display.status ? statusColorMap[display.status]?.(theme.palette) : undefined;
  const statusLabel = display.status
    ? t(NODE_STATUS_TRANSLATION_KEYS[display.status], display.status)
    : undefined;
  const tagLabel = display.tag?.trim() ? display.tag.trim() : undefined;
  const tagAccent = tagLabel ? (display.tagColor?.trim() || accent) : undefined;
  const isActionNode = display.type === 'action';
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
    ? alpha(theme.palette.common.white, showFullDetails ? 0.95 : 0.85)
    : alpha(theme.palette.common.black, showFullDetails ? 0.9 : 0.8);
  const verticalPadding = showFullDetails ? (isActionNode ? 16 : 18) : (isActionNode ? 12 : 14);
  const baseHorizontalPadding = showFullDetails ? (isActionNode ? 12 : 20) : (isActionNode ? 10 : 16);
  const contentRightPadding = showFullDetails ? (isActionNode ? 14 : 20) : (isActionNode ? 12 : 16);
  const statusGutter = statusColor ? (isActionNode ? 6 : 12) : 0;
  const contentLeftPadding = baseHorizontalPadding + statusGutter;
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
  const tagChipBorder = tagAccent ? alpha(tagAccent, theme.palette.mode === 'dark' ? 0.85 : 0.5) : undefined;
  const tagChipBackground = tagAccent ? alpha(tagAccent, theme.palette.mode === 'dark' ? 0.38 : 0.16) : undefined;
  const statusChipBorder = statusColor ? alpha(statusColor, theme.palette.mode === 'dark' ? 0.7 : 0.45) : undefined;
  const statusChipBackground = statusColor ? alpha(statusColor, theme.palette.mode === 'dark' ? 0.5 : 0.2) : undefined;

  const authorChipElement = showFullDetails && display.author
    ? (
        <Chip
          size="small"
          variant="outlined"
          label={display.author}
          title={display.author}
          sx={{
            px: 0.55,
            height: 22,
            borderColor: authorChipBorder,
            color: authorChipColor,
            fontWeight: 600,
            backgroundColor: authorChipBackground,
            backdropFilter: 'blur(4px)',
            maxWidth: '100%',
            '& .MuiChip-label': {
              px: 0.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
        />
      )
    : null;

  const tagChipElement = showFullDetails && tagLabel
    ? (
        <Chip
          size="small"
          variant="outlined"
          label={tagLabel}
          title={tagLabel}
          icon={(
            <Box
              component="span"
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: tagAccent,
                boxShadow: `0 0 0 1px ${alpha(tagAccent ?? accent, 0.6)}`,
              }}
            />
          )}
          sx={{
            px: 0.85,
            height: 22,
            fontWeight: 600,
            borderRadius: 999,
            borderColor: tagChipBorder,
            backgroundColor: tagChipBackground,
            color: theme.palette.mode === 'dark'
              ? alpha(theme.palette.common.white, 0.92)
              : alpha(theme.palette.common.black, 0.82),
            letterSpacing: 0.25,
            textTransform: 'none',
            maxWidth: 120,
            flexShrink: 1,
            '& .MuiChip-icon': {
              ml: 0,
              mr: 0.75,
            },
            '& .MuiChip-label': {
              px: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
        />
      )
    : null;

  const statusChipElement = showFullDetails && statusColor && statusLabel
    ? (
        <Chip
          size="small"
          variant="outlined"
          label={statusLabel}
          sx={{
            px: 0.9,
            height: 18,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            borderRadius: 999,
            borderColor: statusChipBorder,
            backgroundColor: statusChipBackground,
            color: theme.palette.getContrastText(statusColor),
            boxShadow: `0 4px 12px ${alpha(statusColor, 0.2)}`,
            '& .MuiChip-label': {
              px: 0.4,
              lineHeight: '16px',
            },
          }}
        />
      )
    : null;

  const showMetaRow = Boolean(isActionNode && (authorChipElement || tagChipElement || statusChipElement));

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

        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          gap: showTitleText
            ? (showFullDetails ? (isActionNode ? 0.9 : 1.15) : 0.6)
            : 0.6,
            justifyContent: showTitleText
              ? (isActionNode ? 'flex-start' : 'center')
              : 'center',
            alignItems: showTitleText
              ? (isActionNode ? 'flex-start' : 'center')
              : 'center',
            textAlign: showTitleText && !isActionNode ? 'center' : 'left',
            py: `${verticalPadding}px`,
            pr: `${contentRightPadding}px`,
            pl: `${contentLeftPadding}px`,
            minHeight: 88,
          }}
        >
          {showTitleText ? (
            <Typography
              variant="body1"
              sx={{
                fontWeight: isActionNode ? 700 : 600,
                lineHeight: 1.25,
                color: titleColor,
                fontSize: showFullDetails
                  ? (isActionNode ? 16 : 18)
                  : isActionNode
                    ? 13
                    : 14,
                letterSpacing: showFullDetails
                  ? (isActionNode ? 0.2 : 0.25)
                  : (isActionNode ? 0.35 : 0.3),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: isActionNode ? 'left' : 'center',
                width: '100%',
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
                alignItems: isActionNode ? 'flex-start' : 'center',
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
          {showMetaRow && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr) minmax(0, auto)',
                alignItems: 'flex-end',
                columnGap: 0.5,
                width: '100%',
                pt: showFullDetails ? 0.4 : 0.2,
                mt: 'auto',
              }}
            >
              <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
                {authorChipElement}
              </Box>
              <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                {tagChipElement}
              </Box>
              <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
                {statusChipElement}
              </Box>
            </Box>
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
