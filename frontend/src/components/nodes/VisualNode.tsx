import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { Box, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { FlowNodeDataPayload } from '../../utils/flowTransformer';
import type { NodeStatus } from '../../utils/nodeMetadata';
import { NODE_STATUS_TRANSLATION_KEYS } from '../../utils/nodeMetadata';

const statusColorMap: Record<NodeStatus, (palette: Theme['palette']) => string> = {
  Done: (palette) => palette.success.main,
  'In progress': (palette) => palette.warning.main,
  'To Do': (palette) => palette.info.main,
};

const VisualNode = memo<NodeProps<FlowNodeDataPayload>>(({ data, selected }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const display = data?.display;

  const baseStyles = useMemo(() => {
    if (!display) {
      return null;
    }

    const accent = display.accentColor || theme.palette.primary.main;
    const headerBg = theme.palette.mode === 'dark'
      ? alpha(accent, 0.25)
      : alpha(accent, 0.12);
    const border = alpha(accent, 0.8);
    const panelGradientStart = theme.palette.mode === 'dark'
      ? alpha(accent, 0.18)
      : alpha(accent, 0.06);
    const panelGradientEnd = theme.palette.mode === 'dark'
      ? alpha(accent, 0.08)
      : alpha(accent, 0.02);

    return {
      accent,
      headerBg,
      border,
      panelGradientStart,
      panelGradientEnd,
    };
  }, [display, theme]);

  if (!display || !baseStyles) {
    return null;
  }

  const { accent, headerBg, border, panelGradientStart, panelGradientEnd } = baseStyles;
  const statusColor = display.status ? statusColorMap[display.status]?.(theme.palette) : undefined;
  const statusLabel = display.status
    ? t(NODE_STATUS_TRANSLATION_KEYS[display.status], display.status)
    : undefined;
  const authorPrefix = t('editor.nodeEditor.authorChipPrefix', 'by');

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: alpha(accent, 0.9),
          border: `2px solid ${alpha(accent, theme.palette.mode === 'dark' ? 0.4 : 0.2)}`,
          boxShadow: `0 0 0 3px ${alpha(accent, 0.12)}`,
        }}
      />

      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          border: `1.5px solid ${border}`,
          backgroundImage: `linear-gradient(180deg, ${panelGradientStart} 0%, ${panelGradientEnd} 100%)`,
          backdropFilter: 'blur(2px)',
          boxShadow: selected
            ? `0 18px 38px ${alpha(accent, 0.35)}`
            : `0 10px 28px ${alpha(accent, 0.18)}`,
          overflow: 'hidden',
          minHeight: 120,
          transform: selected ? 'translateY(-2px)' : 'translateY(0)',
          transition: theme.transitions.create(['box-shadow', 'transform', 'border-color'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: -2,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            boxShadow: selected
              ? `0 0 0 2px ${alpha(accent, 0.4)}`
              : `0 0 0 0 ${alpha(accent, 0.25)}`,
            opacity: selected ? 1 : 0,
            transition: theme.transitions.create(['box-shadow', 'opacity'], {
              duration: theme.transitions.duration.shorter,
            }),
          },
          '&:hover': {
            boxShadow: `0 20px 44px ${alpha(accent, 0.28)}`,
            borderColor: accent,
            transform: 'translateY(-4px)',
          },
          '&:hover::after': {
            opacity: 1,
            boxShadow: `0 0 0 3px ${alpha(accent, 0.3)}`,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            background: headerBg,
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: accent,
              flexShrink: 0,
            }}
          />
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: theme.palette.getContrastText(headerBg),
            }}
          >
            {display.title}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              backgroundColor: alpha(accent, theme.palette.mode === 'dark' ? 0.35 : 0.2),
              color: theme.palette.getContrastText(accent),
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.75,
            }}
          >
            {display.typeLabel}
          </Typography>
        </Box>

        <Box sx={{ px: 1.5, py: 1.25 }}>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              color: alpha(theme.palette.text.primary, 0.85),
              lineHeight: 1.45,
            }}
          >
            {display.summary}
          </Typography>
        </Box>

        {(display.status || display.author) && (
          <Box
            sx={{
              px: 1.5,
              pb: 1.25,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.75,
            }}
          >
            {display.status && statusColor && (
              <Chip
                size="small"
                label={statusLabel}
                sx={{
                  backgroundColor: alpha(statusColor, theme.palette.mode === 'dark' ? 0.2 : 0.15),
                  color: theme.palette.getContrastText(statusColor),
                  fontWeight: 700,
                }}
              />
            )}
            {display.author && (
              <Chip
                size="small"
                variant="outlined"
                label={`${authorPrefix} ${display.author}`}
                sx={{
                  borderColor: alpha(theme.palette.text.primary, 0.2),
                  color: alpha(theme.palette.text.primary, 0.7),
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
        )}
      </Box>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: alpha(accent, 0.9),
          border: `2px solid ${alpha(accent, theme.palette.mode === 'dark' ? 0.4 : 0.2)}`,
          boxShadow: `0 0 0 3px ${alpha(accent, 0.12)}`,
        }}
      />
    </Box>
  );
});

VisualNode.displayName = 'VisualNode';

export default VisualNode;
