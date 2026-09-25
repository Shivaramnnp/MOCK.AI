import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { SourceSelectorModal } from './components/SourceSelectorModal';
import { CameraModal } from './components/CameraModal';
import { VoiceModal } from './components/VoiceModal';
import { TopicModal, UrlModal, YouTubeModal, JsonModal } from './components/InputModals';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { EditorScreen } from './screens/EditorScreen';
import { TestPlayerScreen } from './screens/TestPlayerScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { ClassroomScreen } from './screens/ClassroomScreen';
import { MarketplaceScreen } from './screens/MarketplaceScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { ExamDetailScreen } from './screens/ExamDetailScreen';
import { CompetitiveExamPlayerScreen } from './screens/CompetitiveExamPlayerScreen';
import { CompetitiveExamResultsScreen } from './screens/CompetitiveExamResultsScreen';

// Services & Types
import { storage } from './services/storage';
import { aiService } from './services/aiService';
import { supabaseService } from './services/supabase';
import { ExamService } from './services/examService';
import {
  AppRoute,
  TestHistory,
  Question,
  TestSessionState,
  InputSourceType,
  UserRole,
  UserProfile,
  PublishedExam,
  ExamPaper,
  ExamTestSession,
} from './types';

export const App: React.FC = () => {
  // Navigation & Screen State
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [navigationStack, setNavigationStack] = useState<AppRoute[]>(['home']);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3200);
  };

  // Data State
  const [tests, setTests] = useState<TestHistory[]>([]);
  const [profile, setProfile] = useState(storage.getProfile());
  const [streak, setStreak] = useState(storage.getStreak());
  const [dailyTasks, setDailyTasks] = useState(storage.getDailyTasks());
  const [dailyInsight, setDailyInsight] = useState(storage.getDailyInsight());
  const [classes, setClasses] = useState(storage.getClasses());
  const [assignments, setAssignments] = useState(storage.getAssignments());
  const [marketplaceExams, setMarketplaceExams] = useState(storage.getMarketplaceExams());
  const [settings, setSettings] = useState(storage.getSettings());

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.location.hash.includes('reset-password') ||
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery')
      );
    }
    return false;
  });

  // Active Session / Working State
  const [activeTest, setActiveTest] = useState<TestHistory | null>(null);
  const [activeSession, setActiveSession] = useState<TestSessionState | null>(null);
  const [editorInitialData, setEditorInitialData] = useState<{
    id?: string;
    title: string;
    category: string;
    questions: Question[];
    existingTest?: TestHistory | null;
  }>({
    title: 'New Mock Test',
    category: 'General',
    questions: [],
    existingTest: null,
  });

  // Processing Screen State
  const [processingStatus, setProcessingStatus] = useState('Ingesting content...');
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Modals Visibility State
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

  // Competitive Exams State
  const [selectedExamId, setSelectedExamId] = useState<string>('ssc-chsl');
  const [activeExamPaper, setActiveExamPaper] = useState<ExamPaper | null>(() => {
    return ExamService.getPaperById('ssc-chsl-2025-13nov-s2') || null;
  });
  const [activeExamSession, setActiveExamSession] = useState<ExamTestSession | null>(null);

  // Initialize storage state, theme, and authentication session on mount
  useEffect(() => {
    setTests(storage.getTests());
    const initialSettings = storage.getSettings();
    setSettings(initialSettings);
    if (initialSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Sync initial hash route if valid
    const validHashRoutes: AppRoute[] = [
      'home',
      'explore',
      'explore_exam',
      'exam_player',
      'exam_results',
      'marketplace',
      'classroom',
      'analytics',
      'profile',
      'settings',
    ];
    const hash = window.location.hash.replace('#', '') as AppRoute;
    if (hash && validHashRoutes.includes(hash)) {
      setCurrentRoute(hash);
      setNavigationStack(['home', hash]);
    }

    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#', '') as AppRoute;
      if (newHash && validHashRoutes.includes(newHash)) {
        setCurrentRoute(newHash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    async function checkAuthSession() {
      try {
        const { user, isAuthenticated: authed } = await supabaseService.getInitialSession();
        if (authed && user) {
          setProfile(user);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.warn('Authentication check failed:', err);
        setIsAuthenticated(false);
      } finally {
        setIsAuthLoading(false);
      }
    }

    checkAuthSession();

    // Subscribe to auth state changes (OAuth redirects, session refreshes, password recovery)
    const unsubscribeAuth = supabaseService.onAuthStateChange((user, event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryMode(true);
      }
      if (user) {
        setProfile(user);
        setIsAuthenticated(true);
        // Only strip URL tokens if NOT currently in password recovery mode
        if (
          typeof window !== 'undefined' &&
          !window.location.hash.includes('reset-password') &&
          !window.location.hash.includes('type=recovery') &&
          !window.location.search.includes('type=recovery') &&
          (window.location.hash.includes('access_token=') || window.location.search.includes('code='))
        ) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const navigateTo = (route: AppRoute) => {
    setNavigationStack((prev) => [...prev, route]);
    setCurrentRoute(route);

    const validHashRoutes: AppRoute[] = [
      'home',
      'marketplace',
      'classroom',
      'analytics',
      'profile',
      'settings',
    ];
    if (validHashRoutes.includes(route)) {
      window.location.hash = route;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateBack = () => {
    setNavigationStack((prev) => {
      if (prev.length <= 1) {
        setCurrentRoute('home');
        window.location.hash = 'home';
        return ['home'];
      }
      const newStack = prev.slice(0, prev.length - 1);
      const target = newStack[newStack.length - 1];
      setCurrentRoute(target);
      const validHashRoutes: AppRoute[] = [
        'home',
        'marketplace',
        'classroom',
        'analytics',
        'profile',
        'settings',
      ];
      if (validHashRoutes.includes(target)) {
        window.location.hash = target;
      }
      return newStack;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Handlers for Creation Sources ---

  const handleSelectSource = (type: InputSourceType, payload?: any) => {
    if (type === 'Topic') {
      setIsTopicModalOpen(true);
    } else if (type === 'WebUrl') {
      setIsUrlModalOpen(true);
    } else if (type === 'YouTube') {
      setIsYouTubeModalOpen(true);
    } else if (type === 'Json') {
      setIsJsonModalOpen(true);
    } else if (type === 'Camera') {
      setIsCameraModalOpen(true);
    } else if (type === 'Audio') {
      setIsVoiceModalOpen(true);
    } else if (type === 'Manual') {
      setEditorInitialData({
        title: 'Manual Mock Test',
        category: 'Custom',
        questions: [
          {
            id: 'q-1',
            questionText: '',
            options: ['', '', '', ''],
            correctAnswerIndex: 0,
            topic: 'General',
            explanation: '',
          },
        ],
        existingTest: null,
      });
      navigateTo('editor');
    } else if (type === 'PDF' || type === 'Image') {
      if (payload?.base64) {
        startProcessingFile(payload.base64, payload.file?.type || 'application/pdf', payload.name);
      }
    } else if (type === 'Docx') {
      if (payload?.file) {
        startProcessingDocx(payload.file, payload.name);
      }
    }
  };

  const startProcessingFile = async (base64: string, mimeType: string, fileName: string) => {
    setProcessingStatus(`Analyzing and extracting questions from ${fileName}...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromBase64File(base64, mimeType, fileName);
      setEditorInitialData({
        title: fileName.replace(/\.[^/.]+$/, '') || 'Extracted Test',
        category: mimeType.includes('pdf') ? 'PDF Study' : 'Document',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to extract questions from file.');
    }
  };

  const startProcessingDocx = async (file: File, fileName: string) => {
    setProcessingStatus(`Parsing Word document: ${fileName}...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const buffer = await file.arrayBuffer();
      const extractedText = await aiService.extractTextFromDocx(buffer);
      if (!extractedText.trim()) {
        throw new Error('No readable text could be extracted from this Word document.');
      }
      setProcessingStatus(`Generating mock exam questions from document content...`);
      const questions = await aiService.extractFromText(extractedText, fileName);
      setEditorInitialData({
        title: fileName.replace(/\.[^/.]+$/, '') || 'Document Mock Exam',
        category: 'Document Study',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to extract questions from Word document.');
    }
  };

  const handleTopicSubmit = async (topic: string, difficulty: string, count: number) => {
    setProcessingStatus(`Generating ${count} ${difficulty} questions on "${topic}"...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.generateFromTopic(topic, difficulty, count);
      setEditorInitialData({
        title: `${topic} Mock Exam`,
        category: topic,
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to generate questions from topic.');
    }
  };

  const handleUrlSubmit = async (url: string) => {
    setProcessingStatus(`Fetching content from ${url}...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(
        `Webpage Source URL: ${url}\nPlease construct a competitive exam based on the primary subject of this URL.`,
        url
      );
      setEditorInitialData({
        title: `Webpage Exam: ${url.replace('https://', '').slice(0, 30)}`,
        category: 'Web Research',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to process webpage URL.');
    }
  };

  const handleYouTubeSubmit = async (url: string) => {
    setProcessingStatus('Fetching YouTube video concepts & generating MCQs...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(
        `YouTube Video: ${url}\nExtract core educational concepts and build competitive multiple choice questions. Ignore speaker filler words.`,
        'YouTube Lecture'
      );
      setEditorInitialData({
        title: 'YouTube Lecture Mock Test',
        category: 'Video Lecture',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to process YouTube link.');
    }
  };

  const handleCameraCapture = async (base64Data: string) => {
    setProcessingStatus('Scanning page photo with AI Vision...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromBase64File(base64Data, 'image/jpeg', 'Camera Scan');
      setEditorInitialData({
        title: 'Camera Scanned Exam',
        category: 'Physical Exam',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to scan image.');
    }
  };

  const handleVoiceSubmit = async (transcript: string) => {
    setProcessingStatus('Transforming voice lecture into structured questions...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(transcript, 'Voice Notes');
      setEditorInitialData({
        title: 'Voice Dictated Exam',
        category: 'Audio Notes',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to generate questions from voice.');
    }
  };

  const handleJsonSubmit = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const questionsList = Array.isArray(parsed) ? parsed : parsed.questions || [];
      const formatted: Question[] = questionsList.map((q: any, i: number) => ({
        id: `q-${Date.now()}-${i}`,
        questionText: q.questionText || `Question ${i + 1}`,
        options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
        correctAnswerIndex: q.correctAnswerIndex ?? 0,
        topic: q.topic || 'General',
        explanation: q.explanation || '',
      }));

      setEditorInitialData({
        title: parsed.title || 'Imported JSON Exam',
        category: parsed.category || 'Imported',
        questions: formatted,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err) {
      showToast('Invalid JSON structure provided.', 'error');
    }
  };

  // --- Handlers for Test Execution & Results ---

  const handleStartTest = (test: TestHistory) => {
    setActiveTest(test);
    navigateTo('test_player');
  };

  const handleSaveFromEditor = (test: TestHistory, andStart = false) => {
    storage.saveTest(test);
    setTests(storage.getTests());
    showToast(`Test "${test.title}" saved to library.`);
    if (andStart) {
      handleStartTest(test);
    } else {
      navigateTo('home');
    }
  };

  const handleFinishExam = (session: TestSessionState) => {
    setActiveSession(session);

    // Calculate score
    let correct = 0;
    let wrong = 0;
    session.questions.forEach((q, i) => {
      const ans = session.userAnswers[i];
      if (ans !== undefined) {
        if (ans === q.correctAnswerIndex) correct++;
        else wrong++;
      }
    });

    // Record score in storage
    storage.updateTestScore(
      session.testId,
      correct,
      session.questions.length,
      wrong,
      session.elapsedSeconds
    );
    setTests(storage.getTests());
    setStreak(storage.getStreak());

    // If this was an assignment, submit score to classroom
    if (session.assignmentId) {
      storage.submitAssignment(
        session.assignmentId,
        profile.uid,
        correct,
        session.questions.length
      );
      setAssignments(storage.getAssignments());
    }

    navigateTo('results');
  };

  const handleToggleTask = (taskId: string) => {
    const updated = storage.toggleTask(taskId);
    setDailyTasks([...updated]);
  };

  const handleRoleChange = (newRole: UserRole) => {
    storage.setRole(newRole);
    setProfile(storage.getProfile());
    showToast(`Switched active mode to ${newRole}.`, 'info');
  };

  const handleToggleTheme = () => {
    const newTheme: 'dark' | 'light' = settings.theme === 'dark' ? 'light' : 'dark';
    const updated: typeof settings = { ...settings, theme: newTheme };
    storage.saveSettings(updated);
    setSettings(updated);
  };

  const handleResetDemoData = () => {
    storage.resetAppData();
    setTests(storage.getTests());
    setProfile(storage.getProfile());
    setStreak(storage.getStreak());
    setDailyTasks(storage.getDailyTasks());
    setDailyInsight(storage.getDailyInsight());
    setClasses(storage.getClasses());
    setAssignments(storage.getAssignments());
    setMarketplaceExams(storage.getMarketplaceExams());
    setSettings(storage.getSettings());
    navigateTo('home');
    showToast('Mock tests and study data reset successfully.');
  };

  const handleAuthSuccess = (authUser: UserProfile) => {
    storage.saveProfile(authUser);
    setProfile(authUser);
    setIsAuthenticated(true);
    setCurrentRoute('home');
    showToast(`Welcome, ${authUser.fullName || 'Scholar'}!`);
  };

  const handleSignOut = async () => {
    try {
      await supabaseService.signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setIsAuthenticated(false);
    setCurrentRoute('home');
    showToast('Signed out successfully.', 'info');
  };

  // Auth Loading Screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-darkSurface text-surface-text dark:text-darkSurface-text">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white shadow-xl shadow-brand-primary/25 animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-surface-muted dark:text-darkSurface-muted font-medium text-sm">
          <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
          <span>Initializing MOCK.AI...</span>
        </div>
      </div>
    );
  }

  // ── 1. Password Recovery Screen (Priority: User clicked reset password link in email) ──
  if (isPasswordRecoveryMode) {
    return (
      <ForgotPasswordScreen
        forcedMode="update"
        onBackToLogin={() => {
          setIsPasswordRecoveryMode(false);
          if (typeof window !== 'undefined') {
            window.location.hash = '';
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
        onPasswordResetSuccess={() => {
          setIsPasswordRecoveryMode(false);
          if (typeof window !== 'undefined') {
            window.location.hash = '';
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
      />
    );
  }

  // ── 2. Authentication Gate Screen ──────────────────────────────────
  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Determine if top navbar should be visible (hidden during active test for zero distraction)
  const isTakingExam = currentRoute === 'test_player' || currentRoute === 'exam_player';

  return (
    <div className="min-h-screen flex flex-col bg-surface dark:bg-darkSurface text-surface-text dark:text-darkSurface-text transition-colors selection:bg-brand-primary selection:text-white">
      {/* ── Top Responsive Navbar ──────────────────────────────────────── */}
      {!isTakingExam && (
        <Navbar
          currentRoute={currentRoute}
          onNavigate={navigateTo}
          streakCount={streak.currentStreak}
          userRole={profile.role}
          onRoleChange={handleRoleChange}
          isDark={settings.theme === 'dark'}
          onToggleTheme={handleToggleTheme}
          onOpenCreateModal={() => setIsSourceModalOpen(true)}
          userName={profile.fullName}
          onSignOut={handleSignOut}
        />
      )}

      {/* ── Main Screen Viewport ───────────────────────────────────────── */}
      <main className="flex-1">
        {currentRoute === 'home' && (
          <HomeScreen
            tests={tests}
            profile={profile}
            streakCount={streak.currentStreak}
            dailyTasks={dailyTasks}
            dailyInsight={dailyInsight}
            onToggleTask={handleToggleTask}
            onOpenCreateModal={() => setIsSourceModalOpen(true)}
            onStartTest={(test) => handleStartTest(test)}
            onEditTest={(test) => {
              setEditorInitialData({
                id: test.id,
                title: test.title,
                category: test.category,
                questions: test.questions,
                existingTest: test,
              });
              navigateTo('editor');
            }}
            onDeleteTest={(id) => {
              storage.deleteTest(id);
              setTests(storage.getTests());
              showToast('Test deleted from library.', 'info');
            }}
          />
        )}

        {currentRoute === 'explore' && (
          <ExploreScreen
            onSelectExam={(examId) => {
              setSelectedExamId(examId);
              navigateTo('explore_exam');
            }}
          />
        )}

        {currentRoute === 'explore_exam' && (
          <ExamDetailScreen
            examId={selectedExamId}
            onBack={() => navigateTo('explore')}
            onStartPaper={(paper) => {
              setActiveExamPaper(paper);
              navigateTo('exam_player');
            }}
          />
        )}

        {currentRoute === 'exam_player' && activeExamPaper && (
          <CompetitiveExamPlayerScreen
            paper={activeExamPaper}
            onExit={() => navigateTo('explore_exam')}
            onSubmit={(completedSession) => {
              setActiveExamSession(completedSession);
              navigateTo('exam_results');
            }}
          />
        )}

        {currentRoute === 'exam_results' && activeExamSession && activeExamPaper && (
          <CompetitiveExamResultsScreen
            session={activeExamSession}
            paper={activeExamPaper}
            onRetake={() => navigateTo('exam_player')}
            onExplore={() => navigateTo('explore')}
          />
        )}

        {currentRoute === 'processing' && (
          <ProcessingScreen
            statusMessage={processingStatus}
            error={processingError}
            onCancel={navigateBack}
          />
        )}

        {currentRoute === 'editor' && (
          <EditorScreen
            initialTestId={editorInitialData.id}
            initialTitle={editorInitialData.title}
            initialCategory={editorInitialData.category}
            initialQuestions={editorInitialData.questions}
            existingTest={editorInitialData.existingTest}
            onBack={navigateBack}
            onSave={handleSaveFromEditor}
            onAiFixAll={(qs) => aiService.fixQuestions(qs)}
          />
        )}

        {currentRoute === 'test_player' && activeTest && (
          <TestPlayerScreen
            testId={activeTest.id}
            title={activeTest.title}
            category={activeTest.category}
            questions={activeTest.questions}
            timerDurationSeconds={Math.max(activeTest.questions.length * (settings.timerSeconds || 60), 300)}
            onExit={navigateBack}
            onSubmit={handleFinishExam}
          />
        )}

        {currentRoute === 'results' && activeSession && (
          <ResultsScreen
            session={activeSession}
            onReview={() => navigateTo('review')}
            onRetake={() => {
              if (activeTest) handleStartTest(activeTest);
            }}
            onHome={() => navigateTo('home')}
          />
        )}

        {currentRoute === 'review' && activeSession && (
          <ReviewScreen session={activeSession} onBack={navigateBack} />
        )}

        {currentRoute === 'analytics' && (
          <AnalyticsScreen
            tests={tests}
            streakCount={streak.currentStreak}
            onPracticeTopic={(topic) => handleTopicSubmit(topic, 'MEDIUM', 5)}
          />
        )}

        {currentRoute === 'classroom' && (
          <ClassroomScreen
            profile={profile}
            classes={classes}
            assignments={assignments}
            tests={tests}
            onCreateClass={(name) => {
              storage.createClass(name, profile.uid, profile.fullName);
              setClasses(storage.getClasses());
              showToast(`Class "${name}" created successfully.`);
            }}
            onJoinClass={(code) => {
              const res = storage.joinClass(code, profile.uid, profile.fullName);
              showToast(res.message, res.success ? 'success' : 'error');
              setClasses(storage.getClasses());
            }}
            onCreateAssignment={(classId, testId, dueDate) => {
              const targetTest = tests.find((t) => t.id === testId);
              if (targetTest) {
                storage.createAssignment(
                  classId,
                  targetTest.title,
                  targetTest.questions,
                  dueDate,
                  profile.uid,
                  profile.fullName
                );
                setAssignments(storage.getAssignments());
                showToast(`Exam assigned to class successfully!`);
              }
            }}
            onTakeAssignment={(asg) => {
              const mockTest: TestHistory = {
                id: asg.assignmentId,
                title: asg.testTitle,
                category: asg.className,
                questions: asg.questions,
                createdAt: asg.assignedAt,
                lastTakenAt: null,
                bestScore: null,
                bestScorePercent: null,
                bestTotal: asg.questions.length,
              };
              setActiveTest(mockTest);
              navigateTo('test_player');
            }}
          />
        )}

        {currentRoute === 'marketplace' && (
          <MarketplaceScreen
            exams={marketplaceExams}
            myTests={tests}
            profile={profile}
            onPublishExam={(newExam) => {
              storage.publishExam(newExam);
              setMarketplaceExams(storage.getMarketplaceExams());
              showToast(`"${newExam.title}" published to community marketplace!`);
            }}
            onTakeExam={(exam) => {
              const mockTest: TestHistory = {
                id: `copy-${exam.id}`,
                title: exam.title,
                category: exam.subject,
                questions: exam.questions,
                createdAt: Date.now(),
                lastTakenAt: null,
                bestScore: null,
                bestScorePercent: null,
                bestTotal: exam.questions.length,
              };
              storage.saveTest(mockTest);
              setTests(storage.getTests());
              handleStartTest(mockTest);
            }}
          />
        )}

        {currentRoute === 'profile' && (
          <ProfileScreen
            profile={profile}
            tests={tests}
            streakCount={streak.currentStreak}
            onRoleChange={handleRoleChange}
            onNavigateSettings={() => navigateTo('settings')}
            onSignOut={handleSignOut}
          />
        )}

        {currentRoute === 'settings' && (
          <SettingsScreen
            settings={settings}
            onUpdateSettings={(updated) => {
              storage.saveSettings(updated);
              setSettings(updated);
              showToast('Settings saved successfully.');
            }}
            tests={tests}
            onBack={navigateBack}
            onResetData={handleResetDemoData}
          />
        )}
      </main>

      {/* ── Adaptive Mobile Bottom Navigation ─────────────────────────── */}
      {!isTakingExam && (
        <BottomNav
          currentRoute={currentRoute}
          onNavigate={navigateTo}
        />
      )}

      {/* ── Elegant Floating Toast Notification ───────────────────────── */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-darkSurface-elev2 text-white border border-darkSurface-border shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-200">
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-brand-green shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-brand-red shrink-0" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-brand-primary shrink-0" />}
          <span className="text-xs sm:text-sm font-semibold pr-2">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-lg text-surface-muted hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Ingestion & Action Modals ─────────────────────────────────── */}
      <SourceSelectorModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        onSelectSource={handleSelectSource}
      />

      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      <VoiceModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSubmitText={handleVoiceSubmit}
      />

      <TopicModal
        isOpen={isTopicModalOpen}
        onClose={() => setIsTopicModalOpen(false)}
        onSubmit={handleTopicSubmit}
      />

      <UrlModal
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        onSubmit={handleUrlSubmit}
      />

      <YouTubeModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        onSubmit={handleYouTubeSubmit}
      />

      <JsonModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        onSubmit={handleJsonSubmit}
      />
    </div>
  );
};
