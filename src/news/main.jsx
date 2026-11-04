import '../shell/base.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import NewsApp from './NewsApp.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NewsApp />
  </React.StrictMode>,
);
