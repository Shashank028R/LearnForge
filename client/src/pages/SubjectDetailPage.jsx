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
import syllabusApi from '../api/syllabusApi';

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

  // Syllabus Governance State
  const [syllabusInfo, setSyllabusInfo] = useState({
    syllabusStatus: 'no_syllabus',
    activeVersion: null,
    latestDraft: null,
    totalVersions: 0,
  });
  const [syllabusVersions, setSyllabusVersions] = useState([]);
  const [isVersionsHistoryOpen, setIsVersionsHistoryOpen] = useState(false);
  const [isEditSyllabusDraftOpen, setIsEditSyllabusDraftOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [versionToApprove, setVersionToApprove] = useState(null);

  // Draft Syllabus Form State
  const [draftForm, setDraftForm] = useState({
    _id: null,
    version: 1,
    title: '',
    changeSummary: '',
    sections: [],
  });

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

  // Fetch subject, topics, and syllabus status
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [subjRes, topRes, sylRes] = await Promise.all([
        subjectsApi.get(subjectId),
        topicsApi.list(subjectId),
        syllabusApi.getStatus(subjectId).catch(() => null),
      ]);
      setSubject(subjRes?.subject || subjRes || null);
      setTopics(topRes?.topics || (Array.isArray(topRes) ? topRes : []));
      const info = sylRes?.data || sylRes;
      if (info && (info.syllabusStatus || info.activeVersion !== undefined)) {
        setSyllabusInfo(info);
      }
      if (subjRes?.subject || subjRes) {
        const sDoc = subjRes?.subject || subjRes;
        setSubjectForm({
          name: sDoc.name || '',
          description: sDoc.description || '',
          color: sDoc.color || '#3b82f6',
          targetMasteryLevel: sDoc.targetMasteryLevel || 'intermediate',
          status: sDoc.status || 'active',
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

  // Fetch all syllabus versions for history modal
  const fetchSyllabusVersions = async () => {
    try {
      const res = await syllabusApi.listVersions(subjectId);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setSyllabusVersions(list);
      setIsVersionsHistoryOpen(true);
    } catch (err) {
      setFormError(err.message || 'Failed to load syllabus versions.');
    }
  };

  // Open Draft Editor (either for latest draft or derive from active approved)
  const handleOpenDraftEditor = async (existingVersion = null) => {
    setFormError(null);
    if (existingVersion) {
      setDraftForm({
        _id: existingVersion._id,
        version: existingVersion.version,
        title: existingVersion.title || '',
        changeSummary: existingVersion.changeSummary || '',
        sections: existingVersion.sections || [],
      });
      setIsEditSyllabusDraftOpen(true);
    } else if (syllabusInfo.latestDraft) {
      setDraftForm({
        _id: syllabusInfo.latestDraft._id,
        version: syllabusInfo.latestDraft.version,
        title: syllabusInfo.latestDraft.title || '',
        changeSummary: syllabusInfo.latestDraft.changeSummary || '',
        sections: syllabusInfo.latestDraft.sections || [],
      });
      setIsEditSyllabusDraftOpen(true);
    } else if (syllabusInfo.activeVersion) {
      // Derive new draft from active approved version
      try {
        setSubmitting(true);
        const res = await syllabusApi.createDraft(subjectId, {
          baseVersionId: syllabusInfo.activeVersion._id,
          title: `${subject.name} Syllabus v${(syllabusInfo.activeVersion.version || 1) + 1}`,
          changeSummary: 'Draft revision derived from active curriculum',
        });
        const draft = res?.data || res;
        if (draft && draft._id) {
          setDraftForm({
            _id: draft._id,
            version: draft.version,
            title: draft.title,
            changeSummary: draft.changeSummary,
            sections: draft.sections || [],
          });
          await loadData();
          setIsEditSyllabusDraftOpen(true);
        }
      } catch (err) {
        setFormError(err.message || 'Failed to derive new draft.');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Brand new initial draft
      setDraftForm({
        _id: null,
        version: 1,
        title: `${subject.name} Curriculum v1`,
        changeSummary: 'Initial syllabus draft',
        sections: [
          {
            key: `sec-${Date.now()}-1`,
            title: 'Foundations',
            description: 'Core principles and essential knowledge',
            topics: [
              {
                key: `top-${Date.now()}-1`,
                title: 'Overview & Setup',
                description: 'Initial conceptual overview',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });
      setIsEditSyllabusDraftOpen(true);
    }
  };

  // Save Syllabus Draft
  const handleSaveDraftSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setFormError(null);

      if (!draftForm.title.trim()) {
        setFormError('Syllabus title is required.');
        return;
      }

      if (draftForm._id) {
        // Update existing draft
        await syllabusApi.updateDraft(subjectId, draftForm._id, {
          title: draftForm.title.trim(),
          changeSummary: draftForm.changeSummary.trim(),
          sections: draftForm.sections,
        });
      } else {
        // Create new draft
        await syllabusApi.createDraft(subjectId, {
          title: draftForm.title.trim(),
          changeSummary: draftForm.changeSummary.trim(),
          sections: draftForm.sections,
        });
      }

      setIsEditSyllabusDraftOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save syllabus draft.');
    } finally {
      setSubmitting(false);
    }
  };

  // Section / Topic Editor Handlers inside Syllabus Draft
  const handleAddSection = () => {
    setDraftForm((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          key: `sec-${Date.now()}`,
          title: `Section ${prev.sections.length + 1}`,
          description: '',
          topics: [],
        },
      ],
    }));
  };

  const handleRemoveSection = (secIdx) => {
    setDraftForm((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, idx) => idx !== secIdx),
    }));
  };

  const handleSectionChange = (secIdx, field, val) => {
    setDraftForm((prev) => {
      const updated = [...prev.sections];
      updated[secIdx] = { ...updated[secIdx], [field]: val };
      return { ...prev, sections: updated };
    });
  };

  const handleAddTopicToSection = (secIdx) => {
    setDraftForm((prev) => {
      const updated = [...prev.sections];
      const sec = updated[secIdx];
      const topics = sec.topics || [];
      updated[secIdx] = {
        ...sec,
        topics: [
          ...topics,
          {
            key: `top-${Date.now()}`,
            title: `Topic ${topics.length + 1}`,
            description: '',
            estimatedMinutes: 30,
          },
        ],
      };
      return { ...prev, sections: updated };
    });
  };

  const handleRemoveTopicFromSection = (secIdx, topIdx) => {
    setDraftForm((prev) => {
      const updated = [...prev.sections];
      const sec = updated[secIdx];
      updated[secIdx] = {
        ...sec,
        topics: sec.topics.filter((_, idx) => idx !== topIdx),
      };
      return { ...prev, sections: updated };
    });
  };

  const handleTopicChangeInSection = (secIdx, topIdx, field, val) => {
    setDraftForm((prev) => {
      const updated = [...prev.sections];
      const sec = updated[secIdx];
      const topics = [...sec.topics];
      topics[topIdx] = { ...topics[topIdx], [field]: val };
      updated[secIdx] = { ...sec, topics };
      return { ...prev, sections: updated };
    });
  };

  // Explicit Syllabus Approval Flow
  const handleOpenApproveModal = (version) => {
    setVersionToApprove(version || syllabusInfo.latestDraft);
    setIsApproveConfirmOpen(true);
  };

  const handleConfirmApproveSyllabus = async () => {
    if (!versionToApprove) return;
    try {
      setSubmitting(true);
      setFormError(null);
      await syllabusApi.approveVersion(subjectId, versionToApprove._id);
      setIsApproveConfirmOpen(false);
      setIsEditSyllabusDraftOpen(false);
      setIsVersionsHistoryOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to approve syllabus version.');
    } finally {
      setSubmitting(false);
    }
  };

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
        setSubject((prev) => (prev ? { ...prev, topicsCount: (prev.topicsCount || 0) + 1 } : prev));
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
      setSubject((prev) =>
        prev ? { ...prev, topicsCount: Math.max(0, (prev.topicsCount || 1) - 1) } : prev
      );
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

  const syllabusStatus = syllabusInfo.syllabusStatus || subject.syllabusStatus || 'no_syllabus';

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
                <span>
                  {topics.filter((t) => t.isActiveInSyllabus !== false).length}{' '}
                  {topics.filter((t) => t.isActiveInSyllabus !== false).length === 1 ? 'Active Topic' : 'Active Topics'}
                  {topics.some((t) => t.isActiveInSyllabus === false) && (
                    <span className="text-app-text-muted font-normal">
                      {' '}(+{topics.filter((t) => t.isActiveInSyllabus === false).length} historical)
                    </span>
                  )}
                </span>
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

      {/* ======================================================== */}
      {/* SYLLABUS GOVERNANCE & CURRICULUM SECTION                */}
      {/* ======================================================== */}
      <div
        className="p-5 rounded-lg border border-app-border bg-app-surface shadow-subtle space-y-4"
        data-testid="syllabus-governance-panel"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-app-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-app-text-primary tracking-tight">
                Curriculum Syllabus
              </h2>
              {syllabusStatus === 'approved' && syllabusInfo.activeVersion ? (
                <Badge variant="success" size="sm">
                  Approved — v{syllabusInfo.activeVersion.version}
                </Badge>
              ) : syllabusStatus === 'draft' || syllabusInfo.latestDraft ? (
                <Badge variant="brand" size="sm">
                  Draft — v{syllabusInfo.latestDraft?.version || 1}
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  Not Created
                </Badge>
              )}
            </div>
            <p className="text-xs text-app-text-secondary">
              Authoritative learning contract. Approved syllabus establishes canonical topics for study mode.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {syllabusInfo.totalVersions > 0 && (
              <Button
                variant="outline"
                size="sm"
                icon={<Icon name="layers" size={14} />}
                onClick={fetchSyllabusVersions}
              >
                Version History ({syllabusInfo.totalVersions})
              </Button>
            )}

            {syllabusStatus === 'no_syllabus' ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Icon name="plus" size={14} />}
                onClick={() => handleOpenDraftEditor(null)}
              >
                Create Syllabus Draft
              </Button>
            ) : syllabusInfo.latestDraft ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Icon name="edit" size={14} />}
                  onClick={() => handleOpenDraftEditor(syllabusInfo.latestDraft)}
                >
                  Edit Draft (v{syllabusInfo.latestDraft.version})
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Icon name="check" size={14} />}
                  onClick={() => handleOpenApproveModal(syllabusInfo.latestDraft)}
                >
                  Approve v{syllabusInfo.latestDraft.version}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={<Icon name="edit" size={14} />}
                onClick={() => handleOpenDraftEditor(null)}
              >
                Edit Syllabus (New Draft)
              </Button>
            )}
          </div>
        </div>

        {/* Active Approved or Draft Overview */}
        {syllabusInfo.activeVersion ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-app-text-muted">
              <span className="font-semibold text-app-text-primary">
                {syllabusInfo.activeVersion.title}
              </span>
              <span>
                Approved on {new Date(syllabusInfo.activeVersion.approvedAt).toLocaleDateString()}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(syllabusInfo.activeVersion.sections || []).map((sec, secIdx) => (
                <div
                  key={sec._id || secIdx}
                  className="p-3.5 rounded-lg border border-app-border bg-app-surface-muted/50 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-app-text-primary">
                      {sec.title}
                    </h3>
                    <span className="text-[10px] text-app-text-muted font-medium">
                      {(sec.topics || []).length} topics
                    </span>
                  </div>
                  {sec.description && (
                    <p className="text-[11px] text-app-text-secondary line-clamp-1">
                      {sec.description}
                    </p>
                  )}
                  <ul className="space-y-1 text-xs text-app-text-secondary pt-1">
                    {(sec.topics || []).map((top, topIdx) => (
                      <li key={top._id || topIdx} className="flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                        <span className="truncate">{top.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : syllabusInfo.latestDraft ? (
          <div className="p-4 rounded-lg border border-brand-500/20 bg-brand-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-brand-700 dark:text-brand-300">
                Draft Syllabus Ready for Review (v{syllabusInfo.latestDraft.version})
              </h3>
              <p className="text-xs text-app-text-secondary">
                {syllabusInfo.latestDraft.title} • {(syllabusInfo.latestDraft.sections || []).length} Sections • Explicit approval required before it becomes the active curriculum contract.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleOpenApproveModal(syllabusInfo.latestDraft)}
            >
              Approve Syllabus
            </Button>
          </div>
        ) : (
          <p className="text-xs text-app-text-muted italic">
            No syllabus created for this subject yet. You can chat freely without a syllabus, or create one anytime.
          </p>
        )}
      </div>

      {/* Topics & Knowledge Structure Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-app-text-primary tracking-tight">
              Canonical Topics & Knowledge Nodes
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
                className={`group p-4 rounded-lg border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  topic.isActiveInSyllabus === false
                    ? 'border-app-border/60 bg-app-surface-muted/20 opacity-80'
                    : 'border-app-border bg-app-surface hover:border-brand-500/40 hover:shadow-subtle'
                }`}
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
                      {topic.isActiveInSyllabus === false ? (
                        <Badge variant="neutral" size="sm">
                          Historical / Retired
                        </Badge>
                      ) : (
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
                      )}
                    </div>

                    {topic.description && (
                      <p className="text-xs text-app-text-secondary line-clamp-2 max-w-xl">
                        {topic.description}
                      </p>
                    )}

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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/study?topicId=${topic._id}`)}
                    className="text-xs"
                    aria-label={`Start Study Mode for ${topic.title}`}
                  >
                    <Icon name="study" size={14} className="mr-1.5" />
                    Study
                  </Button>
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

      {/* ======================================================== */}
      {/* SYLLABUS DRAFT EDITOR DIALOG                            */}
      {/* ======================================================== */}
      <Dialog
        isOpen={isEditSyllabusDraftOpen}
        onClose={() => !submitting && setIsEditSyllabusDraftOpen(false)}
        title={`Syllabus Draft v${draftForm.version}`}
        description="Structure sections, modules, and topic hierarchy before explicitly approving."
        size="lg"
      >
        <form onSubmit={handleSaveDraftSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="draft-title"
              label="Syllabus Title"
              value={draftForm.title}
              onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })}
              required
              disabled={submitting}
            />
            <Input
              id="draft-change-summary"
              label="Change Summary / Revision Note"
              placeholder="e.g. Added Async section, updated closures"
              value={draftForm.changeSummary}
              onChange={(e) => setDraftForm({ ...draftForm, changeSummary: e.target.value })}
              disabled={submitting}
            />
          </div>

          {/* Sections Hierarchy */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-app-text-primary uppercase tracking-wider">
                Sections & Topic Hierarchy
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Icon name="plus" size={13} />}
                onClick={handleAddSection}
                disabled={submitting}
              >
                Add Section
              </Button>
            </div>

            {draftForm.sections.length === 0 ? (
              <div className="p-4 rounded border border-dashed border-app-border text-center text-xs text-app-text-muted">
                No sections defined yet. Click "Add Section" to begin structuring the syllabus.
              </div>
            ) : (
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {draftForm.sections.map((sec, secIdx) => (
                  <div
                    key={sec.key || secIdx}
                    className="p-3.5 rounded-lg border border-app-border bg-app-surface-muted/30 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Section Title (e.g. Fundamentals)"
                          value={sec.title}
                          onChange={(e) => handleSectionChange(secIdx, 'title', e.target.value)}
                          required
                          disabled={submitting}
                        />
                        <Input
                          placeholder="Section Description (Optional)"
                          value={sec.description}
                          onChange={(e) => handleSectionChange(secIdx, 'description', e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                      <IconButton
                        icon={<Icon name="trash" size={14} />}
                        label="Remove Section"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSection(secIdx)}
                        className="text-app-text-muted hover:text-status-danger shrink-0"
                      />
                    </div>

                    {/* Topics under Section */}
                    <div className="pl-3 border-l-2 border-brand-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs text-app-text-muted">
                        <span>Topics in this section</span>
                        <button
                          type="button"
                          onClick={() => handleAddTopicToSection(secIdx)}
                          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          <Icon name="plus" size={12} /> Add Topic
                        </button>
                      </div>

                      {(sec.topics || []).map((top, topIdx) => (
                        <div key={top.key || topIdx} className="flex items-center gap-2">
                          <Input
                            placeholder="Topic title (e.g. Closures)"
                            value={top.title}
                            onChange={(e) =>
                              handleTopicChangeInSection(secIdx, topIdx, 'title', e.target.value)
                            }
                            required
                            disabled={submitting}
                            className="flex-1"
                          />
                          <IconButton
                            icon={<Icon name="trash" size={13} />}
                            label="Remove Topic"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveTopicFromSection(secIdx, topIdx)}
                            className="text-app-text-muted hover:text-status-danger shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditSyllabusDraftOpen(false)}
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
              Save Draft
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================== */}
      {/* SYLLABUS APPROVAL CONFIRMATION DIALOG                   */}
      {/* ======================================================== */}
      <Dialog
        isOpen={isApproveConfirmOpen}
        onClose={() => !submitting && setIsApproveConfirmOpen(false)}
        title={`Approve Syllabus v${versionToApprove?.version || ''}?`}
        description="Authoritative curriculum activation"
      >
        <div className="space-y-4 pt-1">
          {formError && (
            <div className="p-3 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium" role="alert">
              {formError}
            </div>
          )}

          <p className="text-sm text-app-text-secondary leading-relaxed">
            Once approved, <span className="font-semibold text-app-text-primary">v{versionToApprove?.version}</span> becomes the active curriculum for <span className="font-semibold text-app-text-primary">"{subject.name}"</span>. Canonical Topics will be reconciled according to this syllabus version.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsApproveConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={submitting}
              onClick={handleConfirmApproveSyllabus}
            >
              Approve Syllabus
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ======================================================== */}
      {/* SYLLABUS VERSION HISTORY MODAL                          */}
      {/* ======================================================== */}
      <Dialog
        isOpen={isVersionsHistoryOpen}
        onClose={() => setIsVersionsHistoryOpen(false)}
        title="Syllabus Version History"
        description="Audit trail of curriculum drafts and approved versions."
        size="lg"
      >
        <div className="space-y-3 pt-2 max-h-[400px] overflow-y-auto">
          {syllabusVersions.map((v) => (
            <div
              key={v._id}
              className="p-3.5 rounded-lg border border-app-border bg-app-surface flex items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-app-text-primary">
                    v{v.version} — {v.title}
                  </span>
                  <Badge
                    variant={
                      v.status === 'approved'
                        ? 'success'
                        : v.status === 'draft'
                        ? 'brand'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {v.status.toUpperCase()}
                  </Badge>
                </div>
                {v.changeSummary && (
                  <p className="text-xs text-app-text-secondary">
                    {v.changeSummary}
                  </p>
                )}
                <p className="text-[10px] text-app-text-muted">
                  Created {new Date(v.createdAt).toLocaleString()}
                  {v.approvedAt && ` • Approved ${new Date(v.approvedAt).toLocaleString()}`}
                  {v.supersededAt && ` • Superseded ${new Date(v.supersededAt).toLocaleString()}`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {v.status === 'draft' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsVersionsHistoryOpen(false);
                      handleOpenApproveModal(v);
                    }}
                  >
                    Approve
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Dialog>

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
