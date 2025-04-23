import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { python } from "@codemirror/lang-python";
import { Theme } from '@mui/material/styles';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
  IconButton,
  Tooltip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface NodeEditorPopupProps {
  open: boolean;
  onClose: () => void;
  nodeData: any;
  initialContent: string;
  scriptId: string;
  onSave: (startLine: number, endLine: number, newContent: string) => Promise<void>;
  onSwitchToGlobal: () => void;
  isLoading: boolean;
}


declare module '@mui/material/styles' {
  interface Theme {
    custom?: {
      nodeColors?: {
        [key: string]: string;
      };
    };
  }
}

const NodeEditorPopup: React.FC<NodeEditorPopupProps> = ({
  open,
  onClose,
  nodeData,
  initialContent,
  scriptId,
  onSave,
  onSwitchToGlobal,
  isLoading,
}) => {  const { t } = useTranslation();
  const theme = useTheme() as Theme;
  
  
  const [value, setValue] = useState<string>(initialContent);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [hasReturnWarning, setHasReturnWarning] = useState<boolean>(false);
  const [baseIndent, setBaseIndent] = useState<string>('');

  
  const removeBaseIndent = (content: string): string => {
    if (!content) return '';
    
    const lines = content.split('\n');
    if (lines.length === 0) return '';
    
    
    let firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    if (!firstNonEmptyLine) return content;
    
    const indentMatch = firstNonEmptyLine.match(/^(\s+)/);
    const indentString = indentMatch ? indentMatch[1] : '';
    
    
    const invalidLine = lines.find(line => {
      
      if (line.trim().length === 0) return false;
      
      
      return !line.startsWith(indentString);
    });
    
    if (invalidLine) {
      throw new Error(t('nodeEditor.errorInvalidIndent', 'Обнаружена строка с отступом меньше, чем в первой строке'));
    }
    
    
    setBaseIndent(indentString);
    
    
    return lines.map(line => {
      if (line.trim().length === 0) return line;
      return line.replace(new RegExp(`^${indentString}`), '');
    }).join('\n');
  };

  
  const addBaseIndent = (content: string): string => {
    if (!content) return '';
    if (!baseIndent) return content;
    
    const lines = content.split('\n');
    
    return lines.map(line => {
      
      if (line.trim().length > 0) {
        return baseIndent + line;
      }
      
      return line;
    }).join('\n');
  };

  
  useEffect(() => {
    if (open) {
      try {
        
        const contentWithoutIndent = removeBaseIndent(initialContent);
        setValue(contentWithoutIndent);
        setHasUnsavedChanges(false);
        setSaveError(null);
        setIsSaving(false);
        setHasReturnWarning(false);
      } catch (error: any) {
        
        console.error("Ошибка обработки отступов:", error);
        setValue(initialContent);
        setSaveError(error.message);
        setHasUnsavedChanges(false);
        setIsSaving(false);
        setHasReturnWarning(false);
      }
    }
  }, [open, initialContent]);

  
  const onChange = useMemo(() => {
    return (val: string) => {
      setValue(val);
      setHasUnsavedChanges(val !== initialContent);
      setSaveError(null);
      setHasReturnWarning(/^\s*return\b/gm.test(val));
    };
  }, [initialContent]);
  const handleSave = async () => {
    const startLine = nodeData?.originalData?.start_line || nodeData?.data?.originalData?.start_line;
    const endLine = nodeData?.originalData?.end_line || nodeData?.data?.originalData?.end_line;
    
    if (!startLine || !endLine) {
      console.error("Missing line data in node:", nodeData);
      setSaveError(t('nodeEditor.errorMissingLines', 'Не удалось определить диапазон строк для редактирования'));
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    try {
      
      const contentWithIndent = addBaseIndent(value);
      await onSave(
        startLine,
        endLine,
        contentWithIndent
      );
      setHasUnsavedChanges(false);
      onClose();
    } catch (error: any) {
      console.error("Error saving node:", error);
      setSaveError(error.message || t('nodeEditor.errorGenericSave', 'Не удалось сохранить изменения'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm(t('nodeEditor.confirmDiscard', 'Вы уверены, что хотите отменить несохраненные изменения?'))) {
        return;
      }
    }
    onClose();
  };

  const handleSwitch = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm(t('nodeEditor.confirmSwitchUnsaved', 'У вас есть несохраненные изменения. Продолжить переключение на полный редактор?'))) {
        return;
      }
    }
    onSwitchToGlobal();
    onClose();
  };

  
  const nodeType = nodeData?.originalData?.node_type || nodeData?.data?.originalData?.node_type || 'Action';
  
  
  const getNodeColor = (): string => {
    if (theme.custom?.nodeColors && nodeType.toLowerCase() in theme.custom.nodeColors) {
      return theme.custom.nodeColors[nodeType.toLowerCase()];
    }
    return theme.palette.primary.main;
  };
  
  const nodeColor = getNodeColor();

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        if (reason === 'backdropClick' && hasUnsavedChanges) {
          window.alert(t('nodeEditor.alertCloseUnsaved', 'У вас есть несохраненные изменения.'));
          return;
        }
        handleDiscard();
      }}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: `4px solid ${nodeColor}`,
          borderRadius: '8px',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {t('nodeEditor.title', 'Редактор узла')} - <span style={{ color: nodeColor, fontWeight: 'bold' }}>{nodeData?.label || nodeData?.id}</span>
        </Typography>
        <Tooltip title={t('nodeEditor.discardTooltip', 'Закрыть без сохранения')}>
          <IconButton onClick={handleDiscard} size="small">
            <CancelIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box className="editor-container" sx={{ width: '100%' }}>
            <CodeMirror
              value={value}
              height="400px"
              onChange={onChange}
              theme={theme.palette.mode === 'dark' ? 'dark' : 'light'}
              style={{ width: '100%' }}
              autoFocus={true}
              indentWithTab={true}              
              extensions={[python()]}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                foldGutter: true,
                tabSize: 4,
              }}
              
            />
          </Box>
        )}
        {saveError && (
          <Alert severity="error" sx={{ mt: 1, mx: 2, mb: 1 }}>{saveError}</Alert>
        )}
        {hasReturnWarning && (
          <Alert severity="warning" sx={{ mt: 1, mx: 2, mb: 1 }}>
            {t('nodeEditor.warningReturn', 'Обнаружен оператор "return". Последующие блоки могут быть недостижимы.')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Box>
          <Tooltip title={t('nodeEditor.switchToGlobalTooltip', 'Открыть полный редактор файла')}>
            <Button
              onClick={handleSwitch}
              startIcon={<OpenInNewIcon />}
              variant="outlined"
              size="small"
              sx={{ mr: 1 }}
            >
              {t('nodeEditor.switchToGlobal', 'Перейти в полный редактор')}
            </Button>
          </Tooltip>
          {hasUnsavedChanges && (
            <Tooltip title={t('nodeEditor.unsavedChangesTooltip', 'У вас есть несохраненные изменения')}>
              <WarningAmberIcon color="warning" sx={{ verticalAlign: 'middle', ml: 1 }}/>
            </Tooltip>
          )}
        </Box>
        <Box>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            disabled={isSaving || !hasUnsavedChanges}
            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            sx={{ mr: 1 }}
          >
            {t('nodeEditor.save', 'Сохранить')}
          </Button>
          <Button
            onClick={handleDiscard}
            variant="outlined"
            color="secondary"
            startIcon={<CancelIcon />}
            disabled={isSaving}
          >
            {t('nodeEditor.discard', 'Отмена')}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default NodeEditorPopup;
