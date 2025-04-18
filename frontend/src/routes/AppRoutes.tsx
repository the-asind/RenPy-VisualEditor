import React from 'react';
import { Routes, Route } from 'react-router-dom';
import EditorPage from '../components/EditorPage';
import HomePage from '../pages/HomePage';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/editor" element={<EditorPage />} />
      {/* TODO: Add routes for Projects, Users, Profile - Issue #STU */}
      <Route path="/projects" element={<div>Projects Page (Coming Soon)</div>} />
      <Route path="/users" element={<div>Users Page (Coming Soon)</div>} />
      <Route path="/profile" element={<div>Profile Page (Coming Soon)</div>} />
    </Routes>
  );
};

export default AppRoutes;
