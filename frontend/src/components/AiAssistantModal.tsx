import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, ArrowRight, ShieldAlert, PieChart, Copy, CheckCircle2 } from 'lucide-react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWork?: (workId: string) => void;
  onNavigateTab?: (tab: string) => void;
  totalWorks: number;
  highRiskWorks: number;
  financialOutlierWorks: number;
  duplicateCandidates: number;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: Array<{ label: string; action: () => void }>;
  suggestedWorks?: Array<{ id: string; title: string; risk: number; state: string }>;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  onSelectWork,
  onNavigateTab,
  totalWorks,
  highRiskWorks,
  financialOutlierWorks,
  duplicateCandidates,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      text: `Hello! I am your MPLADS InsightGrid Copilot. I analyze real-time expenditure data, physical-financial progress gaps, duplicate work candidates, and compliance evidence gaps across ${totalWorks ? totalWorks.toLocaleString() : 'the current'} works.\n\nHow can I assist your review today?`,
      timestamp: 'Just now',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!totalWorks) return;
    setMessages((previous) => {
      if (previous.length !== 1 || previous[0].id !== '1') return previous;
      return [{ ...previous[0], text: `Hello! I am your MPLADS InsightGrid Copilot. I analyze real-time expenditure data, physical-financial progress gaps, duplicate work candidates, and compliance evidence gaps across ${totalWorks.toLocaleString()} works.\n\nHow can I assist your review today?` }];
    });
  }, [totalWorks]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const quickPrompts = [
    {
      label: 'Show High Risk Works (>75 Score)',
      query: 'Show works with critical composite risk scores requiring immediate audit',
      handler: () => {
        handleSendMessage('Show top works with high composite risk score (>75)');
      },
    },
    {
      label: 'Financial Anomaly Works',
      query: 'List works with severe physical-financial disbursal mismatches',
      handler: () => {
        handleSendMessage('Find works with severe disbursal mismatch vs physical progress');
      },
    },
    {
      label: 'Candidate Duplicate Works',
      query: 'Show suspicious duplicate work recommendations in Uttar Pradesh',
      handler: () => {
        handleSendMessage('Show candidate duplicate works in Uttar Pradesh and Bihar');
      },
    },
  ];

  const handleSendMessage = (customText?: string) => {
    const textToSend = customText || inputQuery;
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputQuery('');

    // Generate intelligent AI Response based on query
    setTimeout(() => {
      let aiText = '';
      let works: Array<{ id: string; title: string; risk: number; state: string }> = [];
      let actions: Array<{ label: string; action: () => void }> = [];

      const queryLower = textToSend.toLowerCase();

      if (queryLower.includes('high risk') || queryLower.includes('critical') || queryLower.includes('composite')) {
        aiText = `The latest ML Risk Model identifies **${highRiskWorks.toLocaleString()} review-priority works** out of **${totalWorks.toLocaleString()}** total works. Open the live queue to inspect the highest-priority records:`;
        actions = [
          {
            label: 'Go to Risk Intelligence Monitor',
            action: () => {
              onNavigateTab?.('risk-monitor');
              onClose();
            },
          },
        ];
      } else if (queryLower.includes('financial') || queryLower.includes('disbursal') || queryLower.includes('mismatch')) {
        aiText = `The live financial model currently flags **${financialOutlierWorks.toLocaleString()} works** for financial anomaly review. Open Financial Anomaly Analytics to inspect the current records and evidence.`;
        actions = [
          {
            label: 'Open Financial Anomaly Analytics',
            action: () => {
              onNavigateTab?.('financial-analytics');
              onClose();
            },
          },
        ];
      } else if (queryLower.includes('duplicate') || queryLower.includes('candidate')) {
        aiText = `The live duplicate engine currently contains **${duplicateCandidates.toLocaleString()} candidate pairs** after semantic similarity and identity checks. Open Candidate Duplicate Inspector for record-level review.`;
        actions = [
          {
            label: 'Launch Candidate Duplicate Inspector',
            action: () => {
              onNavigateTab?.('duplicate-inspector');
              onClose();
            },
          },
        ];
      } else {
        aiText = `I have analyzed your query regarding "${textToSend}".\n\nMPLADS InsightGrid evaluates works across 4 key dimensions:\n1. Composite Multi-Signal Risk Score\n2. Financial Disbursal Anomaly Model\n3. Candidate Duplicate Vector Matching\n4. Compliance & Utilization Certificate Evidence Gaps.`;
        actions = [
          {
            label: 'Explore Executive Dashboard',
            action: () => {
              onNavigateTab?.('overview');
              onClose();
            },
          },
        ];
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedWorks: works,
        actions: actions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col h-[650px] max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-400 dark:text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">MPLADS InsightGrid Copilot</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live DSS Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Decision Support Assistant for Works & Expenditure Audit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={p.handler}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shrink-0 transition-colors shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30 dark:bg-slate-900/30">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shrink-0 text-xs shadow-2xs">
                  <Bot className="w-4 h-4 text-amber-400 dark:text-amber-600" />
                </div>
              )}

              <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-slate-900 text-white font-medium rounded-tr-none shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-2xs'
                  }`}
                >
                  {msg.text}

                  {/* Render Suggested Works if present */}
                  {msg.suggestedWorks && msg.suggestedWorks.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2.5">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Recommended Works to Inspect:
                      </div>
                      {msg.suggestedWorks.map((work) => (
                        <div
                          key={work.id}
                          onClick={() => {
                            if (onSelectWork) {
                              onSelectWork(work.id);
                              onClose();
                            }
                          }}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer flex items-center justify-between transition-all group"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-xs group-hover:underline">
                              {work.title}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              ID: {work.id} • {work.state}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Risk: {work.risk}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render Action Buttons if present */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 pt-1">
                      {msg.actions.map((act, i) => (
                        <button
                          key={i}
                          onClick={act.action}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <span>{act.label}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-medium px-1">
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask AI Risk Assistant about works or financial anomalies..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim()}
              className="px-4 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 disabled:opacity-40 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 dark:hover:bg-white transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
