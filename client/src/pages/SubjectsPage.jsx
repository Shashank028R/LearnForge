import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EmptyState,
  Button,
  IconButton,
  Icon,
  Badge,
  Dialog,
  Input,
  Skeleton,
  ErrorState,
} from '../components/ui';
import { subjectsApi } from '../api/subjectsApi';

const COLOR_OPTIONS = [
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Slate', value: '#64748b' },
];

const MASTERY_OPTIONS = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
  { label: 'Comprehensive', value: 'comprehensive' },
];

export function SubjectsPage() {
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [deletingSubject, setDeletingSubject] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    targetMasteryLevel: 'intermediate',
    status: 'active',
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch subjects
  const fetchSubjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await subjectsApi.list();
      setSubjects(res?.subjects || []);
    } catch (err) {
      setError(err.message || 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3b82f6',
      targetMasteryLevel: 'intermediate',
      status: 'active',
    });
    setFormError(null);
    setIsCreateOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (subject, e) => {
    e?.stopPropagation();
    setEditingSubject(subject);
    setFormData({
      name: subject.name || '',
      description: subject.description || '',
      color: subject.color || '#3b82f6',
      targetMasteryLevel: subject.targetMasteryLevel || 'intermediate',
      status: subject.status || 'active',
    });
    setFormError(null);
  };

  // Open Delete Dialog
  const handleOpenDelete = (subject, e) => {
    e?.stopPropagation();
    setDeletingSubject(subject);
    setFormError(null);
  };

  // Submit Create
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Subject name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await subjectsApi.create({
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        targetMasteryLevel: formData.targetMasteryLevel,
      });
      setIsCreateOpen(false);
      // Append or reload
      if (res?.subject) {
        setSubjects((prev) => [res.subject, ...prev]);
      } else {
        await fetchSubjects();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create subject.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Subject name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await subjectsApi.update(editingSubject._id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        targetMasteryLevel: formData.targetMasteryLevel,
        status: formData.status,
      });
      setEditingSubject(null);
      if (res?.subject) {
        setSubjects((prev) =>
          prev.map((s) => (s._id === res.subject._id ? res.subject : s))
        );
      } else {
        await fetchSubjects();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to update subject.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    if (!deletingSubject) return;

    try {
      setSubmitting(true);
      setFormError(null);
      await subjectsApi.delete(deletingSubject._id);
      setSubjects((prev) => prev.filter((s) => s._id !== deletingSubject._id));
      setDeletingSubject(null);
    } catch (err) {
      setFormError(err.message || 'Failed to delete subject.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Subjects
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Organize your knowledge base into structured academic disciplines and topics.
          </p>
        </div>
        <Button
          id="btn-create-subject"
          variant="primary"
          size="sm"
          icon={<Icon name="plus" size={14} />}
          onClick={handleOpenCreate}
        >
          New Subject
        </Button>
      </div>

      {/* Content States */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="subjects-loading">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="p-5 rounded-lg border border-app-border bg-app-surface space-y-3"
            >
              <div className="flex items-center justify-between">
                <Skeleton width="40%" height="20px" />
                <Skeleton width="60px" height="18px" />
              </div>
              <Skeleton width="90%" height="14px" />
              <Skeleton width="70%" height="14px" />
              <div className="flex items-center gap-2 pt-2">
                <Skeleton width="50px" height="20px" />
                <Skeleton width="80px" height="20px" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load subjects"
          message={error}
          onRetry={fetchSubjects}
        />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<Icon name="book" size={24} />}
          title="No subjects yet."
          description="Create your first subject to organize study material, knowledge notes, and topic hierarchies."
          actionLabel="Create Subject"
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="subjects-grid">
          {subjects.map((subject) => (
            <div
              key={subject._id}
              data-testid={`subject-card-${subject._id}`}
              onClick={() => navigate(`/subjects/${subject._id}`)}
              className="group relative flex flex-col justify-between p-5 rounded-lg border border-app-border bg-app-surface hover:border-brand-500/50 hover:shadow-subtle transition-all cursor-pointer overflow-hidden"
            >
              {/* Top Accent Strip */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: subject.color || '#3b82f6' }}
              />

              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="text-base font-semibold text-app-text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1">
                    {subject.name}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    <IconButton
                      icon={<Icon name="edit" size={14} />}
                      label={`Edit ${subject.name}`}
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleOpenEdit(subject, e)}
                    />
                    <IconButton
                      icon={<Icon name="trash" size={14} />}
                      label={`Delete ${subject.name}`}
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleOpenDelete(subject, e)}
                      className="text-app-text-muted hover:text-status-danger"
                    />
                  </div>
                </div>

                <p className="text-xs text-app-text-secondary line-clamp-2 min-h-[32px] mb-4">
                  {subject.description || (
                    <span className="italic text-app-text-muted">No description provided</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-app-border text-xs text-app-text-muted">
                <div className="flex items-center gap-2">
                  <Badge variant={subject.status === 'archived' ? 'neutral' : 'success'} size="sm">
                    {subject.status || 'active'}
                  </Badge>
                  <span className="capitalize text-[11px] font-medium bg-app-surface-muted px-2 py-0.5 rounded border border-app-border">
                    {subject.targetMasteryLevel || 'intermediate'}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-medium">
                  <Icon name="layers" size={13} />
                  <span>{subject.topicsCount || 0} topics</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Subject Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => !submitting && setIsCreateOpen(false)}
        title="Create Subject"
        description="Define a new academic subject to structure your learning materials and notes."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <Input
            id="subject-create-name"
            label="Subject Name"
            placeholder="e.g. Linear Algebra, Distributed Systems, Organic Chemistry"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
            disabled={submitting}
          />

          <div>
            <label
              htmlFor="subject-create-desc"
              className="block text-xs font-medium text-app-text-secondary mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="subject-create-desc"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What core topics, syllabus goals, or exams does this subject encompass?"
              disabled={submitting}
              className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary placeholder:text-app-text-muted p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Target Mastery Level
              </label>
              <select
                id="subject-create-mastery"
                value={formData.targetMasteryLevel}
                onChange={(e) => setFormData({ ...formData, targetMasteryLevel: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {MASTERY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Color Tag
              </label>
              <div className="flex items-center gap-2 py-1">
                {COLOR_OPTIONS.map((col) => (
                  <button
                    key={col.value}
                    type="button"
                    title={col.label}
                    onClick={() => setFormData({ ...formData, color: col.value })}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      formData.color === col.value
                        ? 'ring-2 ring-offset-2 ring-brand-500 scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: col.value }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Create Subject
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog
        isOpen={!!editingSubject}
        onClose={() => !submitting && setEditingSubject(null)}
        title="Edit Subject"
        description="Update subject details, target mastery level, or archived state."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <Input
            id="subject-edit-name"
            label="Subject Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
            disabled={submitting}
          />

          <div>
            <label
              htmlFor="subject-edit-desc"
              className="block text-xs font-medium text-app-text-secondary mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="subject-edit-desc"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={submitting}
              className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary placeholder:text-app-text-muted p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Target Mastery
              </label>
              <select
                id="subject-edit-mastery"
                value={formData.targetMasteryLevel}
                onChange={(e) => setFormData({ ...formData, targetMasteryLevel: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-xs text-app-text-primary py-2 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {MASTERY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Status
              </label>
              <select
                id="subject-edit-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-xs text-app-text-primary py-2 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Color Tag
              </label>
              <div className="flex items-center gap-1.5 py-1">
                {COLOR_OPTIONS.map((col) => (
                  <button
                    key={col.value}
                    type="button"
                    title={col.label}
                    onClick={() => setFormData({ ...formData, color: col.value })}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      formData.color === col.value
                        ? 'ring-2 ring-offset-2 ring-brand-500 scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: col.value }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingSubject(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Subject Confirmation Dialog */}
      <Dialog
        isOpen={!!deletingSubject}
        onClose={() => !submitting && setDeletingSubject(null)}
        title="Delete Subject"
        description="Are you sure you want to delete this subject?"
      >
        <div className="space-y-4 pt-1">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <p className="text-sm text-app-text-secondary leading-relaxed">
            Deleting <span className="font-semibold text-app-text-primary">"{deletingSubject?.name}"</span> will permanently remove this subject and all its associated topics and knowledge records. This action cannot be undone.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingSubject(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={submitting}
              onClick={handleDeleteSubmit}
            >
              Delete Subject
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default SubjectsPage;
