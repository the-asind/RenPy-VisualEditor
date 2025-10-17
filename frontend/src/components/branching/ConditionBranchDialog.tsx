import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
  type ConditionBranchDialogResult,
  type ConditionBranchEntry,
} from '../../utils/branching';

type ElifFormState = {
  id: string;
  condition: string;
  notes: string;
};

type ConditionBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ConditionBranchDialogResult) => void;
  nodeName: string;
  indentation: string;
  submitting?: boolean;
};

const createElifState = (): ElifFormState => ({
  id: Math.random().toString(36).slice(2),
  condition: '',
  notes: '',
});

const ConditionBranchDialog: React.FC<ConditionBranchDialogProps> = ({
  open,
  onClose,
  onSubmit,
  nodeName,
  indentation,
  submitting = false,
}) => {
  const { t } = useTranslation();
  const [ifCondition, setIfCondition] = useState('');
  const [ifNotes, setIfNotes] = useState('');
  const [elifBranches, setElifBranches] = useState<ElifFormState[]>([]);
  const [elseContent, setElseContent] = useState('');
  const [elseNotes, setElseNotes] = useState('');
  const [includeElse, setIncludeElse] = useState(false);
  const [ifError, setIfError] = useState<string | null>(null);
  const [elifErrors, setElifErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setIfCondition('');
      setIfNotes('');
      setElifBranches([]);
      setElseContent('');
      setElseNotes('');
      setIncludeElse(false);
      setIfError(null);
      setElifErrors({});
    }
  }, [open]);

  const handleAddElif = () => {
    setElifBranches((prev) => [...prev, createElifState()]);
  };

  const handleRemoveElif = (id: string) => {
    setElifBranches((prev) => prev.filter((branch) => branch.id !== id));
    setElifErrors((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const preview = useMemo(() => {
    const branches: ConditionBranchEntry[] = [
      { kind: 'if', condition: ifCondition.trim(), notes: ifNotes.trim() || undefined },
      ...elifBranches.map(({ condition, notes }) => ({
        kind: 'elif' as const,
        condition: condition.trim(),
        notes: notes.trim() || undefined,
      })),
    ];

    if (includeElse) {
      branches.push({
        kind: 'else',
        content: elseContent.trim() || undefined,
        notes: elseNotes.trim() || undefined,
      });
    }

    const payload: ConditionBranchDialogResult = {
      type: 'if',
      indent: indentation,
      branches,
    };

    return buildBranchSnippet(payload);
  }, [elseContent, elseNotes, ifCondition, ifNotes, includeElse, indentation, elifBranches]);

  const validate = (): boolean => {
    let valid = true;
    if (!ifCondition.trim()) {
      setIfError(t('branchConditionDialog.conditionRequired'));
      valid = false;
    } else {
      setIfError(null);
    }

    const newElifErrors: Record<string, string> = {};
    elifBranches.forEach((branch) => {
      if (!branch.condition.trim()) {
        newElifErrors[branch.id] = t('branchConditionDialog.conditionRequired');
      }
    });
    setElifErrors(newElifErrors);
    if (Object.keys(newElifErrors).length > 0) {
      valid = false;
    }

    return valid;
  };

  const handleSubmit = () => {
    if (!validate()) {
      return;
    }

    const branches: ConditionBranchEntry[] = [
      { kind: 'if', condition: ifCondition.trim(), notes: ifNotes.trim() || undefined },
      ...elifBranches.map(({ condition, notes }) => ({
        kind: 'elif' as const,
        condition: condition.trim(),
        notes: notes.trim() || undefined,
      })),
    ];

    if (includeElse) {
      branches.push({
        kind: 'else',
        content: elseContent.trim() || undefined,
        notes: elseNotes.trim() || undefined,
      });
    }

    const payload: ConditionBranchDialogResult = {
      type: 'if',
      indent: indentation,
      branches,
    };

    onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('branchConditionDialog.title', { nodeName })}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('branchConditionDialog.description')}
          </Typography>
          <Alert severity="info" variant="outlined">
            {t('branchConditionDialog.pseudoInfo')}
          </Alert>
          <TextField
            label={t('branchConditionDialog.ifLabel')}
            value={ifCondition}
            onChange={(event) => setIfCondition(event.target.value)}
            helperText={ifError || t('branchConditionDialog.ifHelper')}
            error={Boolean(ifError)}
            required
            fullWidth
          />
          <TextField
            label={t('branchConditionDialog.ifNotesLabel')}
            value={ifNotes}
            onChange={(event) => setIfNotes(event.target.value)}
            helperText={t('branchConditionDialog.notesHelper')}
            fullWidth
            multiline
            minRows={2}
          />
          {elifBranches.map((branch, index) => (
            <Box key={branch.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">
                    {t('branchConditionDialog.elifLabel', { index: index + 1 })}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveElif(branch.id)}
                    aria-label={t('branchConditionDialog.removeElif')}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <TextField
                  label={t('branchConditionDialog.elifLabel', { index: index + 1 })}
                  value={branch.condition}
                  onChange={(event) =>
                    setElifBranches((prev) =>
                      prev.map((item) => (item.id === branch.id ? { ...item, condition: event.target.value } : item))
                    )
                  }
                  helperText={elifErrors[branch.id] || t('branchConditionDialog.ifHelper')}
                  error={Boolean(elifErrors[branch.id])}
                  required
                  fullWidth
                />
                <TextField
                  label={t('branchConditionDialog.elifNotesLabel')}
                  value={branch.notes}
                  onChange={(event) =>
                    setElifBranches((prev) =>
                      prev.map((item) => (item.id === branch.id ? { ...item, notes: event.target.value } : item))
                    )
                  }
                  helperText={t('branchConditionDialog.notesHelper')}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Stack>
            </Box>
          ))}
          <Button
            onClick={handleAddElif}
            startIcon={<AddCircleOutlineIcon />}
            variant="outlined"
            size="small"
          >
            {t('branchConditionDialog.addElif')}
          </Button>
          <Divider />
          <FormControlLabel
            control={
              <Checkbox
                checked={includeElse}
                onChange={(event) => {
                  setIncludeElse(event.target.checked);
                  if (!event.target.checked) {
                    setElseContent('');
                    setElseNotes('');
                  }
                }}
              />
            }
            label={t('branchConditionDialog.includeElse')}
          />
          {includeElse && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Stack spacing={1.5}>
                <TextField
                  label={t('branchConditionDialog.elseLabel')}
                  value={elseContent}
                  onChange={(event) => setElseContent(event.target.value)}
                  helperText={t('branchConditionDialog.elseHelper')}
                  fullWidth
                  multiline
                />
                <TextField
                  label={t('branchConditionDialog.elseNotesLabel')}
                  value={elseNotes}
                  onChange={(event) => setElseNotes(event.target.value)}
                  helperText={t('branchConditionDialog.notesHelper')}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Stack>
            </Box>
          )}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('branchConditionDialog.preview')}
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

export default ConditionBranchDialog;
