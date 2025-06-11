import React, { useState, useEffect, useCallback } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Typography, Box, 
  List, ListItem, ListItemText, 
  MenuItem, Select, FormControl, 
  InputLabel, CircularProgress, IconButton, Divider, Tooltip, SelectChangeEvent
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useTranslation } from 'react-i18next';
import projectService, { Project as ImportedProject } from '../../services/projectService';
import userService, { User as ImportedUser, Role as ImportedRole } from '../../services/userService';

interface ProjectUser extends ImportedUser {
  role: string;
}

const ProjectManageDialog: React.FC<ProjectManageDialogProps> = ({
  open,
  project: projectProp,
  onClose,
  onProjectUpdated,
  onOpenProject
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [availableRoles, setAvailableRoles] = useState<ImportedRole[]>([]);
  const [shareUsernameInput, setShareUsernameInput] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [isProcessingUserAction, setIsProcessingUserAction] = useState(false);
  const [loadingDialogData, setLoadingDialogData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<ImportedProject | null>(null);

  const { t } = useTranslation();

  const loadProjectDetailsAndUsers = useCallback(async (projectId: string | number) => {
    if (!projectId) return;
    setLoadingDialogData(true);
    try {
      const detailedProject = await projectService.getProject(projectId);
      setCurrentProject(detailedProject);
      setProjectUsers(detailedProject.active_users || []);
      return detailedProject;
    } catch (err) {
      console.error('Failed to load project details and users:', err);
      setError(t('errors.failedToLoadProjectDetails'));
      return null;
    } finally {
      setLoadingDialogData(false);
    }
  }, [t]);

  const loadRoles = useCallback(async () => {
    try {
      const roles = await userService.getRoles();
      setAvailableRoles(roles.filter(role => role.id !== 'role_owner'));
    } catch (err) {
      console.error('Failed to load roles:', err);
      setError(t('errors.failedToLoadRoles'));
    }
  }, [t]);

  const loadInitialDialogData = useCallback(async (projectToLoad: ImportedProject) => {
    setLoadingDialogData(true);
    setError(null);
    await loadProjectDetailsAndUsers(projectToLoad.id);
    await loadRoles();
    setLoadingDialogData(false);
  }, [loadProjectDetailsAndUsers, loadRoles]);

  useEffect(() => {
    if (projectProp && open) {
      setCurrentProject(projectProp);
      setName(projectProp.name);
      setDescription(projectProp.description || '');
      loadInitialDialogData(projectProp);
    } else if (!open) {
      setCurrentProject(null);
      setName('');
      setDescription('');
      setProjectUsers([]);
      setAvailableRoles([]);
      setShareUsernameInput('');
      setSelectedRoleId('');
      setError(null);
      setIsSaving(false);
      setIsProcessingUserAction(false);
      setLoadingDialogData(false);
      setIsDeletingProject(false);
      setConfirmDeleteDialogOpen(false);
    }
  }, [projectProp, open, loadInitialDialogData]);

  const handleUpdateProject = async () => {
    if (!currentProject) return;
    setIsSaving(true);
    setError(null);
    try {
      await projectService.updateProject(currentProject.id, { name, description });
      onProjectUpdated();
    } catch (err: any) {
      console.error('Failed to update project:', err);
      const msg = err.response?.data?.detail || err.message || t('errors.failedToUpdateProject');
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddUserToProject = async () => {
    if (!currentProject || !shareUsernameInput.trim() || !selectedRoleId) {
      setError(t('errors.pleaseEnterUsernameAndRole'));
      return;
    }
    setIsProcessingUserAction(true);
    setError(null);
    try {
      await projectService.shareProject(currentProject.id, shareUsernameInput.trim(), selectedRoleId);
      await loadProjectDetailsAndUsers(currentProject.id);
      setShareUsernameInput('');
      setSelectedRoleId('');
    } catch (err: any) {
      console.error('Failed to add user to project:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail);
      } else {
        setError(t('errors.failedToAddUser'));
      }
    } finally {
      setIsProcessingUserAction(false);
    }
  };

  const handleRemoveUserFromProject = async (userIdToRemove: string) => {
    if (!currentProject) return;
    setIsProcessingUserAction(true);
    setError(null);
    try {
      const userToRemoveDetails = projectUsers.find(u => u.id === userIdToRemove);
      if (!userToRemoveDetails) {
        console.error(`User with ID ${userIdToRemove} not found in projectUsers list for removal.`);
        setError(t('errors.userNotFoundLocally'));
        setIsProcessingUserAction(false);
        return;
      }
      await projectService.shareProject(currentProject.id, userToRemoveDetails.username, null);
      await loadProjectDetailsAndUsers(currentProject.id);
    } catch (err: any) {
      console.error('Failed to remove user from project:', err);
      const msg = err.response?.data?.detail || err.message || t('errors.failedToRemoveUser');
      setError(msg);
    } finally {
      setIsProcessingUserAction(false);
    }
  };

  const handleChangeUserRole = async (usernameToChange: string, newRoleId: string) => {
    if (!currentProject || !newRoleId) return;
    setIsProcessingUserAction(true);
    setError(null);
    try {
      await projectService.shareProject(currentProject.id, usernameToChange, newRoleId);
      await loadProjectDetailsAndUsers(currentProject.id);
    } catch (err: any) {
      console.error('Failed to change user role:', err);
      const msg = err.response?.data?.detail || err.message || t('errors.failedToChangeRole');
      setError(msg);
    } finally {
      setIsProcessingUserAction(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) return;
    setIsDeletingProject(true);
    setError(null);
    try {
      await projectService.deleteProject(currentProject.id);
      onProjectUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete project:', err);
      const msg = err.response?.data?.detail || err.message || t('errors.failedToDeleteProject');
      setError(msg);
    } finally {
      setIsDeletingProject(false);
      setConfirmDeleteDialogOpen(false);
    }
  };
  
  const handleOpenProjectClick = () => {
    if (currentProject) {
      onOpenProject(currentProject.id);
      onClose();
    }
  };

  if (!open || !projectProp) return null;
  
  let isCurrentUserOwner = false;
  if (currentProject && currentProject.owner_id) {
    // const currentUserId = userService.getCurrentUserId();
  }

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose}
        maxWidth="md"
        fullWidth
        aria-labelledby="project-management-dialog-title"
      >
        <DialogTitle id="project-management-dialog-title">
          {t('project.manage')} - {currentProject?.name}
        </DialogTitle>
        
        <DialogContent dividers>
          {loadingDialogData && <CircularProgress sx={{ display: 'block', margin: 'auto', my: 2 }} />}
          {error && (
            <Box mb={2} p={2} sx={{ border: '1px solid red', borderRadius: '4px', backgroundColor: '#ffebee' }}>
              <Typography color="error">{error}</Typography>
            </Box>
          )}
          
          {!loadingDialogData && currentProject && (
            <>
              <Typography variant="h6" component="h2" gutterBottom>
                {t('project.details')}
              </Typography>
              <Box mb={4}>
                <TextField fullWidth label={t('project.name')} value={name} onChange={(e) => setName(e.target.value)} margin="normal" variant="outlined" InputLabelProps={{ shrink: true }} disabled={isSaving} />
                <TextField fullWidth label={t('project.description')} value={description} onChange={(e) => setDescription(e.target.value)} margin="normal" variant="outlined" multiline rows={3} InputLabelProps={{ shrink: true }} disabled={isSaving} />
                <Box mt={2}>
                  <Button variant="contained" color="primary" onClick={handleUpdateProject} disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} /> : <EditIcon />}>
                    {t('button.saveChanges')}
                  </Button>
                </Box>
              </Box>
              
              <Divider sx={{ my: 3 }} />
              
              <Typography variant="h6" component="h2" gutterBottom>
                {t('project.members')}
              </Typography>
              {isProcessingUserAction && <CircularProgress size={20} sx={{ml: 1}}/>}
              <List dense>
                {projectUsers.length > 0 ? (
                  projectUsers.map((user) => {
                    const roleDetails = availableRoles.find(r => r.id === user.role);
                    const roleDisplayName = roleDetails ? t(`project.${roleDetails.name.toLowerCase()}`) : user.role;
                    return (
                      <ListItem key={user.id} divider sx={{ py: 1.5 }}>
                        <ListItemText 
                          primary={user.username} 
                          secondary={user.id === currentProject.owner_id ? t('project.owner') : roleDisplayName}
                        />
                        {user.id !== currentProject.owner_id && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControl variant="outlined" size="small" sx={{ minWidth: 130 }}>
                              <InputLabel id={`role-select-label-${user.id}`}>{t('project.role')}</InputLabel>
                              <Select
                                labelId={`role-select-label-${user.id}`}
                                value={user.role}
                                label={t('project.role')}
                                onChange={(e: SelectChangeEvent<string>) => handleChangeUserRole(user.username, e.target.value)}
                                disabled={isProcessingUserAction}
                              >
                                {availableRoles.map((role) => (
                                  <MenuItem key={role.id} value={role.id}>
                                    {t(`project.${role.name.toLowerCase()}`)}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <Tooltip title={t('button.removeUser')}>
                              <IconButton edge="end" onClick={() => handleRemoveUserFromProject(user.id)} disabled={isProcessingUserAction} color="warning">
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </ListItem>
                    );
                  })
                ) : (
                  <Typography color="textSecondary" sx={{ml: 2}}>{t('project.noMembersYet')}</Typography>
                )}
              </List>
              
              <Typography variant="subtitle1" component="h3" gutterBottom sx={{mt: 3}}>
                {t('project.addUserToProject')}
              </Typography>
              <Box mt={1} display="flex" alignItems="flex-start" gap={1.5}>
                <TextField
                  label={t('project.enterUsername')}
                  variant="outlined"
                  size="small"
                  value={shareUsernameInput}
                  onChange={(e) => setShareUsernameInput(e.target.value)}
                  sx={{ minWidth: 200, flexGrow: 1 }}
                  disabled={isProcessingUserAction}
                  helperText={error && error.toLowerCase().includes('user') ? error : ''}
                  error={error && error.toLowerCase().includes('user') ? true : false}
                />
                
                <FormControl variant="outlined" sx={{ minWidth: 150 }} size="small">
                  <InputLabel id="add-role-select-label">{t('project.selectRole')}</InputLabel>
                  <Select
                    labelId="add-role-select-label"
                    value={selectedRoleId}
                    onChange={(e: SelectChangeEvent<string>) => setSelectedRoleId(e.target.value)}
                    label={t('project.selectRole')}
                    disabled={isProcessingUserAction}
                  >
                    {availableRoles.map((role) => (
                      <MenuItem key={role.id} value={role.id}>
                        {t(`project.${role.name.toLowerCase()}`)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <Button variant="contained" color="primary" onClick={handleAddUserToProject} disabled={!shareUsernameInput.trim() || !selectedRoleId || isProcessingUserAction} startIcon={isProcessingUserAction ? <CircularProgress size={20}/> : <PersonAddIcon />} sx={{ height: '40px' }}>
                  {t('button.add')}
                </Button>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                <Typography variant="h6" component="h2">{t('project.manage.projectActions')}</Typography>
                <Box>
                  <Button variant="outlined" color="error" onClick={() => setConfirmDeleteDialogOpen(true)} disabled={isDeletingProject} startIcon={<DeleteIcon />}>
                    {isDeletingProject ? <CircularProgress size={20} /> : t('button.deleteProject')}
                  </Button>
                  <Button variant="contained" color="primary" onClick={handleOpenProjectClick} sx={{ ml: 2 }}>
                    {t('button.openProject')}
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{p: 2}}>
          <Button onClick={onClose} color="inherit">{t('button.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmDeleteDialogOpen}
        onClose={() => setConfirmDeleteDialogOpen(false)}
        aria-labelledby="confirm-delete-dialog-title"
      >
        <DialogTitle id="confirm-delete-dialog-title">{t('project.manage.confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('project.manage.confirmDeleteMessage', { projectName: currentProject?.name })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteDialogOpen(false)} color="inherit">{t('button.cancel')}</Button>
          <Button onClick={handleDeleteProject} color="error" disabled={isDeletingProject} startIcon={isDeletingProject ? <CircularProgress size={20}/> : null}>
            {t('button.confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

interface ProjectManageDialogProps {
  open: boolean;
  project: ImportedProject | null;
  onClose: () => void;
  onProjectUpdated: () => void;
  onOpenProject: (projectId: string | number) => void;
}

export default ProjectManageDialog;
