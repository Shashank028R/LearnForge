import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';

import { HomePage } from '../pages/HomePage';
import { SubjectsPage } from '../pages/SubjectsPage';
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

export function AppRoutes({ onOpenAuth }) {
  return (
    <Routes>
      <Route element={<AppShell onOpenAuth={onOpenAuth} />}>
        {/* Core Workspace Routes */}
        <Route index element={<HomePage onOpenAuth={onOpenAuth} />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route
          path="subjects/:subjectId"
          element={<PlaceholderDetailPage resourceType="Subject" />}
        />
        <Route path="chats" element={<ChatsPage />} />
        <Route
          path="chats/:chatId"
          element={<PlaceholderDetailPage resourceType="Chat" />}
        />
        <Route path="notes" element={<NotesPage />} />
        <Route
          path="notes/:noteId"
          element={<PlaceholderDetailPage resourceType="Note" />}
        />
        <Route path="study" element={<StudyPage />} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="import" element={<ImportPage />} />

        {/* Profile & Settings */}
        <Route
          path="profile"
          element={
            <ProtectedRoute onOpenAuth={onOpenAuth}>
              <ProfilePage onOpenAuth={onOpenAuth} />
            </ProtectedRoute>
          }
        />
        <Route path="settings" element={<SettingsPage />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
