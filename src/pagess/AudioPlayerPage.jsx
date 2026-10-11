
import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { getAudioDurationSeconds } from "../lib/audioDuration";

const allowedExtensions = new Set([
  "mp3",
  "wav",
  "m4a",
  "webm",
  "ogg",
  "oga",
  "flac",
  "aac",
]);

const maximumFileSize = 18 * 1024 * 1024;

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(90deg, #667eea, #764ba2)",
  color: "white",
  font: "inherit",
};

export default function AudioPlayerPage({ audioData, onBack, onProcessAudio }) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [durationSeconds, setDurationSeconds] = useState(null);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const localAudio = selectedFile || (
      audioData?.audioUrl ? null : audioData?.audioBlob
    );

    if (!localAudio) {
      setPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(localAudio);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile, audioData?.audioBlob, audioData?.audioUrl]);

  useEffect(() => {
    if (selectedFile) {
      setDurationSeconds(null);
      getAudioDurationSeconds(selectedFile).then(setDurationSeconds);
    } else {
      setDurationSeconds(audioData?.durationSeconds ?? null);
    }
  }, [selectedFile, audioData?.durationSeconds]);

  const audioUrl = selectedFile
    ? previewUrl
    : audioData?.audioUrl || previewUrl;
  const audioTitle = selectedFile?.name || audioData?.title || "Voice Note";

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!allowedExtensions.has(extension)) {
      setError("Choose a supported audio file: MP3, WAV, M4A, WebM, OGG, FLAC, or AAC.");
      return;
    }

    if (file.size > maximumFileSize) {
      setError("Audio file must be 18 MB or smaller to process.");
      return;
    }

    setError("");
    setSelectedFile(file);
  };

  const handleProcessAudio = async () => {
    if (!selectedFile || !onProcessAudio || isProcessing) return;

    setError("");
    setIsProcessing(true);
    try {
      const succeeded = await onProcessAudio({
        audioBlob: selectedFile,
        title: selectedFile.name,
        durationSeconds,
      });

      if (!succeeded) {
        setError("Audio upload failed. Check the error message and try again.");
      }
    } catch (processingError) {
      setError(processingError?.message || "Audio upload failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!Number.isFinite(Number(seconds)) || seconds == null) return "";
    const roundedSeconds = Math.round(Number(seconds));
    return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")}`;
  };

  return (
    <div style={{ padding: "24px", boxSizing: "border-box", width: "100%" }}>
      <h2 style={{ marginTop: 0 }}>Audio Player</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.webm,.ogg,.oga,.flac,.aac,audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg,audio/flac,audio/aac"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={buttonStyle}
        >
          <UploadCloud size={16} />
          {selectedFile || audioUrl ? "Change Audio" : "Upload Audio"}
        </button>

        {selectedFile && (
          <button
            type="button"
            onClick={handleProcessAudio}
            disabled={isProcessing}
            style={{ ...buttonStyle, opacity: isProcessing ? 0.7 : 1 }}
          >
            {isProcessing ? "Uploading and processing..." : "Transcribe and Summarize"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: "#b91c1c", margin: "0 0 12px" }}>
          {error}
        </p>
      )}

      {audioUrl ? (
        <div style={{ width: "100%", maxWidth: "600px" }}>
          <p style={{ overflowWrap: "anywhere", margin: "0 0 8px" }}>{audioTitle}</p>
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
            onError={() => setError("This audio file could not be played in your browser.")}
            style={{ width: "100%" }}
          >
            Your browser does not support audio playback.
          </audio>
          {formatDuration(durationSeconds) && (
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "14px" }}>
              Duration: {formatDuration(durationSeconds)}
            </p>
          )}
        </div>
      ) : (
        <p>No audio selected. Upload an audio file to play it here.</p>
      )}

      <button
        type="button"
        onClick={onBack}
        style={{ ...buttonStyle, marginTop: "20px" }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}