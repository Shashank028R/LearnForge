import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
import { subjectsApi, topicsApi } from '../api/subjectsApi';

const TOPIC_STATUS_OPTIONS = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Mastered', value: 'mastered' },
];

export function SubjectDetailPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  const [subject, setSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Topic Modals
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [deletingTopic, setDeletingTopic] = useState(null);

  // Subject Edit / Delete Modals
  const [isEditSubjectOpen, setIsEditSubjectOpen] = useState(false);
  const [isDeleteSubjectOpen, setIsDeleteSubjectOpen] = useState(false);

  // Topic Form state
  const [topicForm, setTopicForm] = useState({
    title: '',
    description: '',
    orderIndex: 0,
    status: 'not_started',
  });

  // Subject Form state
  const [subjectForm, setSubjectForm] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    targetMasteryLevel: 'intermediate',
    status: 'active',
  });

  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch subject and topics
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [subjRes, topRes] = await Promise.all([
        subjectsApi.get(subjectId),
        topicsApi.list(subjectId),
      ]);
      setSubject(subjRes?.subject || null);
      setTopics(topRes?.topics || []);
      if (subjRes?.subject) {
        setSubjectForm({
          name: subjRes.subject.name || '',
          description: subjRes.subject.description || '',
          color: subjRes.subject.color || '#3b82f6',
          targetMasteryLevel: subjRes.subject.targetMasteryLevel || 'intermediate',
          status: subjRes.subject.status || 'active',
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load subject details.');
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Topic Create Handlers
  const handleOpenCreateTopic = () => {
    setTopicForm({
      title: '',
      description: '',
      orderIndex: topics.length,
      status: 'not_started',
    });
    setFormError(null);
    setIsCreateTopicOpen(true);
  };

  const handleCreateTopicSubmit = async (e) => {
    e.preventDefault();
    if (!topicForm.title.trim()) {
      setFormError('Topic title is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await topicsApi.create({
        subjectId,
        title: topicForm.title.trim(),
        description: topicForm.description.trim(),
        orderIndex: Number(topicForm.orderIndex) || 0,
        status: topicForm.status,
      });

      setIsCreateTopicOpen(false);
      if (res?.topic) {
        setTopics((prev) => [...prev, res.topic].sort((a, b) => a.orderIndex - b.orderIndex));
        // increment subject topicsCount in local state
        setSubject((prev) => prev ? { ...prev, topicsCount: (prev.topicsCount || 0) + 1 } : prev);
      } else {
        await loadData();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create topic.');
    } finally {
      setSubmitting(false);
    }
  };

  // Topic Edit Handlers
  const handleOpenEditTopic = (topic) => {
    setEditingTopic(topic);
    setTopicForm({
      title: topic.title || '',
      description: topic.description || '',
      orderIndex: topic.orderIndex !== undefined ? topic.orderIndex : 0,
      status: topic.status || 'not_started',
    });
    setFormError(null);
  };

  const handleEditTopicSubmit = async (e) => {
    e.preventDefault();
    if (!topicForm.title.trim()) {
      setFormError('Topic title is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await topicsApi.update(editingTopic._id, {
        title: topicForm.title.trim(),
        description: topicForm.description.trim(),
        orderIndex: Number(topicForm.orderIndex) || 0,
        status: topicForm.status,
      });

      setEditingTopic(null);
      if (res?.topic) {
        setTopics((prev) =>
          prev
            .map((t) => (t._id === res.topic._id ? res.topic : t))
            .sort((a, b) => a.orderIndex - b.orderIndex)
        );
      } else {
        await loadData();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to update topic.');
    } finally {
      setSubmitting(false);
    }
  };

  // Topic Delete Handlers
  const handleDeleteTopicSubmit = async () => {
    if (!deletingTopic) return;
    try {
      setSubmitting(true);
      setFormError(null);
      await topicsApi.delete(deletingTopic._id);
      setTopics((prev) => prev.filter((t) => t._id !== deletingTopic._id));
      setSubject((prev) => prev ? { ...prev, topicsCount: Math.max(0, (prev.topicsCount || 1) - 1) } : prev);
      setDeletingTopic(null);
    } catch (err) {
      setFormError(err.message || 'Failed to delete topic.');
    } finally {
      setSubmitting(false);
    }
  };

  // Subject Edit Handler
  const handleEditSubjectSubmit = async (e) => {
    e.preventDefault();
    if (!subjectForm.name.trim()) {
      setFormError('Subject name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await subjectsApi.update(subjectId, {
        name: subjectForm.name.trim(),
        description: subjectForm.description.trim(),
        color: subjectForm.color,
        targetMasteryLevel: subjectForm.targetMasteryLevel,
        status: subjectForm.status,
      });
      setIsEditSubjectOpen(false);
      if (res?.subject) {
        setSubject(res.subject);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to update subject.');
    } finally {
      setSubmitting(false);
    }
  };

  // Subject Delete Handler
  const handleDeleteSubjectSubmit = async () => {
    try {
      setSubmitting(true);
      setFormError(null);
      await subjectsApi.delete(subjectId);
      setIsDeleteSubjectOpen(false);
      navigate('/subjects', { replace: true });
    } catch (err) {
      setFormError(err.message || 'Failed to delete subject.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="subject-detail-loading">
        <div className="space-y-2">
          <Skeleton width="120px" height="16px" />
          <Skeleton width="40%" height="28px" />
          <Skeleton width="60%" height="16px" />
        </div>
        <div className="space-y-3 pt-6">
          <Skeleton width="200px" height="20px" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height="72px" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <ErrorState
        title="Subject Not Found"
        message={error || 'The requested subject does not exist or has been removed.'}
        actionLabel="Back to Subjects"
        onAction={() => navigate('/subjects')}
        onRetry={loadData}
      />
    );
  }

  return (
    <div className="space-y-8" data-testid="subject-detail-page">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/subjects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-app-text-secondary hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <Icon name="arrow-left" size={14} />
          <span>Back to Subjects</span>
        </Link>
      </div>

      {/* Subject Header Card */}
      <div className="relative p-6 rounded-lg border border-app-border bg-app-surface overflow-hidden shadow-subtle">
        {/* Accent Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: subject.color || '#3b82f6' }}
        />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: subject.color || '#3b82f6' }}
              />
              <h1 className="text-2xl font-bold text-app-text-primary tracking-tight">
                {subject.name}
              </h1>
              <Badge variant={subject.status === 'archived' ? 'neutral' : 'success'} size="sm">
                {subject.status || 'active'}
              </Badge>
            </div>

            <p className="text-sm text-app-text-secondary max-w-2xl leading-relaxed">
              {subject.description || <span className="italic text-app-text-muted">No description provided.</span>}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 text-xs text-app-text-muted">
              <span className="capitalize font-medium bg-app-surface-muted px-2.5 py-1 rounded border border-app-border">
                Target: {subject.targetMasteryLevel || 'intermediate'}
              </span>
              <span className="font-medium bg-app-surface-muted px-2.5 py-1 rounded border border-app-border flex items-center gap-1.5">
                <Icon name="layers" size={13} />
                <span>{topics.length} {topics.length === 1 ? 'Topic' : 'Topics'}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              icon={<Icon name="edit" size={14} />}
              onClick={() => setIsEditSubjectOpen(true)}
            >
              Edit Subject
            </Button>
            <Button
              id="btn-new-topic"
              variant="primary"
              size="sm"
              icon={<Icon name="plus" size={14} />}
              onClick={handleOpenCreateTopic}
            >
              New Topic
            </Button>
            <IconButton
              icon={<Icon name="trash" size={15} />}
              label="Delete Subject"
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteSubjectOpen(true)}
              className="text-app-text-muted hover:text-status-danger"
            />
          </div>
        </div>
      </div>

      {/* Topics & Knowledge Structure Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-app-text-primary tracking-tight">
              Topics & Knowledge Structure
            </h2>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Canonical knowledge units, conceptual hierarchy, and mastery state.
            </p>
          </div>
        </div>

        {topics.length === 0 ? (
          <EmptyState
            icon={<Icon name="layers" size={24} />}
            title="No topics in this subject yet."
            description="Create topic nodes to organize syllabus concepts, study summaries, and canonical notes."
            actionLabel="Create First Topic"
            onAction={handleOpenCreateTopic}
          />
        ) : (
          <div className="space-y-3" data-testid="topics-list">
            {topics.map((topic, idx) => (
              <div
                key={topic._id}
                data-testid={`topic-item-${topic._id}`}
                className="group p-4 rounded-lg border border-app-border bg-app-surface hover:border-brand-500/40 hover:shadow-subtle transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded bg-app-surface-muted border border-app-border flex items-center justify-center shrink-0 text-xs font-semibold text-app-text-secondary">
                    {topic.orderIndex !== undefined ? topic.orderIndex + 1 : idx + 1}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-app-text-primary">
                        {topic.title}
                      </h3>
                      <Badge
                        variant={
                          topic.status === 'mastered'
                            ? 'success'
                            : topic.status === 'in_progress'
                            ? 'brand'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {topic.status === 'not_started'
                          ? 'Not Started'
                          : topic.status === 'in_progress'
                          ? 'In Progress'
                          : 'Mastered'}
                      </Badge>
                    </div>

                    {topic.description && (
                      <p className="text-xs text-app-text-secondary line-clamp-2 max-w-xl">
                        {topic.description}
                      </p>
                    )}

                    {/* Knowledge State Preview (key concepts chips) */}
                    {topic.knowledgeState?.keyConcepts && topic.knowledgeState.keyConcepts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {topic.knowledgeState.keyConcepts.map((concept, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-block text-[10px] font-medium px-2 py-0.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-full"
                          >
                            {concept}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <IconButton
                    icon={<Icon name="edit" size={14} />}
                    label={`Edit ${topic.title}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEditTopic(topic)}
                  />
                  <IconButton
                    icon={<Icon name="trash" size={14} />}
                    label={`Delete ${topic.title}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingTopic(topic)}
                    className="text-app-text-muted hover:text-status-danger"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Topic Dialog */}
      <Dialog
        isOpen={isCreateTopicOpen}
        onClose={() => !submitting && setIsCreateTopicOpen(false)}
        title="New Topic"
        description="Add a distinct topic unit to structure knowledge and conceptual milestones."
      >
        <form onSubmit={handleCreateTopicSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <Input
            id="topic-create-title"
            label="Topic Title"
            placeholder="e.g. Eigenvalues & Eigenvectors, Raft Consensus, Reaction Kinetics"
            value={topicForm.title}
            onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
            required
            autoFocus
            disabled={submitting}
          />

          <div>
            <label
              htmlFor="topic-create-desc"
              className="block text-xs font-medium text-app-text-secondary mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="topic-create-desc"
              rows={3}
              value={topicForm.description}
              onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
              placeholder="Summary of concepts covered in this topic unit..."
              disabled={submitting}
              className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary placeholder:text-app-text-muted p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Status
              </label>
              <select
                id="topic-create-status"
                value={topicForm.status}
                onChange={(e) => setTopicForm({ ...topicForm, status: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {TOPIC_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Input
                id="topic-create-order"
                label="Order Index"
                type="number"
                min="0"
                value={topicForm.orderIndex}
                onChange={(e) => setTopicForm({ ...topicForm, orderIndex: e.target.value })}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateTopicOpen(false)}
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
              Create Topic
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Topic Dialog */}
      <Dialog
        isOpen={!!editingTopic}
        onClose={() => !submitting && setEditingTopic(null)}
        title="Edit Topic"
        description="Update topic title, details, sequence order, or study status."
      >
        <form onSubmit={handleEditTopicSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <Input
            id="topic-edit-title"
            label="Topic Title"
            value={topicForm.title}
            onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
            required
            autoFocus
            disabled={submitting}
          />

          <div>
            <label
              htmlFor="topic-edit-desc"
              className="block text-xs font-medium text-app-text-secondary mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="topic-edit-desc"
              rows={3}
              value={topicForm.description}
              onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
              disabled={submitting}
              className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary placeholder:text-app-text-muted p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Status
              </label>
              <select
                id="topic-edit-status"
                value={topicForm.status}
                onChange={(e) => setTopicForm({ ...topicForm, status: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {TOPIC_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Input
                id="topic-edit-order"
                label="Order Index"
                type="number"
                min="0"
                value={topicForm.orderIndex}
                onChange={(e) => setTopicForm({ ...topicForm, orderIndex: e.target.value })}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingTopic(null)}
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

      {/* Delete Topic Confirmation Dialog */}
      <Dialog
        isOpen={!!deletingTopic}
        onClose={() => !submitting && setDeletingTopic(null)}
        title="Delete Topic"
        description="Are you sure you want to delete this topic?"
      >
        <div className="space-y-4 pt-1">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <p className="text-sm text-app-text-secondary leading-relaxed">
            Deleting <span className="font-semibold text-app-text-primary">"{deletingTopic?.title}"</span> will remove this topic and its knowledge state. This action cannot be undone.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingTopic(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={submitting}
              onClick={handleDeleteTopicSubmit}
            >
              Delete Topic
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog
        isOpen={isEditSubjectOpen}
        onClose={() => !submitting && setIsEditSubjectOpen(false)}
        title="Edit Subject"
        description="Update subject metadata and study target."
      >
        <form onSubmit={handleEditSubjectSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <Input
            id="subjdetail-edit-name"
            label="Subject Name"
            value={subjectForm.name}
            onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
            required
            autoFocus
            disabled={submitting}
          />

          <div>
            <label
              htmlFor="subjdetail-edit-desc"
              className="block text-xs font-medium text-app-text-secondary mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="subjdetail-edit-desc"
              rows={3}
              value={subjectForm.description}
              onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
              disabled={submitting}
              className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary placeholder:text-app-text-muted p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Target Mastery
              </label>
              <select
                id="subjdetail-edit-mastery"
                value={subjectForm.targetMasteryLevel}
                onChange={(e) => setSubjectForm({ ...subjectForm, targetMasteryLevel: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="comprehensive">Comprehensive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-text-secondary mb-1.5">
                Status
              </label>
              <select
                id="subjdetail-edit-status"
                value={subjectForm.status}
                onChange={(e) => setSubjectForm({ ...subjectForm, status: e.target.value })}
                disabled={submitting}
                className="w-full bg-app-surface border border-app-border rounded text-sm text-app-text-primary py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditSubjectOpen(false)}
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

      {/* Delete Subject Dialog */}
      <Dialog
        isOpen={isDeleteSubjectOpen}
        onClose={() => !submitting && setIsDeleteSubjectOpen(false)}
        title="Delete Subject"
        description="Are you sure you want to delete this entire subject?"
      >
        <div className="space-y-4 pt-1">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <p className="text-sm text-app-text-secondary leading-relaxed">
            Deleting <span className="font-semibold text-app-text-primary">"{subject.name}"</span> will remove the subject and all {topics.length} topics within it.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteSubjectOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={submitting}
              onClick={handleDeleteSubjectSubmit}
            >
              Delete Subject
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default SubjectDetailPage;
