
import { useState, useEffect, useRef } from "react";
import "./App.css";
import { api } from "./api/client";
import { getAudioDurationSeconds } from "./lib/audioDuration";
import { INITIAL_NOTES } from "./data/initialNotes";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import FlowBreadcrumbs from "./components/FlowBreadcrumbs";
import NoteDetailModal from "./components/NoteDetailModal";
import ProfileModal from "./components/ProfileModal";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RecordVoicePage from "./pages/RecordVoicePage";
import UploadAudioPage from "./pages/UploadAudioPage";
import ProcessingPage from "./pages/ProcessingPage";
import TranscriptPage from "./pages/TranscriptPage";
import GenerateSummaryPage from "./pages/GenerateSummaryPage";
import SummaryTranscriptPage from "./pages/SummaryTranscriptPage";
import SavedNotesPage from "./pages/SavedNotesPage";
import AudioPlayerPage from "./pagess/AudioPlayerPage";

const loadStoredValue = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Storage error for ${key}:`, error);
    return fallback;
  }
};

const loadStoredString = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const loadSavedNotes = () => {
  const notes = loadStoredValue("voicemind_saved_notes", INITIAL_NOTES);
  return Array.isArray(notes) ? notes : INITIAL_NOTES;
};

const formatDuration = (seconds) => {
  const roundedSeconds = Math.round(seconds);
  return `${String(Math.floor(roundedSeconds / 60)).padStart(2, "0")}:${String(
    roundedSeconds % 60
  ).padStart(2, "0")}`;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [currentUser, setCurrentUser] = useState(() =>
    loadStoredValue("voicemind_user", {
      name: "Krupa Lohar",
      email: "krupa@voicemind.ai",
    })
  );

  const [currentView, setCurrentView] = useState("dashboard");

  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    loadStoredString("voicemind_language", "English")
  );

  const [savedNotes, setSavedNotes] = useState(loadSavedNotes);

  const [activeAudioData, setActiveAudioData] = useState({
    audioUrl: null,
    audioBlob: null,
    title: "Voice Note",
    duration: null,
    durationSeconds: null,
    type: "recorded",
    language: "English",
    noteId: null,
  });

  const [activeTranscript, setActiveTranscript] = useState("");

  const [activeSummaryData, setActiveSummaryData] = useState({
    summary: "",
    keyPoints: [],
    actionItems: [],
    topics: [],
    accuracy: 98,
    language: "English",
  });

  const [selectedNoteForModal, setSelectedNoteForModal] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const activeAudioUrlsRef = useRef(new Set());

  useEffect(() => {
    try {
      localStorage.setItem(
        "voicemind_saved_notes",
        JSON.stringify(savedNotes)
      );
    } catch (error) {
      console.error("Could not save notes:", error);
    }
  }, [savedNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "voicemind_user",
        JSON.stringify(currentUser)
      );
    } catch (error) {
      console.error("Could not save user:", error);
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem("voicemind_language", selectedLanguage);
    } catch (error) {
      console.error("Could not save language:", error);
    }
  }, [selectedLanguage]);

  useEffect(() => {
    return () => {
      activeAudioUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore
        }
      });
    };
  }, []);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const getUserId = () => {
    try {
      const directUserId = localStorage.getItem("user_id");
      if (directUserId) return directUserId;

      const storedUser = localStorage.getItem("voicemind_user");
      if (!storedUser) return null;

      const user = JSON.parse(storedUser);
      return user?.id || user?.user_id || null;
    } catch (error) {
      console.error("Could not get user ID:", error);
      return null;
    }
  };

  const syncUserNotesFromBackend = async (userId) => {
    if (!userId) return;

    try {
      const data = await api.getSavedNotes(userId);

      if (Array.isArray(data?.notes) && data.notes.length > 0) {
        setSavedNotes((previous) => {
          const existingIds = new Set(previous.map((n) => n.id));

          const backendMapped = data.notes.map((bn) => {
            const rawTitle =
              bn.upload_voice ||
              bn.recorded_voice ||
              `Voice Note #${bn.id}`;

            const cleanTitle =
              String(rawTitle)
                .split("\\")
                .pop()
                .split("/")
                .pop()
                .replace(/^\d+_/, "")
                .replace(/\.[^/.]+$/, "") ||
              `Voice Note #${bn.id}`;

            return {
              id: bn.id,
              title: cleanTitle,
              date: bn.created_at
                ? new Date(bn.created_at).toLocaleDateString()
                : new Date().toLocaleDateString(),
              durationSeconds: bn.duration_seconds ?? null,
              duration: bn.duration_seconds != null
                ? formatDuration(Number(bn.duration_seconds))
                : null,
              category: "General",
              transcript: bn.transcript || "",
              summary: bn.summary || "",
              keyPoints: [],
              actionItems: [],
              topics: ["Voice Note"],
            };
          });

          const newNotes = backendMapped.filter((note) => !existingIds.has(note.id));
          const backendById = new Map(backendMapped.map((note) => [note.id, note]));
          const updatedPrevious = previous.map((note) => {
            const backendNote = backendById.get(note.id);
            return backendNote
              ? {
                  ...note,
                  duration: backendNote.duration ?? note.duration,
                  durationSeconds:
                    backendNote.durationSeconds ?? note.durationSeconds,
                }
              : note;
          });

          return [...newNotes, ...updatedPrevious];
        });
      }
    } catch (error) {
      console.warn("Could not sync notes from backend:", error);
    }
  };

  useEffect(() => {
    const userId = getUserId();
    if (userId) syncUserNotesFromBackend(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSuccess = (user, rememberMe = true) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    setCurrentView("dashboard");

    if (user?.id) syncUserNotesFromBackend(user.id);

    try {
      localStorage.removeItem("voicemind_logged_in");
      sessionStorage.removeItem("voicemind_logged_in");

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("voicemind_logged_in", "true");
    } catch (error) {
      console.warn("Login storage error:", error);
    }

    showToast(`Welcome, ${user?.name || "Krupa"}!`);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);

    try {
      localStorage.removeItem("voicemind_logged_in");
      sessionStorage.removeItem("voicemind_logged_in");
    } catch {
      // Ignore
    }

    setCurrentView("dashboard");
    showToast("Logged out successfully");
  };

  const handleAudioReady = async (audioInfo) => {
    try {
      console.log("AUDIO READY:", audioInfo);

      if (!audioInfo?.audioBlob) {
        showToast("Audio file not found.");
        return false;
      }

      const userId = getUserId();

      if (!userId) {
        showToast("User ID not found. Please login again.");
        return false;
      }

      const language =
        audioInfo?.language || selectedLanguage || "English";

      let audioUrl = audioInfo?.audioUrl || null;

      if (!audioUrl) {
        audioUrl = URL.createObjectURL(audioInfo.audioBlob);
        activeAudioUrlsRef.current.add(audioUrl);
      }

      const voiceType =
        audioInfo?.type === "recorded" ? "recorded" : "upload";

      let durationSeconds = audioInfo?.durationSeconds;
      if (!Number.isFinite(Number(durationSeconds)) || durationSeconds == null) {
        durationSeconds = await getAudioDurationSeconds(audioInfo.audioBlob);
      }
      if (!Number.isFinite(Number(durationSeconds)) || durationSeconds == null) {
        durationSeconds = null;
      }

      const uploadResult = await api.uploadVoiceNote(
        audioInfo.audioBlob,
        audioInfo.title || "Voice Note",
        userId,
        voiceType,
        durationSeconds
      );

      console.log("BACKEND UPLOAD RESPONSE:", uploadResult);

      const noteId = uploadResult?.note_id;

      if (!noteId) {
        throw new Error("Backend did not return note ID.");
      }

      localStorage.setItem("voicenote_note_id", String(noteId));

      setActiveAudioData({
        ...audioInfo,
        audioUrl,
        audioBlob: audioInfo.audioBlob,
        durationSeconds,
        duration: durationSeconds == null
          ? null
          : formatDuration(durationSeconds),
        language,
        noteId,
        type: voiceType,
      });

      setActiveTranscript("");
      localStorage.removeItem("voicenote_transcript");
      setCurrentView("processing");

      showToast(
        voiceType === "recorded"
          ? "Recording saved successfully!"
          : "Audio file saved successfully!"
      );
      return true;
    } catch (error) {
      console.error("AUDIO READY ERROR:", error);
      showToast(error?.message || "Could not process audio.");
      return false;
    }
  };

  const handleProcessingComplete = async () => {
    try {
      const storedNoteId = localStorage.getItem("voicenote_note_id");

      if (!storedNoteId) {
        showToast("Note ID not found.");
        return;
      }

      const noteId = Number(storedNoteId);

      setCurrentView("transcript");

      const result = await api.transcribe(noteId, selectedLanguage);
      console.log("TRANSCRIPTION RESPONSE:", result);

      const transcript = result?.transcript?.trim() || "";

      if (!transcript) {
        showToast("Whisper did not return transcript.");
        return;
      }

      setActiveTranscript(transcript);
      localStorage.setItem("voicenote_transcript", transcript);

      setActiveAudioData((previous) => ({
        ...previous,
        noteId,
        transcript,
        language: selectedLanguage,
      }));

      showToast(
        `${selectedLanguage} transcript generated successfully!`
      );
    } catch (error) {
      console.error("TRANSCRIPTION ERROR:", error);
      showToast(error?.message || "Transcription failed.");
    }
  };

  const handleGoToGenerateSummary = () => {
    setCurrentView("summary");
  };

  const handleSummaryGenerated = (summaryResult) => {
    const summaryData = {
      summary: summaryResult?.summary || "",
      keyPoints: Array.isArray(summaryResult?.keyPoints)
        ? summaryResult.keyPoints
        : [],
      actionItems: Array.isArray(summaryResult?.actionItems)
        ? summaryResult.actionItems
        : [],
      topics: Array.isArray(summaryResult?.topics)
        ? summaryResult.topics
        : [],
      accuracy: summaryResult?.accuracy || 98,
      language: summaryResult?.language || selectedLanguage,
    };

    setActiveSummaryData(summaryData);
    setCurrentView("summary-transcript");

    showToast(
      `${selectedLanguage} summary generated successfully!`
    );
  };

  const handleSaveNote = (newNote) => {
    const noteToSave = {
      ...newNote,
      transcript: newNote?.transcript || activeTranscript || "",
      summary: newNote?.summary || activeSummaryData.summary || "",
      keyPoints: Array.isArray(newNote?.keyPoints)
        ? newNote.keyPoints
        : activeSummaryData.keyPoints,
      actionItems: Array.isArray(newNote?.actionItems)
        ? newNote.actionItems
        : activeSummaryData.actionItems,
      topics: Array.isArray(newNote?.topics)
        ? newNote.topics
        : activeSummaryData.topics,
      accuracy:
        newNote?.accuracy || activeSummaryData.accuracy || 98,
      durationSeconds:
        newNote?.durationSeconds ?? activeAudioData.durationSeconds ?? null,
      duration:
        newNote?.duration ?? activeAudioData.duration ?? null,
      language: newNote?.language || selectedLanguage,
      date: newNote?.date || new Date().toLocaleDateString(),
    };

    setSavedNotes((previous) => [noteToSave, ...previous]);

    showToast(
      `"${noteToSave.title || "Voice Note"}" saved successfully!`
    );
  };

  const handleDeleteNote = (noteId) => {
    setSavedNotes((previous) =>
      previous.filter((note) => note.id !== noteId)
    );

    if (selectedNoteForModal?.id === noteId) {
      setSelectedNoteForModal(null);
    }

    if (noteId && typeof noteId === "number") {
      api.deleteVoiceNote(noteId);
    }

    showToast("Note deleted successfully");
  };

  const handleViewNote = (note) => {
    const fixedNote = {
      ...note,
      transcript: note?.transcript || "",
      summary: note?.summary || "",
      keyPoints: Array.isArray(note?.keyPoints) ? note.keyPoints : [],
      actionItems: Array.isArray(note?.actionItems)
        ? note.actionItems
        : [],
      topics: Array.isArray(note?.topics) ? note.topics : [],
    };

    setSelectedNoteForModal(fixedNote);
  };

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-root-layout">
      {toastMessage && (
        <div className="app-floating-toast">
          <span>{toastMessage}</span>
        </div>
      )}

      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          if (view === "new-note") {
            setCurrentView("upload");
          } else if (view === "history") {
            setCurrentView("saved-notes");
          } else if (view === "profile") {
            setShowProfileModal(true);
          } else {
            setCurrentView(view);
          }
        }}
        onLogout={handleLogout}
        notesCount={savedNotes.length}
      />

      <div className="app-main-viewport">
        <Header
          user={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setShowProfileModal(true)}
        />

        <FlowBreadcrumbs
          currentStep={currentView}
          onSelectStep={(step) => {
            if (step === "new-note" || step === "record") {
              setCurrentView("upload");
            } else if (step === "audio-player") {
              if (
                activeAudioData?.audioUrl ||
                activeAudioData?.audioBlob
              ) {
                setCurrentView("audio-player");
              } else {
                showToast(
                  "Please record or upload an audio file first."
                );
                setCurrentView("record");
              }
            } else {
              setCurrentView(step);
            }
          }}
        />

        <main className="app-content-body">
          {/* AUDIO PLAYER: This condition fixes the blank page */}
          {currentView === "audio-player" && (
            <AudioPlayerPage
              audioData={activeAudioData}
              onBack={() => setCurrentView("dashboard")}
              onProcessAudio={(audioInfo) =>
                handleAudioReady({
                  ...audioInfo,
                  type: "uploaded",
                  language: selectedLanguage,
                })
              }
            />
          )}

          {currentView === "dashboard" && (
            <DashboardPage
              notes={savedNotes}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              onNavigate={(view) => setCurrentView(view)}
              onViewNote={handleViewNote}
              onDeleteNote={handleDeleteNote}
              onStartRecording={() => setCurrentView("record")}
              onFileUpload={(file) => {
                handleAudioReady({
                  audioBlob: file,
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  type: "uploaded",
                  language: selectedLanguage,
                  duration: null,
                  durationSeconds: null,
                  initialTranscript: "",
                });
              }}
            />
          )}

          {currentView === "record" && (
            <RecordVoicePage
              onAudioReady={(audioInfo) =>
                handleAudioReady({ ...audioInfo, type: "recorded" })
              }
              selectedLanguage={selectedLanguage}
              onCancel={() => setCurrentView("dashboard")}
            />
          )}

          {currentView === "upload" && (
            <UploadAudioPage
              onAudioReady={(audioInfo) =>
                handleAudioReady({ ...audioInfo, type: "uploaded" })
              }
              selectedLanguage={selectedLanguage}
              onTranscriptReady={(transcript, noteId) => {
                const cleanTranscript = transcript?.trim() || "";

                setActiveTranscript(cleanTranscript);

                localStorage.setItem(
                  "voicenote_transcript",
                  cleanTranscript
                );

                if (noteId) {
                  localStorage.setItem(
                    "voicenote_note_id",
                    String(noteId)
                  );
                }

                setActiveAudioData((previous) => ({
                  ...previous,
                  noteId,
                  transcript: cleanTranscript,
                  language: selectedLanguage,
                }));

                setCurrentView("transcript");

                showToast(
                  `${selectedLanguage} transcript generated successfully!`
                );
              }}
              onCancel={() => setCurrentView("dashboard")}
            />
          )}



          {currentView === "processing" && (
            <ProcessingPage onComplete={handleProcessingComplete} />
          )}

          {currentView === "transcript" && (
            <TranscriptPage
              audioData={activeAudioData}
              transcript={activeTranscript}
              setTranscript={setActiveTranscript}
              onGenerateSummary={handleGoToGenerateSummary}
            />
          )}

          {currentView === "summary" && (
            <GenerateSummaryPage
              transcript={activeTranscript}
              selectedLanguage={selectedLanguage}
              onSummaryGenerated={handleSummaryGenerated}
            />
          )}

          {currentView === "summary-transcript" && (
            <SummaryTranscriptPage
              audioData={activeAudioData}
              transcript={activeTranscript}
              summaryData={activeSummaryData}
              onSaveNote={handleSaveNote}
              onViewSavedNotes={() => setCurrentView("saved-notes")}
            />
          )}

          {(currentView === "saved-notes" ||
            currentView === "history") && (
            <SavedNotesPage
              notes={savedNotes}
              onViewNote={handleViewNote}
              onDeleteNote={handleDeleteNote}
              onCreateNewNote={() => setCurrentView("record")}
            />
          )}
        </main>
      </div>

      {selectedNoteForModal && (
        <NoteDetailModal
          note={selectedNoteForModal}
          onClose={() => setSelectedNoteForModal(null)}
          onDelete={(id) => {
            handleDeleteNote(id);
            setSelectedNoteForModal(null);
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          notesCount={savedNotes.length}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}
