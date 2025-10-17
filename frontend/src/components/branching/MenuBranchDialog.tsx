import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslation } from 'react-i18next';
import {
  buildBranchSnippet,
  type MenuBranchDialogResult,
  type MenuBranchOption,
} from '../../utils/branching';

type MenuOptionFormState = MenuBranchOption & { id: string };

type MenuBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: MenuBranchDialogResult) => void;
  nodeName: string;
  indentation: string;
  submitting?: boolean;
};

const createEmptyOption = (): MenuOptionFormState => ({
  id: Math.random().toString(36).slice(2),
  text: '',
  jump: '',
  notes: '',
});

const MIN_OPTIONS = 2;

const MenuBranchDialog: React.FC<MenuBranchDialogProps> = ({
  open,
  onClose,
  onSubmit,
  nodeName,
  indentation,
  submitting = false,
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<MenuOptionFormState[]>([
    createEmptyOption(),
    createEmptyOption(),
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setOptions([
        createEmptyOption(),
        createEmptyOption(),
      ]);
      setErrors({});
    }
  }, [open]);

  const handleOptionChange = (id: string, key: keyof MenuBranchOption, value: string) => {
    setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, [key]: value } : option)));
  };

  const handleAddOption = () => {
    setOptions((prev) => [...prev, createEmptyOption()]);
  };

  const handleRemoveOption = (id: string) => {
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((option) => option.id !== id) : prev));
    setErrors((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const preview = useMemo(() => {
    const payload: MenuBranchDialogResult = {
      type: 'menu',
      indent: indentation,
      options: options.map(({ id, ...option }) => ({ ...option, text: option.text.trim() })),
    };
    return buildBranchSnippet(payload);
  }, [indentation, options]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    options.forEach((option) => {
      if (!option.text.trim()) {
        newErrors[option.id] = t('branchMenuDialog.optionError');
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      return;
    }

    const payload: MenuBranchDialogResult = {
      type: 'menu',
      indent: indentation,
      options: options.map(({ id, text, jump, notes }) => ({
        text: text.trim(),
        jump: jump?.trim() || undefined,
        notes: notes?.trim() || undefined,
      })),
    };

    onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('branchMenuDialog.title', { nodeName })}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('branchMenuDialog.description')}
          </Typography>
          {options.map((option, index) => (
            <Box key={option.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle2">
                    {t('branchMenuDialog.optionLabel', { index: index + 1 })}
                  </Typography>
                  {options.length > MIN_OPTIONS && (
                    <IconButton size="small" onClick={() => handleRemoveOption(option.id)} aria-label={t('branchMenuDialog.removeOption')}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                <TextField
                  label={t('branchMenuDialog.optionLabel', { index: index + 1 })}
                  value={option.text}
                  onChange={(event) => handleOptionChange(option.id, 'text', event.target.value)}
                  error={Boolean(errors[option.id])}
                  helperText={errors[option.id] || ' '}
                  fullWidth
                  required
                />
                <TextField
                  label={t('branchMenuDialog.jumpLabel')}
                  value={option.jump}
                  onChange={(event) => handleOptionChange(option.id, 'jump', event.target.value)}
                  helperText={t('branchMenuDialog.jumpHelper')}
                  fullWidth
                />
                <TextField
                  label={t('branchMenuDialog.notesLabel')}
                  value={option.notes}
                  onChange={(event) => handleOptionChange(option.id, 'notes', event.target.value)}
                  helperText={t('branchMenuDialog.notesHelper')}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Stack>
            </Box>
          ))}
          <Button
            onClick={handleAddOption}
            startIcon={<AddCircleOutlineIcon />}
            variant="outlined"
            size="small"
          >
            {t('branchMenuDialog.addOption')}
          </Button>
          <Divider />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('branchMenuDialog.preview')}
            </Typography>
            <Box
              component="pre"
              sx={{
                backgroundColor: (theme) => theme.palette.background.default,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                p: 2,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
              }}
            >
              {preview}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('button.cancel')}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {t('button.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MenuBranchDialog;
