import React, { useState } from 'react';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  Bookmark,
  HelpCircle,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { TopicProgressSummary, UNCATEGORIZED_TOPIC_ID } from '../../services/taxonomy/topicClassifier';

export interface TopicNavigationMenuProps {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  topicSummaries: TopicProgressSummary[];
  allTotal: number;
  allAttempted: number;
  allReview: number;
  onJumpToFirstInTopic?: (topicId: string) => void;
  className?: string;
  isCompact?: boolean;
}

export const TopicNavigationMenu: React.FC<TopicNavigationMenuProps> = ({
  selectedTopicId,
  onSelectTopic,
  topicSummaries,
  allTotal,
  allAttempted,
  allReview,
  onJumpToFirstInTopic,
  className = '',
  isCompact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const activeTopic = topicSummaries.find((t) => t.topicId === selectedTopicId);

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden transition-all duration-200 ${className}`}
      data-testid="topic-navigation-menu"
    >
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Topic Menu
              </span>
              {selectedTopicId && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                  Filtered
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {topicSummaries.length} {topicSummaries.length === 1 ? 'Topic' : 'Topics'} Available
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {selectedTopicId && (
            <button
              onClick={() => onSelectTopic(null)}
              className="p-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors flex items-center gap-1"
              title="Clear topic filter"
              aria-label="Clear topic filter"
            >
              <X className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Clear</span>
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
            aria-label={isExpanded ? 'Collapse topic menu' : 'Expand topic menu'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-3 space-y-2.5">
          {/* All Topics Master Button */}
          <button
            onClick={() => onSelectTopic(null)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              selectedTopicId === null
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
            data-testid="all-topics-btn"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 opacity-80" />
              <span>All Topics</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={selectedTopicId === null ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}>
                {allTotal} Qs
              </span>
              <span className="opacity-40">•</span>
              <span className={selectedTopicId === null ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
                {allAttempted} Done
              </span>
              {allReview > 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <span className={selectedTopicId === null ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                    {allReview} Rev
                  </span>
                </>
              )}
            </div>
          </button>

          {/* Topics Grid / List */}
          <div
            className={`space-y-1.5 overflow-y-auto pr-0.5 custom-scrollbar ${
              isCompact ? 'max-h-44' : 'max-h-56'
            }`}
          >
            {topicSummaries.map((topic) => {
              const isSelected = selectedTopicId === topic.topicId;
              const isUncategorized = topic.topicId === UNCATEGORIZED_TOPIC_ID;

              return (
                <div
                  key={topic.topicId}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 dark:border-indigo-500 shadow-xs'
                      : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                  }`}
                >
                  <button
                    onClick={() => onSelectTopic(isSelected ? null : topic.topicId)}
                    className="w-full text-left px-2.5 py-2 flex items-start justify-between gap-2"
                    data-testid={`topic-item-${topic.topicId}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold truncate ${
                            isSelected
                              ? 'text-indigo-950 dark:text-indigo-200'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {topic.topicName}
                        </span>
                        {isUncategorized && (
                          <span title="Pending detailed syllabus classification">
                            <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
                          </span>
                        )}
                      </div>

                      {/* Topic Progress Badges (Attempted only, isolation compliant) */}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {topic.totalQuestions} Qs
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          {topic.attemptedQuestions}
                        </span>
                        {topic.reviewQuestions > 0 && (
                          <>
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                              <Bookmark className="w-3 h-3" />
                              {topic.reviewQuestions}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 mt-0.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {topic.totalQuestions}
                      </span>
                    </div>
                  </button>

                  {/* Actions for Selected Topic */}
                  {isSelected && onJumpToFirstInTopic && topic.questionIndices.length > 0 && (
                    <div className="px-2.5 pb-2 pt-0.5 flex items-center justify-between border-t border-indigo-100 dark:border-indigo-900/50 mt-1">
                      <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium">
                        Q#{topic.questionNumbers[0]} is first in topic
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToFirstInTopic(topic.topicId);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 shadow-2xs hover:shadow-xs transition-all"
                      >
                        <span>Jump to Q{topic.questionNumbers[0]}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Filter Summary Banner */}
          {activeTopic && (
            <div className="p-2 bg-indigo-50/90 dark:bg-indigo-950/60 rounded-lg border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-between text-xs">
              <div className="truncate">
                <span className="text-slate-600 dark:text-slate-400">Emphasizing: </span>
                <span className="font-bold text-indigo-900 dark:text-indigo-200">{activeTopic.topicName}</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold ml-1">
                  ({activeTopic.questionNumbers.length} Qs)
                </span>
              </div>
              <button
                onClick={() => onSelectTopic(null)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 ml-2"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
