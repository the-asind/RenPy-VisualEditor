import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import EditorPage from '../components/EditorPage'; // Adjust path if needed

const AppRoutes = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate replace to="/editor" />} />
        <Route path="/editor" element={<EditorPage />} />
        {/* Add other routes here later */}
      </Routes>
    </Router>
  );
};

export default AppRoutes;
