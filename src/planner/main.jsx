import '../shell/base.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PlannerApp from './Planner.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlannerApp />
  </React.StrictMode>,
);
