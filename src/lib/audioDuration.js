export const getAudioDurationSeconds = (audioFile) =>
  new Promise((resolve) => {
    if (!audioFile) {
      resolve(null);
      return;
    }

    const objectUrl = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute("src");
    };

    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration);
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    audio.onerror = () => {
      cleanup();
      resolve(null);
    };

    audio.src = objectUrl;
  });