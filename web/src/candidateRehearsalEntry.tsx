import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';

import { CompetitiveExamPlayerScreen } from './screens/CompetitiveExamPlayerScreen';
import { CompetitiveExamResultsScreen } from './screens/CompetitiveExamResultsScreen';
import { HttpCandidateDeliveryAdapter } from './services/uadue/delivery/httpCandidateDeliveryAdapter';
import { CandidateApiClient } from './services/uadue/delivery/candidateApiClient';
import { ExamPresentationPaper, ExamTestSession } from './types';

declare global {
  interface Window {
    __REHEARSAL_CONFIG__?: {
      gatewayUrl: string;
      token: string;
      tenantId: string;
      candidateId: string;
      paper: ExamPresentationPaper;
      initialSessionId?: string;
    };
    __REHEARSAL_READY__?: boolean;
    __REHEARSAL_CLIENT__?: CandidateApiClient;
    __REHEARSAL_SUBMITTED_SESSION__?: ExamTestSession | null;
  }
}

const RehearsalApp: React.FC = () => {
  const [config, setConfig] = useState(window.__REHEARSAL_CONFIG__);
  const [client, setClient] = useState<CandidateApiClient | null>(null);
  const [submittedSession, setSubmittedSession] = useState<ExamTestSession | null>(null);

  useEffect(() => {
    // If config was injected before mount or is injected dynamically
    const interval = setInterval(() => {
      if (window.__REHEARSAL_CONFIG__ && !config) {
        setConfig(window.__REHEARSAL_CONFIG__);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [config]);

  useEffect(() => {
    if (!config) return;

    const adapter = new HttpCandidateDeliveryAdapter({
      baseUrl: config.gatewayUrl,
      getAuthToken: async () => config.token,
    });

    const candidateClient = new CandidateApiClient({
      api: adapter,
      tenantId: config.tenantId,
      candidateId: config.candidateId,
    });

    setClient(candidateClient);
    window.__REHEARSAL_CLIENT__ = candidateClient;
    window.__REHEARSAL_READY__ = true;
  }, [config]);

  if (!config || !client) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Phase 3.6T Candidate UI Rehearsal</h1>
          <p className="text-gray-400">Awaiting test configuration...</p>
        </div>
      </div>
    );
  }

  if (submittedSession) {
    return (
      <div id="rehearsal-results-container">
        <CompetitiveExamResultsScreen
          session={submittedSession}
          paper={config.paper as any}
          onRetake={() => {}}
          onExplore={() => {}}
        />
      </div>
    );
  }

  return (
    <div id="rehearsal-player-container">
      <CompetitiveExamPlayerScreen
        paper={config.paper}
        userId={config.candidateId}
        user={{ uid: config.candidateId, name: 'Rehearsal Candidate', email: 'rehearsal@mockai.test' } as any}
        deliveryApiClient={client}
        onExit={() => {}}
        onSubmit={(session) => {
          setSubmittedSession(session);
          window.__REHEARSAL_SUBMITTED_SESSION__ = session;
        }}
      />
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<RehearsalApp />);
}
