import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';

import { HomePage } from '../pages/HomePage';
import { SubjectsPage } from '../pages/SubjectsPage';
import { SubjectDetailPage } from '../pages/SubjectDetailPage';
import { ChatsPage } from '../pages/ChatsPage';
import { NotesPage } from '../pages/NotesPage';
import { StudyPage } from '../pages/StudyPage';
import { QuizzesPage } from '../pages/QuizzesPage';
import { ProgressPage } from '../pages/ProgressPage';
import { ImportPage } from '../pages/ImportPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SettingsPage } from '../pages/SettingsPage';
import { PlaceholderDetailPage } from '../pages/PlaceholderDetailPage';
import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * LearnForge Route Hierarchy.
 * 
 * Public Routes:
 * - '/' (Home workspace overview / onboarding)
 * - '/settings' (Theme appearance & accessibility controls usable prior to sign-in)
 * - '*' (404 Fallback)
 * 
 * Protected Workspace Routes (enforced by ProtectedRoute layout):
 * - '/subjects', '/subjects/:subjectId'
 * - '/chats', '/chats/:chatId'
 * - '/notes', '/notes/:noteId'
 * - '/study'
 * - '/quizzes'
 * - '/progress'
 * - '/import'
 * - '/profile'
 */
export function AppRoutes({ onOpenAuth }) {
  return (
    <Routes>
      <Route element={<AppShell onOpenAuth={onOpenAuth} />}>
        {/* Public Workspace Home & Onboarding */}
        <Route index element={<HomePage onOpenAuth={onOpenAuth} />} />

        {/* Public Settings: Available pre-auth for dark mode & keyboard ergonomics */}
        <Route path="settings" element={<SettingsPage />} />

        {/* Protected Workspace Routes Hierarchy */}
        <Route element={<ProtectedRoute onOpenAuth={onOpenAuth} />}>
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="subjects/:subjectId" element={<SubjectDetailPage />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="chats/:chatId" element={<ChatsPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route
            path="notes/:noteId"
            element={<PlaceholderDetailPage resourceType="Note" />}
          />
          <Route path="study" element={<StudyPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route
            path="profile"
            element={<ProfilePage onOpenAuth={onOpenAuth} />}
          />
        </Route>

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
