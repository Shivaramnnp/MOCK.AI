import React, { useState } from 'react';
import {
  School,
  Users,
  Plus,
  KeyRound,
  FileCheck2,
  Calendar,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  GraduationCap,
  Award,
} from 'lucide-react';
import { ClassModel, AssignmentModel, UserProfile, TestHistory } from '../types';

interface ClassroomScreenProps {
  profile: UserProfile;
  classes: ClassModel[];
  assignments: AssignmentModel[];
  tests: TestHistory[];
  onCreateClass: (name: string) => void;
  onJoinClass: (code: string) => void;
  onCreateAssignment: (classId: string, testId: string, dueDate: number | null) => void;
  onTakeAssignment: (asg: AssignmentModel) => void;
}

export const ClassroomScreen: React.FC<ClassroomScreenProps> = ({
  profile,
  classes,
  assignments,
  tests,
  onCreateClass,
  onJoinClass,
  onCreateAssignment,
  onTakeAssignment,
}) => {
  const isTeacher = profile.role === 'TEACHER';
  const [activeTab, setActiveTab] = useState<'classes' | 'assignments' | 'grades'>('classes');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Form state
  const [classNameInput, setClassNameInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [dueDays, setDueDays] = useState(3);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Statistics calculation
  const totalStudents = classes.reduce((acc, c) => acc + c.studentIds.length, 0);

  // Flatten submissions for teachers
  const allSubmissions: {
    studentId: string;
    studentName: string;
    className: string;
    testTitle: string;
    score: number;
    total: number;
    percent: number;
    submittedAt?: number;
  }[] = [];

  assignments.forEach((asg) => {
    Object.entries(asg.studentSubmissions || {}).forEach(([studentId, sub]) => {
      if (sub.status === 'SUBMITTED' && sub.score !== undefined && sub.total !== undefined) {
        // Resolve student name from class roster if available
        const targetClass = classes.find((c) => c.classId === asg.classId);
        const resolvedName = targetClass?.studentNames?.[studentId] || `Scholar ${studentId.slice(-4)}`;

        allSubmissions.push({
          studentId,
          studentName: resolvedName,
          className: asg.className,
          testTitle: asg.testTitle,
          score: sub.score,
          total: sub.total,
          percent: sub.total > 0 ? Math.round((sub.score * 100) / sub.total) : 0,
          submittedAt: sub.submittedAt,
        });
      }
    });
  });

  const studentPendingAssignments = assignments.filter((a) => {
    const sub = a.studentSubmissions?.[profile.uid];
    return !sub || sub.status !== 'SUBMITTED';
  });

  const studentCompletedAssignments = assignments.filter((a) => {
    const sub = a.studentSubmissions?.[profile.uid];
    return sub && sub.status === 'SUBMITTED';
  });

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classNameInput.trim()) return;
    onCreateClass(classNameInput.trim());
    setClassNameInput('');
    setShowCreateModal(false);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    onJoinClass(joinCodeInput.trim().toUpperCase());
    setJoinCodeInput('');
    setShowJoinModal(false);
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !selectedTestId) return;
    const dueTime = dueDays > 0 ? Date.now() + dueDays * 86400000 : null;
    onCreateAssignment(selectedClassId, selectedTestId, dueTime);
    setShowAssignModal(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* ── Classroom Header Bar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <div>
          <div className="flex items-center gap-2">
            <School className="w-7 h-7 text-brand-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              {isTeacher ? 'Teacher Classroom Hub' : 'Student Classrooms'}
            </h1>
          </div>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-0.5">
            {isTeacher
              ? 'Organize rosters, distribute mock exams, and monitor student completion live'
              : 'Access your enrolled classes, review homework assignments, and launch tests'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isTeacher ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Class</span>
            </button>
          ) : (
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <KeyRound className="w-4 h-4" />
              <span>Join Class with Code</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Key Performance Metrics ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-surface-muted uppercase">
            <School className="w-4 h-4 text-brand-primary" />
            <span>Active Classes</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-surface-text dark:text-darkSurface-text mt-2 block">
            {classes.length}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-surface-muted uppercase">
            <Users className="w-4 h-4 text-purple-500" />
            <span>{isTeacher ? 'Total Students' : 'Class Members'}</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-surface-text dark:text-darkSurface-text mt-2 block">
            {totalStudents}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-surface-muted uppercase">
            <FileCheck2 className="w-4 h-4 text-emerald-500" />
            <span>Assignments</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-surface-text dark:text-darkSurface-text mt-2 block">
            {assignments.length}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-surface-muted uppercase">
            <Award className="w-4 h-4 text-amber-500" />
            <span>{isTeacher ? 'Submissions' : 'Completed'}</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-brand-primary mt-2 block">
            {isTeacher ? allSubmissions.length : studentCompletedAssignments.length}
          </span>
        </div>
      </div>

      {/* ── Contextual Navigation Tabs ────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-surface-border dark:border-darkSurface-border pb-1">
        <button
          onClick={() => setActiveTab('classes')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'classes'
              ? 'bg-brand-primary/10 text-brand-primary border-b-2 border-brand-primary'
              : 'text-surface-muted hover:text-surface-text'
          }`}
        >
          Classes & Rosters ({classes.length})
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'assignments'
              ? 'bg-brand-primary/10 text-brand-primary border-b-2 border-brand-primary'
              : 'text-surface-muted hover:text-surface-text'
          }`}
        >
          Assignments ({assignments.length})
        </button>
        {isTeacher && (
          <button
            onClick={() => setActiveTab('grades')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'grades'
                ? 'bg-brand-primary/10 text-brand-primary border-b-2 border-brand-primary'
                : 'text-surface-muted hover:text-surface-text'
            }`}
          >
            Submissions & Grades ({allSubmissions.length})
          </button>
        )}
      </div>

      {/* ── TAB 1: Classes & Rosters ──────────────────────────────────── */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          {classes.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1">
              <Users className="w-10 h-10 text-surface-muted mx-auto mb-3 opacity-50" />
              <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
                No classrooms available
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 max-w-sm mx-auto">
                {isTeacher
                  ? 'Click "Create New Class" above to organize your students.'
                  : 'Ask your instructor for an invite code to join their classroom.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classes.map((cls) => {
                const classAssignments = assignments.filter((a) => a.classId === cls.classId);

                return (
                  <div
                    key={cls.classId}
                    className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
                          {cls.studentIds.length} Students
                        </span>
                        {isTeacher && (
                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold bg-surface-elev2 dark:bg-darkSurface-elev2 px-2.5 py-1 rounded-xl border border-surface-border dark:border-darkSurface-border">
                            <span className="text-surface-muted">Code:</span>
                            <span className="text-brand-primary">{cls.joinCode}</span>
                            <button
                              onClick={() => handleCopyCode(cls.joinCode)}
                              title="Copy code"
                              className="ml-1 text-surface-muted hover:text-brand-primary"
                            >
                              {copiedCode === cls.joinCode ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
                        {cls.name}
                      </h3>
                      <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-0.5">
                        Instructor: {cls.teacherName}
                      </p>

                      {/* Roster preview */}
                      {cls.studentIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {cls.studentIds.slice(0, 4).map((sid) => (
                            <span
                              key={sid}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted"
                            >
                              {cls.studentNames?.[sid] || sid}
                            </span>
                          ))}
                          {cls.studentIds.length > 4 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md text-surface-muted">
                              +{cls.studentIds.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {isTeacher && (
                      <div className="mt-5 pt-3 border-t border-surface-border dark:border-darkSurface-border flex items-center justify-between">
                        <span className="text-xs text-surface-muted">
                          {classAssignments.length} Assignments
                        </span>
                        <button
                          onClick={() => {
                            setSelectedClassId(cls.classId);
                            setShowAssignModal(true);
                          }}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-brand-primary hover:text-white font-bold text-xs text-brand-primary transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Assign Test</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Assignments & Homework ─────────────────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1">
              <FileCheck2 className="w-10 h-10 text-surface-muted mx-auto mb-3 opacity-50" />
              <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
                No exams assigned yet
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 max-w-sm mx-auto">
                {isTeacher
                  ? 'Assign an exam from your test library to a class.'
                  : 'Your instructors have not posted any new homework tests.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map((asg) => {
                const mySub = asg.studentSubmissions?.[profile.uid];
                const isSubmitted = mySub?.status === 'SUBMITTED';
                const submissionCount = Object.keys(asg.studentSubmissions || {}).length;

                return (
                  <div
                    key={asg.assignmentId}
                    className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-md">
                          {asg.className}
                        </span>
                        {asg.dueDate && (
                          <span className="text-xs text-surface-muted flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Due {new Date(asg.dueDate).toLocaleDateString()}</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-base sm:text-lg text-surface-text dark:text-darkSurface-text">
                        {asg.testTitle}
                      </h3>
                      <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1">
                        {asg.questions.length} Questions • Assigned by {asg.assignedByName}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-surface-border dark:border-darkSurface-border flex items-center justify-between">
                      {isTeacher ? (
                        <span className="text-xs font-bold text-surface-muted">
                          {submissionCount} Submissions received
                        </span>
                      ) : (
                        <div>
                          {isSubmitted ? (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                              ✓ Scored {mySub.score} / {mySub.total} ({mySub.scorePercent}%)
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-amber-500">
                              ⏳ Not completed yet
                            </span>
                          )}
                        </div>
                      )}

                      {!isTeacher && (
                        <button
                          onClick={() => onTakeAssignment(asg)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
                        >
                          {isSubmitted ? 'Retake Exam' : 'Launch Exam'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Student Submissions & Grading (Teachers Only) ──────── */}
      {isTeacher && activeTab === 'grades' && (
        <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border overflow-hidden shadow-sm">
          {allSubmissions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Award className="w-10 h-10 text-surface-muted mx-auto mb-3 opacity-50" />
              <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
                No submissions received yet
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 max-w-sm mx-auto">
                Student scores will be automatically compiled here as soon as they submit exams.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-muted uppercase text-[11px] font-bold tracking-wider">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Classroom</th>
                    <th className="px-5 py-3.5">Exam</th>
                    <th className="px-5 py-3.5">Score</th>
                    <th className="px-5 py-3.5">Accuracy</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border">
                  {allSubmissions.map((sub, idx) => (
                    <tr key={idx} className="hover:bg-surface-elev2/50 dark:hover:bg-darkSurface-elev2/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-surface-text dark:text-darkSurface-text">
                        {sub.studentName}
                      </td>
                      <td className="px-5 py-3.5 text-surface-muted">{sub.className}</td>
                      <td className="px-5 py-3.5 text-surface-text dark:text-darkSurface-text font-medium">
                        {sub.testTitle}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-bold">
                        {sub.score} / {sub.total}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`font-bold ${
                            sub.percent >= 80
                              ? 'text-brand-green'
                              : sub.percent >= 50
                              ? 'text-brand-primary'
                              : 'text-brand-red'
                          }`}
                        >
                          {sub.percent}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-brand-green">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Graded</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create Class Modal ────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border p-6 shadow-2xl">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-4">
              Create New Classroom
            </h3>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Class Name:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Grade 12 Physics (Section B)"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Join Class Modal ─────────────────────────────────────────── */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border p-6 shadow-2xl">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-2">
              Join Classroom
            </h3>
            <p className="text-xs text-surface-muted mb-4">
              Enter the 6-character code provided by your instructor.
            </p>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="e.g. PHY981"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="w-full text-center tracking-widest font-mono text-xl font-bold px-4 py-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-brand-primary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110"
                >
                  Enroll Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign Test Modal ────────────────────────────────────────── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border p-6 shadow-2xl">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-4">
              Assign Test to Students
            </h3>
            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Select Exam to Assign:
                </label>
                <select
                  required
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="">-- Choose one of your tests --</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.questions.length} Qs)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Due in (Days):
                </label>
                <select
                  value={dueDays}
                  onChange={(e) => setDueDays(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                >
                  <option value={1}>1 Day (Tomorrow)</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>1 Week</option>
                  <option value={14}>2 Weeks</option>
                  <option value={0}>No Due Date</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedTestId}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110 disabled:opacity-50"
                >
                  Issue Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
