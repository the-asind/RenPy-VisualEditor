import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Typography, Box, 
  List, ListItem, ListItemText, 
  MenuItem, Select, FormControl, 
  InputLabel, CircularProgress, IconButton, Divider, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useTranslation } from 'react-i18next';
import projectService, { Project } from '../../services/projectService';
import userService from '../../services/userService';

// TODO: #issue/42 - Add proper validation for form fields
// TODO: #issue/43 - Add proper error handling for API requests

interface ProjectUser {
  id: string;
  username: string;
  role: string;
}

interface ProjectManageDialogProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onProjectUpdated: () => void;
  onOpenProject: (projectId: string | number) => void;
}

const ProjectManageDialog: React.FC<ProjectManageDialogProps> = ({
  open,
  project,
  onClose,
  onProjectUpdated,
  onOpenProject
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load project data when opened
  useEffect(() => {
    if (project && open) {
      setName(project.name);
      setDescription(project.description || '');
      loadProjectUsers();
      loadAvailableUsers();
      loadAvailableRoles();
    }
  }, [project, open]);
  
  const loadProjectUsers = async () => {
    if (!project) return;
    
    setLoadingUsers(true);
    try {
      const projectData = await projectService.getProject(project.id);
      if (projectData.active_users) {
        setProjectUsers(projectData.active_users);
      }
    } catch (err) {
      console.error('Failed to load project users:', err);
      setError(t('errors.failedToLoadUsers'));
    } finally {
      setLoadingUsers(false);
    }
  };
  
  const loadAvailableUsers = async () => {
    try {
      const users = await userService.getUsers();
      setAvailableUsers(users);
    } catch (err) {
      console.error('Failed to load available users:', err);
    }
  };
  
  const loadAvailableRoles = async () => {
    try {
      const roles = await userService.getRoles();
      setAvailableRoles(roles);
    } catch (err) {
      console.error('Failed to load available roles:', err);
    }
  };
  
  const handleUpdateProject = async () => {
    if (!project) return;
    
    setIsSaving(true);
    setError(null);
    try {
      // Update project details
      await projectService.updateProject(project.id, {
        name,
        description
      });
      
      onProjectUpdated();
      // Don't close the dialog to allow more operations
    } catch (err) {
      console.error('Failed to update project:', err);
      setError(t('errors.failedToUpdateProject'));
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleAddUserToProject = async () => {
    if (!project || !selectedUser || !selectedRole) return;
    
    setIsAddingUser(true);
    setError(null);
    try {
      await projectService.shareProject(project.id, selectedUser, selectedRole);
      
      // Refresh the project users list
      await loadProjectUsers();
      
      // Reset form fields
      setSelectedUser('');
      setSelectedRole('');
    } catch (err) {
      console.error('Failed to add user to project:', err);
      setError(t('errors.failedToAddUser'));
    } finally {
      setIsAddingUser(false);
    }
  };
  
  const handleRemoveUserFromProject = async (userId: string) => {
    if (!project) return;
    
    setLoadingUsers(true);
    setError(null);
    try {
      // Use null role to remove user from project
      await projectService.shareProject(project.id, userId, null);
      await loadProjectUsers();
    } catch (err) {
      console.error('Failed to remove user from project:', err);
      setError(t('errors.failedToRemoveUser'));
    } finally {
      setLoadingUsers(false);
    }
  };
  
  const handleChangeUserRole = async (userId: string, newRole: string) => {
    if (!project) return;
    
    setLoadingUsers(true);
    setError(null);
    try {
      await projectService.shareProject(project.id, userId, newRole);
      await loadProjectUsers();
    } catch (err) {
      console.error('Failed to change user role:', err);
      setError(t('errors.failedToChangeRole'));
    } finally {
      setLoadingUsers(false);
    }
  };
  
  const handleStartWorkingWithProject = () => {
    if (project) {
      onClose();
      onOpenProject(project.id);
    }
  };

  if (!project) return null;
  
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="project-management-dialog-title"
    >
      <DialogTitle id="project-management-dialog-title">
        {t('project.manage')}
      </DialogTitle>
      
      <DialogContent dividers>
        {error && (
          <Box mb={2}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        
        {/* Project Details Section */}
        <Typography variant="h6" component="h2" gutterBottom>
          {t('project.details')}
        </Typography>
        
        <Box mb={4}>
          <TextField
            fullWidth
            label={t('project.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            variant="outlined"
            InputLabelProps={{
              shrink: true,
            }}
          />
          
          <TextField
            fullWidth
            label={t('project.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            margin="normal"
            variant="outlined"
            multiline
            rows={4}
            InputLabelProps={{
              shrink: true,
            }}
          />
          
          <Box mt={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateProject}
              disabled={isSaving}
              startIcon={isSaving ? <CircularProgress size={24} /> : <EditIcon />}
            >
              {t('button.save')}
            </Button>
          </Box>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        {/* Project Users Section */}
        <Typography variant="h6" component="h2" gutterBottom>
          {t('project.members')}
        </Typography>
        
        {loadingUsers ? (
          <Box display="flex" justifyContent="center" my={2}>
            <CircularProgress />
          </Box>
        ) : (
          <List>
            {projectUsers.length > 0 ? (
              projectUsers.map((user) => (
                <ListItem
                  key={user.id}
                  secondaryAction={
                    user.role !== 'Owner' ? (
                      <Box>
                        <FormControl variant="outlined" size="small" sx={{ mr: 1, minWidth: 120 }}>
                          <Select
                            value={user.role}
                            onChange={(e) => handleChangeUserRole(user.id, e.target.value)}
                          >
                            {availableRoles.map((role) => (
                              <MenuItem key={role.id} value={role.id}>
                                {role.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        
                        <Tooltip title={t('button.remove')}>
                          <IconButton
                            edge="end"
                            aria-label={t('button.remove')}
                            onClick={() => handleRemoveUserFromProject(user.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : null
                  }
                >
                  <ListItemText
                    primary={user.username}
                    secondary={user.role}
                  />
                </ListItem>
              ))
            ) : (
              <Typography color="textSecondary">
                {t('project.noMembers')}
              </Typography>
            )}
          </List>
        )}
        
        {/* Add User Section */}
        <Box mt={2} display="flex" alignItems="flex-end" gap={2}>
          <FormControl variant="outlined" sx={{ minWidth: 200, flex: 2 }}>
            <InputLabel id="add-user-select-label">{t('project.selectUser')}</InputLabel>
            <Select
              labelId="add-user-select-label"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              label={t('project.selectUser')}
              disabled={isAddingUser}
            >
              {availableUsers.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.username}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl variant="outlined" sx={{ minWidth: 120, flex: 1 }}>
            <InputLabel id="add-role-select-label">{t('project.selectRole')}</InputLabel>
            <Select
              labelId="add-role-select-label"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              label={t('project.selectRole')}
              disabled={isAddingUser}
            >
              {availableRoles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddUserToProject}
            disabled={!selectedUser || !selectedRole || isAddingUser}
            startIcon={isAddingUser ? <CircularProgress size={24} /> : <PersonAddIcon />}
            sx={{ height: 56, flex: 0 }}
          >
            {t('button.add')}
          </Button>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          {t('button.cancel')}
        </Button>
        <Button 
          variant="contained" 
          color="primary"
          onClick={handleStartWorkingWithProject}
        >
          {t('button.startWorking')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectManageDialog;
