import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
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
import { useCollab } from '../contexts/CollabContext';

interface NodeOriginalData {
  start_line?: number;
  end_line?: number;
  node_type?: string;
}

interface NodeData {
  label?: string;
  id?: string;
  originalData?: NodeOriginalData;
  data?: {
    originalData?: NodeOriginalData;
  };
}

interface NodeEditorPopupProps {
  open: boolean;
  onClose: () => void;
  nodeData: NodeData;
  initialContent: string;
  scriptId: string;
  onSave: (startLine: number, endLine: number, newContent: string) => Promise<void>;
  onSwitchToGlobal: () => void;
  isLoading: boolean;
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
  const { lockNode, releaseNodeLock, startEditingNode, updateNode } = useCollab();


  const [value, setValue] = useState<string>(initialContent);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasLock, setHasLock] = useState<boolean>(false);
  const [readOnly, setReadOnly] = useState<boolean>(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [hasReturnWarning, setHasReturnWarning] = useState<boolean>(false);
  const [baseIndent, setBaseIndent] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'discard' | 'switch' | null }>({ open: false, type: null });

  
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

  // Acquire lock when popup opens
  useEffect(() => {
    let isActive = true;
    if (open && nodeData?.id) {
      setReadOnly(true);
      lockNode(nodeData.id).then(success => {
        if (!isActive) return;
        setHasLock(success);
        setReadOnly(!success);
        if (success) {
          startEditingNode(nodeData.id);
        }
      });
    }
    return () => {
      isActive = false;
      if (nodeData?.id) {
        releaseNodeLock(nodeData.id);
      }
      setHasLock(false);
      setReadOnly(true);
    };
  }, [open, nodeData?.id, lockNode, releaseNodeLock, startEditingNode]);

  
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
      await onSave(startLine, endLine, contentWithIndent);
      updateNode(nodeData.id!, contentWithIndent);
      setHasUnsavedChanges(false);
      if (nodeData.id) {
        releaseNodeLock(nodeData.id);
      }
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
      setConfirmDialog({ open: true, type: 'discard' });
      return;
    }
    if (nodeData.id) {
      releaseNodeLock(nodeData.id);
    }
    onClose();
  };

  const handleSwitch = () => {
    if (hasUnsavedChanges) {
      setConfirmDialog({ open: true, type: 'switch' });
      return;
    }
    onSwitchToGlobal();
    if (nodeData.id) {
      releaseNodeLock(nodeData.id);
    }
    onClose();
  };

  const handleConfirmDialogClose = (confirmed: boolean) => {
    if (confirmed) {
      if (confirmDialog.type === 'discard') {
        if (nodeData.id) releaseNodeLock(nodeData.id);
        onClose();
      } else if (confirmDialog.type === 'switch') {
        onSwitchToGlobal();
        if (nodeData.id) releaseNodeLock(nodeData.id);
        onClose();
      }
    }
    setConfirmDialog({ open: false, type: null });
  };

  
  const nodeType = nodeData?.originalData?.node_type || nodeData?.data?.originalData?.node_type || 'Action';
  
  
  const getNodeColor = (): string => {
    if (theme.custom?.nodeColors && nodeType.toLowerCase() in theme.custom.nodeColors) {
      return theme.custom.nodeColors[nodeType.toLowerCase()];
    }
    return theme.palette.primary.main;
  };
  
  const nodeColor = getNodeColor();


  // --- Monaco Editor расширения ---
  const handleMonacoMount = useCallback((editor: any, monaco: any) => {
    // Глобальная настройка языка Ren'Py, выполняется только один раз.
    if (!monaco.languages.getLanguages().some((l: any) => l.id === 'renpy')) {
      // 1. Расширенная подсветка Monarch
      const renpyMonarch = {
        defaultToken: '',
        tokenPostfix: '.renpy',
        keywords: [
          'label','call','jump','menu','choice','if','elif','else',
          'screen','return','python','init','define','show','hide'
        ],
        tokenizer: {
          root: [
            // метки
            [/^[ \t]*[a-zA-Z_]\w*:/, 'keyword'],
            // комментарии
            [/#.*$/,          'comment'],
            // диалоги  "Mary Hello!"
            [/\"[^\"]*\"/,     'string'],
            // имена персонажей перед двоеточием
            [/^[ \t]*[A-Z][A-Za-z_0-9]*[ \t]+\"/, 'type.identifier' ],
            // python-блок
            [/^\s*\$.*$/,     'number'],
          ]
        }
      };
      monaco.languages.register({ id: 'renpy' });
      monaco.languages.setMonarchTokensProvider('renpy', renpyMonarch);
      monaco.languages.setLanguageConfiguration('renpy', {
        comments: { lineComment: '#' },
        brackets: [['(', ')'], ['[', ']'], ['{', '}']],
        autoClosingPairs: [
          { open: '(', close: ')' },
          { open: '[', close: ']' },
          { open: '{', close: '}' },
          { open: '"', close: '"', notIn: ['string'] }
        ],
        indentationRules: {
          increaseIndentPattern: /^\s*(label|menu|if|elif|else|python|screen).*:\s*$/,
          decreaseIndentPattern: /^\s*(return|pass)\b/
        }
      });

      // 2. Кастомные темы Monaco (тёмная и светлая)
      monaco.editor.defineTheme('renpyDark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword',         foreground: 'FF9D00', fontStyle:'bold' },
          { token: 'comment',         foreground: '6A9955', fontStyle:'italic' },
          { token: 'string',          foreground: 'CE9178' },
          { token: 'type.identifier', foreground: '4FC1FF' }
        ],
        colors: {
          'editor.background': '#1e1e1e',
          'editor.foreground': '#d4d4d4',
        }
      });
      monaco.editor.defineTheme('renpyLight', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'keyword',         foreground: 'b46900', fontStyle:'bold' },
          { token: 'comment',         foreground: '008000', fontStyle:'italic' },
          { token: 'string',          foreground: 'a31515' },
          { token: 'type.identifier', foreground: '267f99' }
        ],
        colors: {
          'editor.background': '#fff',
          'editor.foreground': '#1e1e1e',
        }
      });

      // 3. Автодополнение и сниппеты
      monaco.languages.registerCompletionItemProvider('renpy', {
        triggerCharacters: [' ', ':'],
        provideCompletionItems(model: any, pos: any) {
          const suggestions: any[] = [];
          for (const kw of ['label','call','jump','menu','return']) {
            suggestions.push({
              label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: kw
            });
          }
          suggestions.push({
            label: 'menu-snippet',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Базовый блок меню',
            insertText: [
              'menu:',
              '\t"{{Вопрос?}}":',
              '\t\tpass',
              '\t"Отмена":',
              '\t\treturn',
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          });
          // Динамические имена персонажей (поиск по тексту)
          const text = model.getValue();
          const charNames = Array.from(new Set(
            (text.match(/^\s*([A-Z][A-Za-z_0-9]*)[ \t]+\"/gm) || [])
              .map(l => l.match(/^\s*([A-Z][A-Za-z_0-9]*)[ \t]+\"/)?.[1])
              .filter(Boolean)
          ));
          for (const name of charNames) {
            suggestions.push({
              label: name,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: name
            });
          }
          return { suggestions };
        }
      });

      // 4. Hover-подсказки
      monaco.languages.registerHoverProvider('renpy', {
        provideHover(model: any, position: any) {
          const word = model.getWordAtPosition(position);
          if (word?.word === 'menu') {
            return {
              contents: [{ value: '**menu** – создаёт выбор игрока' }]
            };
          }
          return null;
        }
      });
    }


    // Применить тему сразу при маунте (иначе Monaco иногда стартует с дефолтной)
    const desiredTheme = theme.palette.mode === 'dark' ? 'renpyDark' : 'renpyLight';
    if (editor._themeService?._theme !== desiredTheme) {
      monaco.editor.setTheme(desiredTheme);
    }

    // 5. Линтинг (минимальный пример)
    const linter = editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (!model) return;
      const value = model.getValue();
      const markers: any[] = [];
      if (!/^label +start:/m.test(value)) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: 'Пропущен label "start".',
          startLineNumber: 1, startColumn: 1,
          endLineNumber: 1, endColumn: 1
        });
      }
      monaco.editor.setModelMarkers(model, 'renpy-linter', markers);
    });

    // 6. Декорации для диалоговых строк
    let oldDecoIds: string[] = [];
    function decorateDialogLines() {
      const model = editor.getModel();
      if (!model) return;
      const lines = model.getLinesContent();
      const decorations: any[] = [];
      lines.forEach((line: string, i: number) => {
        if (/^\s*\".*\"/.test(line)) {
          decorations.push({
            range: new monaco.Range(i+1,1,i+1,line.length+1),
            options: {
              isWholeLine: true,
              className: 'renpy-dialogue-line',
              glyphMarginClassName: 'renpy-glyph'
            }
          });
        }
      });
      oldDecoIds = editor.deltaDecorations(oldDecoIds, decorations);
    }
    const decorator = editor.onDidChangeModelContent(decorateDialogLines);
    setTimeout(decorateDialogLines, 100); // для первого рендера

    return () => {
      linter.dispose();
      decorator.dispose();
    };
  }, [theme.palette.mode]);

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
            <Editor
              height="400px"
              language="renpy"
              value={value}
              theme={theme.palette.mode === 'dark' ? 'renpyDark' : 'renpyLight'}
              options={{
                tabSize: 4,
                insertSpaces: true,
                automaticLayout: true,
                wordWrap: 'on',
                minimap: { enabled: false },
                glyphMargin: true,
                readOnly: readOnly
              }}
              onMount={handleMonacoMount}
              onChange={(val) => {
                onChange(val ?? '');
              }}
            />
          </Box>
        )}
        {readOnly && (
          <Alert severity="info" sx={{ mt: 1, mx: 2 }}>
            {t('nodeEditor.waitLock', 'Ожидание доступа для редактирования...')}
          </Alert>
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
      {/* Confirmation Dialog for Discard/Switch */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => handleConfirmDialogClose(false)}
      >
        <DialogTitle>
          {confirmDialog.type === 'discard'
            ? t('nodeEditor.confirmDiscardTitle', 'Отменить изменения?')
            : t('nodeEditor.confirmSwitchUnsavedTitle', 'Переключиться с несохранёнными изменениями?')}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {confirmDialog.type === 'discard'
              ? t('nodeEditor.confirmDiscard', 'Вы уверены, что хотите отменить несохраненные изменения?')
              : t('nodeEditor.confirmSwitchUnsaved', 'У вас есть несохраненные изменения. Продолжить переключение на полный редактор?')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleConfirmDialogClose(false)} color="secondary">
            {t('common.cancel', 'Отмена')}
          </Button>
          <Button onClick={() => handleConfirmDialogClose(true)} color="primary" autoFocus>
            {t('common.confirm', 'Подтвердить')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default NodeEditorPopup;
