import React, { useState } from 'react';
import { 
  Box, Typography, Grid, Card, CardContent, Button,
  IconButton, useTheme, CircularProgress, Alert, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip
} from '@mui/material';
import { motion } from 'framer-motion';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ShareIcon from '@mui/icons-material/Share';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useProjects from '../hooks/useProjects';
import { Project } from '../services/projectService';
import ProjectManageDialog from '../components/project/ProjectManageDialog';

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // State for new project dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for project manage dialog
  const [isProjectManageDialogOpen, setIsProjectManageDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Get projects from database using our custom hook
  const { projects, loading, error, refreshProjects, createProject } = useProjects();

  const handleOpenProject = (projectId: number | string) => {
    navigate(`/editor?project=${projectId}`);
  };

  const handleCreateNewProject = () => {
    setIsDialogOpen(true);
  };
  
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setNewProjectName('');
    setNewProjectDesc('');
  };
  
  const handleSubmitProject = async () => {
    if (!newProjectName.trim()) return;
    
    setIsSubmitting(true);
    try {
      const newProject = await createProject(newProjectName, newProjectDesc);
      handleCloseDialog();
      // Navigate to the new project
      navigate(`/editor?project=${newProject.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handlers for project management dialog
  const handleOpenManageDialog = (project: Project) => {
    setSelectedProject(project);
    setIsProjectManageDialogOpen(true);
  };
  
  const handleCloseManageDialog = () => {
    setIsProjectManageDialogOpen(false);
    setSelectedProject(null);
  };
  
  const handleProjectUpdated = () => {
    // Refresh the projects list to get the latest data
    refreshProjects();
  };

  return (
    <Box sx={{ p: 4, height: '100%' }}>
      {/* Page Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 5
        }}
      >
        <Typography 
          variant="h4" 
          component="h1" 
          sx={{ 
            fontWeight: 700,
            fontSize: '2rem',
          }}
        >
          {t('home.projects')}
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={() => refreshProjects()}
        >
          {error.message || t('errors.failedToLoadProjects')}
        </Alert>
      )}

      {/* Loading State */}
      {loading ? (
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: '200px'
          }}
        >
          <CircularProgress />
        </Box>
      ) : (
        /* Projects Grid */
        <Grid container spacing={3}>          {projects.map((project) => (
            <Grid item xs={12} sm={6} lg={4} xl={3} key={project.id}>
              <Card
                onClick={() => handleOpenManageDialog(project)}
                sx={{
                  height: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  p: 0,
                  backgroundColor: theme.palette.background.paper,
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 3,
                  }
                }}
              >
                {/* Project Header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <Typography 
                    sx={{ 
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    {t('projects.script', { count: project.scriptCount || 0 })}
                  </Typography>
                  
                  {project.hasEditAccess ? (
                    <Button
                      size="small"
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        textTransform: 'none',
                        backgroundColor: theme.palette.primary.main,
                        color: 'white',
                        '&:hover': {
                          backgroundColor: theme.palette.primary.dark,
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click event
                        handleOpenProject(project.id);
                      }}
                    >
                      {t('button.editor')}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        textTransform: 'none',
                        borderColor: theme.palette.primary.main,
                        color: theme.palette.primary.main,
                      }}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click event
                        handleOpenProject(project.id);
                      }}
                    >
                      {t('button.viewer')}
                    </Button>
                  )}
                </Box>

                {/* Project Content */}
                <CardContent sx={{ flex: 1, p: 2, pt: 2 }}>
                  <Typography 
                    variant="h6"
                    sx={{ 
                      fontWeight: 600,
                      mb: 1.5,
                      fontSize: '1.2rem',
                    }}
                  >
                    {project.name}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{
                      mb: 1,
                      fontSize: '0.95rem',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {project.description}
                  </Typography>
                </CardContent>
                
                {/* Action Buttons */}
                <Box 
                  sx={{ 
                    display: 'flex',
                    justifyContent: 'flex-end',
                    p: 1.5,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    gap: 1
                  }}
                >
                  <Tooltip title={t('action.editProject')}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click event
                        handleOpenManageDialog(project);
                      }}
                      aria-label={t('action.editProject')}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('action.openProject')}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click event
                        handleOpenProject(project.id);
                      }}
                      aria-label={t('action.openProject')}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('action.shareProject')}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click event
                        handleOpenManageDialog(project);
                      }}
                      aria-label={t('action.shareProject')}
                    >
                      <ShareIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Card>
            </Grid>
          ))}
          
          {/* "Create New" Card */}
          <Grid item xs={12} sm={6} lg={4} xl={3}>
            <motion.div
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              style={{ height: '100%' }}
            >
              <Card
                onClick={handleCreateNewProject}
                sx={{
                  height: '100%',
                  minHeight: 230,
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 3,
                  cursor: 'pointer',
                  border: '1px dashed',
                  borderColor: theme.palette.divider,
                  backgroundColor: theme.palette.background.paper,
                }}
              >
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    mb: 2,
                    bgcolor: theme.palette.primary.main,
                    color: '#fff',
                  }}
                >
                  <AddIcon sx={{ fontSize: 30 }} />
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  {t('button.createNewProjectTitle')}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  {t('button.createNewProjectDesc')}
                </Typography>
              </Card>
            </motion.div>
          </Grid>
        </Grid>
      )}
        {/* Create Project Dialog */}
      <Dialog 
        open={isDialogOpen} 
        onClose={!isSubmitting ? handleCloseDialog : undefined}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('projects.createNew')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label={t('projects.name')}
            type="text"
            fullWidth
            variant="outlined"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            disabled={isSubmitting}
            sx={{ mb: 3, mt: 1 }}
          />
          <TextField
            margin="dense"
            id="description"
            label={t('projects.description')}
            multiline
            rows={4}
            fullWidth
            variant="outlined"
            value={newProjectDesc}
            onChange={(e) => setNewProjectDesc(e.target.value)}
            disabled={isSubmitting}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCloseDialog} 
            disabled={isSubmitting}
          >
            {t('button.cancel')}
          </Button>
          <Button 
            onClick={handleSubmitProject} 
            variant="contained" 
            color="primary"
            disabled={isSubmitting || !newProjectName.trim()}
          >
            {isSubmitting ? (
              <CircularProgress size={24} />
            ) : (
              t('button.create')
            )}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Project Management Dialog */}
      <ProjectManageDialog
        open={isProjectManageDialogOpen}
        project={selectedProject}
        onClose={handleCloseManageDialog}
        onProjectUpdated={handleProjectUpdated}
        onOpenProject={handleOpenProject}
      />
    </Box>
  );
};

export default HomePage;
