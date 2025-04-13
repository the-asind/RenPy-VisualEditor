import React from 'react';
import AppRoutes from './routes/AppRoutes'; // Import the router configuration
import './App.css'; // Keep or modify global styles as needed

function App() {
  return (
    <div className="App">
      <AppRoutes /> {/* Render the routes */}
    </div>
  );
}

export default App;
