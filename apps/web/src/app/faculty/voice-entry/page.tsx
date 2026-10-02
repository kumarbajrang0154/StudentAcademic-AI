"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Mic,
  Play,
  Trash2,
  Save,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  ExternalLink,
  Loader2,
  RotateCcw,
} from "lucide-react";

interface ParsedEntry {
  rollNumber: string;
  studentId?: string;
  name?: string;
  status?: "PRESENT" | "ABSENT" | "ON_DUTY" | "MEDICAL_LEAVE";
  score?: number;
  confidence: number;
  issues: string[];
}

interface VoiceParseResponse {
  entries: ParsedEntry[];
  unresolvedTokens: string[];
  summary: {
    totalParsed: number;
    presentCount?: number;
    absentCount?: number;
    onDutyCount?: number;
    medicalLeaveCount?: number;
    scoresCount?: number;
    errorCount: number;
    unresolvedCount: number;
  };
}

interface CourseOption {
  id: string;
  code: string;
  name: string;
}

interface AssessmentOption {
  id: string;
  title: string;
  maxScore: number;
  weight: number;
}

interface SpeechRecognitionEvent {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

function VoiceEntryContent() {
  const searchParams = useSearchParams();
  const initialCourseId = searchParams.get("courseId") || "";
  const initialMode = (searchParams.get("mode") as "ATTENDANCE" | "MARKS") || "ATTENDANCE";

  const todayStr = new Date().toISOString().slice(0, 10);
  const [courseId, setCourseId] = useState<string>(initialCourseId);
  const [sessionDate, setSessionDate] = useState<string>(todayStr);
  const [mode, setMode] = useState<"ATTENDANCE" | "MARKS">(initialMode);
  const [assessmentId, setAssessmentId] = useState<string>("");

  // Speech Recognition state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [transcript, setTranscript] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Staging grid
  const [stagedEntries, setStagedEntries] = useState<ParsedEntry[]>([]);
  const [unresolvedTokens, setUnresolvedTokens] = useState<string[]>([]);
  const [justification, setJustification] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Audio / Speech refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 1. Fetch available courses
  const { data: coursesData } = useQuery({
    queryKey: ["faculty-courses"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/faculty/courses");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.courses || []) as CourseOption[];
    },
  });

  // Set default courseId if not provided
  useEffect(() => {
    if (!courseId && coursesData && coursesData.length > 0) {
      setCourseId(coursesData[0]!.id);
    }
  }, [coursesData, courseId]);

  // 2. Fetch assessments if in MARKS mode
  const { data: assessmentsData } = useQuery({
    queryKey: ["course-assessments", courseId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/faculty/courses/${courseId}/gradebook`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.assessments || []) as AssessmentOption[];
    },
    enabled: Boolean(courseId && mode === "MARKS"),
  });

  useEffect(() => {
    if (mode === "MARKS" && assessmentsData && assessmentsData.length > 0 && !assessmentId) {
      setAssessmentId(assessmentsData[0]!.id);
    }
  }, [mode, assessmentsData, assessmentId]);

  // 3. Check browser support for Web Speech API
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // Save to localStorage safety net
  useEffect(() => {
    try {
      if (stagedEntries.length > 0) {
        localStorage.setItem(
          "voice_entry_staged_backup",
          JSON.stringify({ courseId, mode, sessionDate, entries: stagedEntries }),
        );
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [stagedEntries, courseId, mode, sessionDate]);

  // Parse transcript via backend wrapper
  const parseTranscript = useCallback(
    async (textToParse: string) => {
      if (!textToParse.trim() || !courseId) return;
      setIsProcessing(true);

      const activeAssessment = assessmentsData?.find((a) => a.id === assessmentId);
      const maxScore = activeAssessment?.maxScore || 100;

      try {
        const res = await apiFetch("/api/v1/faculty/voice/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: textToParse,
            courseId,
            mode,
            speechConfidence: 0.95,
            maxScore,
          }),
        });

        if (res.ok) {
          const result = (await res.json()) as VoiceParseResponse;
          setStagedEntries(result.entries || []);
          setUnresolvedTokens(result.unresolvedTokens || []);
        }
      } catch (err) {
        console.error("Parse error:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    [courseId, mode, assessmentId, assessmentsData],
  );

  // Audio Visualizer loop
  const startAudioVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtxConstructor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxConstructor) return;
      const audioCtx = new AudioCtxConstructor();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]!;
        }
        const avg = sum / bufferLength;
        setAudioLevel(Math.min(avg / 128, 1)); // 0 to 1
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn("Could not start audio visualizer", err);
    }
  };

  const stopAudioVisualizer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  // Toggle Microphone
  const toggleListening = () => {
    if (isListening) {
      // Stop
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      stopAudioVisualizer();
      setIsListening(false);
    } else {
      // Start
      const SpeechRecognition = getSpeechRecognition();

      if (!SpeechRecognition) {
        setIsSupported(false);
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        recognition.onstart = () => {
          setIsListening(true);
          startAudioVisualizer();
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let currentTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i]![0]!.transcript + " ";
          }
          setTranscript(currentTranscript.trim());
          parseTranscript(currentTranscript.trim());
        };

        recognition.onerror = (e: unknown) => {
          console.error("Speech recognition error:", e);
          setIsListening(false);
          stopAudioVisualizer();
        };

        recognition.onend = () => {
          setIsListening(false);
          stopAudioVisualizer();
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        console.error("Failed to start speech recognition", err);
        setIsListening(false);
        stopAudioVisualizer();
      }
    }
  };

  // Play Demo Transcript
  const handlePlayDemo = () => {
    let demoText = "";
    if (mode === "ATTENDANCE") {
      demoText =
        "Roll number 1 to 20 present except 5 and 9. 21 to 35 present. 36 on duty, 37 medical leave, 38 to 40 absent.";
    } else {
      demoText =
        "Roll 1, 18 marks. Roll 2, 19 marks. Roll 3, 20 out of 20. Roll 4, 16 marks. Roll 5, 17 marks.";
    }
    setTranscript(demoText);
    parseTranscript(demoText);
    setToastMessage({ type: "success", text: "Demo transcript loaded and parsed!" });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Commit mutation (calls batch attendance or batch marks)
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (stagedEntries.length === 0) throw new Error("No staged entries to commit");

      if (mode === "ATTENDANCE") {
        const entries = stagedEntries
          .filter((e) => e.studentId && e.status)
          .map((e) => ({
            studentId: e.studentId!,
            status: e.status!,
          }));

        const res = await apiFetch("/api/v1/attendance/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            sessionDate,
            entries,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          const err = JSON.parse(text);
          throw new Error(err.message || "Failed to commit attendance batch");
        }
        return res.json();
      } else {
        if (!assessmentId) throw new Error("Please select an assessment to grade");
        const entries = stagedEntries
          .filter((e) => e.studentId && e.score !== undefined)
          .map((e) => ({
            studentId: e.studentId!,
            score: e.score!,
          }));

        const res = await apiFetch("/api/v1/marks/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assessmentId,
            entries,
            justification: justification.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          const err = JSON.parse(text);
          throw new Error(err.message || "Failed to commit marks batch");
        }
        return res.json();
      }
    },
    onSuccess: (data) => {
      setToastMessage({
        type: "success",
        text: `Committed successfully! ${data.processed || stagedEntries.length} entries persisted.`,
      });
      setStagedEntries([]);
      setTranscript("");
      setUnresolvedTokens([]);
      setTimeout(() => setToastMessage(null), 4500);
    },
    onError: (err: Error) => {
      setToastMessage({ type: "error", text: err.message });
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  // Keyboard shortcut: Cmd/Ctrl + Enter = Commit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        commitMutation.mutate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitMutation]);

  // Compute live staging summary
  let presentCount = 0;
  let absentCount = 0;
  let onDutyCount = 0;
  let medicalCount = 0;
  let errorCount = 0;

  for (const entry of stagedEntries) {
    if (entry.issues && entry.issues.length > 0) errorCount++;
    if (entry.status === "PRESENT") presentCount++;
    else if (entry.status === "ABSENT") absentCount++;
    else if (entry.status === "ON_DUTY") onDutyCount++;
    else if (entry.status === "MEDICAL_LEAVE") medicalCount++;
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              SCR-03
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              AI Voice Entry Studio
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Hands-free continuous voice logging for attendance and assessment marks.
          </p>
        </div>

        {/* Action Link to manual grid */}
        <div className="flex items-center gap-2">
          {courseId && (
            <Link
              href={
                mode === "ATTENDANCE"
                  ? `/faculty/courses/${courseId}/attendance-grid`
                  : `/faculty/courses/${courseId}/gradebook`
              }
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700/80 flex items-center gap-1.5"
            >
              <span>Open Manual Grid</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Safety Net: Unsupported Browser Notice */}
      {!isSupported && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Browser Notice</p>
            <p className="text-slate-300">
              Speech recognition requires Google Chrome or Chromium-based browsers. You can use the
              transcript text box below to type or paste notes directly.
            </p>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 transition ${
            toastMessage.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Configuration Controls Bar */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Course Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Course
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          >
            {coursesData?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mode Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Entry Mode
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setMode("ATTENDANCE")}
              className={`py-1 rounded-lg text-xs font-semibold transition ${
                mode === "ATTENDANCE"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Attendance
            </button>
            <button
              type="button"
              onClick={() => setMode("MARKS")}
              className={`py-1 rounded-lg text-xs font-semibold transition ${
                mode === "MARKS"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Marks
            </button>
          </div>
        </div>

        {/* Date Selector (Attendance) OR Assessment (Marks) */}
        {mode === "ATTENDANCE" ? (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Session Date
            </label>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="bg-transparent text-white focus:outline-none w-full cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Target Assessment
            </label>
            <select
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              {assessmentsData?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} (Max: {a.maxScore})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Demo Button */}
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={handlePlayDemo}
            className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-xs font-semibold text-indigo-300 hover:text-white transition flex items-center justify-center gap-2 shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400" />
            <span>Play Demo Transcript</span>
          </button>
        </div>
      </div>

      {/* Mic Station & Audio Visualizer Ring */}
      <div className="p-8 bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 rounded-3xl flex flex-col items-center justify-center space-y-6 relative overflow-hidden shadow-2xl">
        {/* Pulsing rings driven by Web Audio Analyser volume */}
        <div className="relative flex items-center justify-center my-2">
          {isListening && (
            <>
              <div
                className="absolute rounded-full bg-indigo-500/20 pointer-events-none transition-transform duration-75"
                style={{
                  width: `${110 + audioLevel * 70}px`,
                  height: `${110 + audioLevel * 70}px`,
                  opacity: 0.3 + audioLevel * 0.5,
                }}
              />
              <div
                className="absolute rounded-full bg-indigo-500/30 pointer-events-none animate-ping"
                style={{ width: "95px", height: "95px" }}
              />
            </>
          )}

          {/* 80px Microphone Button */}
          <button
            type="button"
            onClick={toggleListening}
            title={isListening ? "Stop listening" : "Start voice recognition"}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition shadow-2xl z-10 ${
              isListening
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 ring-4 ring-rose-500/30"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-105"
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : isListening ? (
              <Mic className="w-8 h-8 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>

        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening ? "bg-rose-500 animate-ping" : "bg-slate-600"
              }`}
            />
            <span className="text-sm font-bold text-white tracking-tight">
              {isListening ? "Listening continuously (en-IN)..." : "Click Microphone to Begin Speaking"}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {mode === "ATTENDANCE"
              ? 'Try: "Roll number 1 to 20 present except 5. 21 to 30 present."'
              : 'Try: "Roll 1, 18 marks. Roll 2, 19 marks."'}
          </p>
        </div>

        {/* Live Transcript Tape & Manual Text Paste Box */}
        <div className="w-full max-w-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Live Transcript & Paste Box:</span>
            {transcript && (
              <button
                type="button"
                onClick={() => {
                  setTranscript("");
                  setStagedEntries([]);
                  setUnresolvedTokens([]);
                }}
                className="text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
          <textarea
            rows={3}
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              parseTranscript(e.target.value);
            }}
            placeholder="Type or paste transcript here, or speak through the microphone..."
            className="w-full p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
          />
        </div>
      </div>

      {/* Unresolved Tokens Warning */}
      {unresolvedTokens.length > 0 && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs space-y-1">
          <div className="flex items-center gap-2 text-rose-400 font-bold">
            <AlertOctagon className="w-4 h-4" />
            <span>Unresolved Spoken Numbers:</span>
          </div>
          <p className="text-slate-300">
            The following numbers could not be matched to any enrolled student in this roster:{" "}
            <span className="font-mono font-bold text-rose-300">
              {unresolvedTokens.join(", ")}
            </span>
          </p>
        </div>
      )}

      {/* Staging Grid */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Staging Table</h3>
            <span className="text-xs text-slate-400 font-medium">
              ({stagedEntries.length} parsed items)
            </span>
          </div>

          {stagedEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setStagedEntries([])}
              className="text-xs text-slate-400 hover:text-rose-400 transition flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard Staging</span>
            </button>
          )}
        </div>

        {stagedEntries.length === 0 ? (
          <div className="p-12 text-center">
            <Mic className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium text-slate-400">No voice entries staged yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click the mic or click "Play Demo Transcript" above to simulate voice recognition.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-4 w-28">Roll No</th>
                  <th className="py-2.5 px-4">Student Name</th>
                  <th className="py-2.5 px-4 text-center">
                    {mode === "ATTENDANCE" ? "Status" : "Score"}
                  </th>
                  <th className="py-2.5 px-4 text-center w-28">Confidence</th>
                  <th className="py-2.5 px-4 text-center w-36">Issues</th>
                  <th className="py-2.5 px-4 text-right w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
                {stagedEntries.map((entry, idx) => {
                  const isLowConfidence = entry.confidence < 0.85;
                  const hasIssues = entry.issues && entry.issues.length > 0;

                  return (
                    <tr
                      key={idx}
                      className={`transition ${
                        hasIssues
                          ? "bg-rose-500/10 hover:bg-rose-500/15"
                          : isLowConfidence
                          ? "bg-amber-500/10 hover:bg-amber-500/15"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-200">
                        {entry.rollNumber}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-white">
                        {entry.name || "Student"}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {mode === "ATTENDANCE" ? (
                          <select
                            value={entry.status}
                            onChange={(e) => {
                              const updated = [...stagedEntries];
                              updated[idx]!.status = e.target.value as
                                | "PRESENT"
                                | "ABSENT"
                                | "ON_DUTY"
                                | "MEDICAL_LEAVE";
                              setStagedEntries(updated);
                            }}
                            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 focus:outline-none"
                          >
                            <option value="PRESENT">PRESENT</option>
                            <option value="ABSENT">ABSENT</option>
                            <option value="ON_DUTY">ON DUTY</option>
                            <option value="MEDICAL_LEAVE">MEDICAL LEAVE</option>
                          </select>
                        ) : (
                          <input
                            type="number"
                            value={entry.score !== undefined ? entry.score : ""}
                            onChange={(e) => {
                              const updated = [...stagedEntries];
                              updated[idx]!.score = parseFloat(e.target.value) || 0;
                              setStagedEntries(updated);
                            }}
                            className="w-20 px-2 py-1 text-center bg-slate-950 border border-slate-700 rounded-lg font-mono text-xs font-bold text-slate-200 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-xs">
                        <span
                          className={`font-semibold ${
                            entry.confidence >= 0.85 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {Math.round(entry.confidence * 100)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {entry.issues && entry.issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {entry.issues.map((issue, iIdx) => (
                              <span
                                key={iIdx}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              >
                                {issue}
                              </span>
                            ))}
                          </div>
                        ) : isLowConfidence ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            LOW_CONFIDENCE
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = stagedEntries.filter((_, i) => i !== idx);
                            setStagedEntries(updated);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Summary & Commit */}
        {stagedEntries.length > 0 && (
          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-slate-400 font-mono">
              {mode === "ATTENDANCE" ? (
                <>
                  <span className="text-emerald-400 font-semibold">{presentCount} Present</span>
                  <span>•</span>
                  <span className="text-rose-400 font-semibold">{absentCount} Absent</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-semibold">{onDutyCount} OD</span>
                  <span>•</span>
                  <span className="text-amber-400 font-semibold">{medicalCount} Medical</span>
                </>
              ) : (
                <span className="text-emerald-400 font-semibold">{stagedEntries.length} Graded</span>
              )}
              {errorCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-400 font-bold">{errorCount} Errors</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {mode === "MARKS" && (
                <input
                  type="text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Justification (if modifying)..."
                  className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
              <button
                type="button"
                onClick={() => setStagedEntries([])}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending || stagedEntries.length === 0}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5"
              >
                {commitMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Commit Batch (Ctrl+Enter)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VoiceEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
        </div>
      }
    >
      <VoiceEntryContent />
    </Suspense>
  );
}
