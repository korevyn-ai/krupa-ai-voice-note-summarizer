
import "./App.css";
import { useState } from "react";

import Login from "./Login";
import Navbar from "./components/Navbar";
import RecordVoice from "./components/RecordVoice";
import UploadAudio from "./components/UploadAudio";
import SpeechToText from "./components/SpeechToText";
import AISummary from "./components/AISummary";
import KeyPoints from "./components/KeyPoints";


function App() {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("voicemind_user");
      const isLoggedIn = localStorage.getItem("voicemind_logged_in");

      if (isLoggedIn === "true" && savedUser) {
        return JSON.parse(savedUser);
      }

      return null;
    } catch {
      localStorage.removeItem("voicemind_user");
      localStorage.removeItem("voicemind_logged_in");
      return null;
    }
  });

  const handleLogin = (loggedInUser) => {
    if (!loggedInUser) return;

    setUser(loggedInUser);
  };

  const handleLogout = () => {
    localStorage.removeItem("voicemind_user");
    localStorage.removeItem("voicemind_logged_in");
    localStorage.removeItem("voicemind_token");

    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <Navbar />

      <div className="home">
        <div className="welcome-header">
          <h1>AI Voice Note Summarizer</h1>

          <p className="subtitle">
            Convert your voice into smart notes with AI
          </p>

          <p>
            Welcome, {user.name || "User"}!
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="logout-button"
          >
            Logout
          </button>
        </div>

        <div className="buttons">
          <RecordVoice />
          <UploadAudio />
        </div>

        <div className="features">
          <SpeechToText />
          <AISummary />
          <KeyPoints />

          <div className="feature-card">
            <div className="icon">📚</div>
            <h2>History</h2>
            <p>
              View your previous voice notes and summaries.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
