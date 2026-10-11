import { useState, useRef, useEffect } from "react";

import {
  UploadCloud,
  FileAudio,
  ArrowRight,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import { getAudioDurationSeconds } from "../lib/audioDuration";

export default function UploadAudioPage({ onAudioReady, selectedLanguage = "English" }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(null);

  const fileInputRef = useRef(null);
  const allowedExtensions = ["mp3", "wav", "m4a", "webm"];
  const maximumFileSize = 18 * 1024 * 1024;

  const handleProcessFile = async (file) => {
    setErrorMsg("");
    setSuccessMsg("");

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      setErrorMsg(
        "Please select an MP3, WAV, M4A, or WebM audio file."
      );
      return;
    }

    if (file.size > maximumFileSize) {
      setErrorMsg("Audio file must be 18MB or smaller to transcribe.");
      return;
    }

    setSelectedFile(file);
    setDurationSeconds(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      handleProcessFile(file);
    }
  };

  useEffect(() => {
    if (!selectedFile) {
      setAudioUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    let isCurrentFile = true;
    setAudioUrl(objectUrl);

    getAudioDurationSeconds(selectedFile).then((duration) => {
      if (isCurrentFile) setDurationSeconds(duration);
    });

    return () => {
      isCurrentFile = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  // ============================
  // UPLOAD AND START PROCESSING
  // ============================
  const handleProceed = async () => {
    if (!selectedFile || uploading) return;

    try {
      setErrorMsg("");
      setSuccessMsg("");
      setUploading(true);

      const uploaded = await onAudioReady({
        durationSeconds,
        title: selectedFile.name,
        type: "uploaded",
        audioBlob: selectedFile,
        language: selectedLanguage,
      });

      if (uploaded === false) {
        setErrorMsg("Upload failed. Please try again.");
        return;
      }

      setSuccessMsg("Audio uploaded. Preparing your transcript...");
    } catch (error) {
      console.error("Audio processing error:", error);
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to upload audio."
      );
    } finally {
      setUploading(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setAudioUrl(null);
    setDurationSeconds(null);
    setErrorMsg("");
    setSuccessMsg("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return (
      parseFloat((bytes / Math.pow(k, i)).toFixed(2)) +
      " " +
      sizes[i]
    );
  };

  const formatDuration = (seconds) => {
    if (!Number.isFinite(Number(seconds)) || seconds == null) return null;
    const roundedSeconds = Math.round(Number(seconds));
    const minutes = Math.floor(roundedSeconds / 60);
    const remainingSeconds = roundedSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  return (
    <div className="studio-container-card">

      <div className="studio-card-header">
        <div className="studio-header-icon-wrap upload-gradient-icon">
          <UploadCloud size={22} color="#FFFFFF" />
        </div>

        <div>
          <h2>Upload Audio</h2>

          <p>
            Upload your audio and convert it into text using Whisper.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="error-alert-banner">
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="preview-heading" role="status">
          <span>{successMsg}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".mp3,.wav,.m4a,.webm,audio/mpeg,audio/wav,audio/mp4,audio/webm"
        style={{ display: "none" }}
      />

      {!selectedFile ? (
        <div>
          <div className="recording-centerpiece">
            <div className="drop-icon-circle" style={{ width: 88, height: 88 }}>
              <UploadCloud size={44} className="cloud-bounce-icon" />
            </div>

            <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "var(--text-primary)" }}>
              Upload Your Audio
            </h3>

            <p className="drop-sub-text">
              Choose an audio file from your device to get started.
            </p>

            <button
              type="button"
              className="primary-studio-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={18} />
              Choose Audio File
            </button>

            <div className="supported-formats-pills" style={{ marginTop: "18px" }}>
              <span>MP3</span>
              <span>WAV</span>
              <span>M4A</span>
              <span>WebM</span>
              <span className="limit-pill">Max 18MB</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="file-selected-view">
          <div className="file-summary-card">
            <div className="file-meta-left">
              <div className="file-audio-icon-box">
                <FileAudio size={24} color="#6366F1" />
              </div>

              <div className="file-details">
                <h4>{selectedFile.name}</h4>
                <p>
                  {formatFileSize(selectedFile.size)}
                  {durationSeconds != null
                    ? ` • ${formatDuration(durationSeconds)}`
                    : " • Reading duration..."}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                className="secondary-studio-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <UploadCloud size={16} />
                Change File
              </button>
              <button
                type="button"
                className="remove-file-btn"
                onClick={clearSelectedFile}
                disabled={uploading}
              >
                <Trash2 size={16} />
                <span>Remove File</span>
              </button>
            </div>
          </div>

          {audioUrl && (
            <audio
              controls
              preload="metadata"
              src={audioUrl}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  setDurationSeconds(duration);
                }
              }}
              onError={() => setErrorMsg("This audio file could not be played in your browser.")}
              style={{ width: "100%" }}
            >
              Your browser does not support audio playback.
            </audio>
          )}

          <div className="upload-actions-row">
            <button
              type="button"
              className="primary-studio-btn proceed-btn"
              onClick={handleProceed}
              disabled={uploading || !audioUrl}
            >
              {uploading ? (
                <>
                  <LoaderCircle size={18} className="cloud-bounce-icon" />
                  <span>Uploading Audio...</span>
                </>
              ) : (
                <>
                  <span>Upload Audio</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}