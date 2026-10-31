import '../shell/base.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from '../shell/AppShell';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppShell page="planner">planner stub</AppShell>
  </React.StrictMode>,
);
