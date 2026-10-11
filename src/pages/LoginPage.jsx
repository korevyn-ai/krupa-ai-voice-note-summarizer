
import { useState } from 'react';
import {
  Mic,
  Mail,
  Lock,
  User,
  ArrowRight,
  Shield
} from 'lucide-react';

import { api } from '../api/client';

export default function LoginPage({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSignUp && !name.trim()) {
      setFormError('Enter your full name.');
      return;
    }

    if (!email.trim() || !password) {
      setFormError('Please enter email and password.');
      return;
    }

    if (isSignUp && password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    setFormError('');
    setLoading(true);

    try {
      let result;
      let userName;

      if (isSignUp) {
        result = await api.register(
          name.trim(),
          email.trim(),
          password
        );

        userName =
          result?.name ||
          result?.user?.name ||
          name.trim();
      } else {
        result = await api.login(
          email.trim(),
          password
        );

        userName =
          result?.name ||
          result?.user?.name ||
          name.trim() ||
          'User';
      }

      const userId =
        result?.user_id ??
        result?.user?.id ??
        result?.id;

      if (
        userId === undefined ||
        userId === null ||
        userId === ''
      ) {
        throw new Error(
          'User ID was not returned by the backend.'
        );
      }

      const user = {
        id: userId,
        name: userName,
        email:
          result?.email ||
          result?.user?.email ||
          email.trim()
      };

      localStorage.setItem(
        'voicemind_user',
        JSON.stringify(user)
      );

      onLoginSuccess(user);
    } catch (error) {
      console.error('LOGIN / SIGNUP ERROR:', error);

      setFormError(
        error instanceof Error
          ? error.message
          : 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsSignUp((previous) => !previous);
    setName('');
    setEmail('');
    setPassword('');
    setFormError('');
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-ambient-blob blob-1"></div>
      <div className="login-ambient-blob blob-2"></div>

      <div className="login-container-card">
        <div className="login-card-brand">
          <div className="login-brand-logo-circle">
            <Mic
              size={28}
              className="brand-mic-icon"
            />
          </div>

          <div className="login-brand-titles">
            <h1
              className="login-brand-heading"
              style={{ fontSize: '20px' }}
            >
              <span className="brand-title-voice">
                AI Voice Note
              </span>{' '}
              <span className="brand-title-mind">
                Summarizer
              </span>
            </h1>
          </div>
        </div>

        <div className="login-welcome-banner">
          <h2>
            {isSignUp
              ? 'Create your account'
              : 'Welcome!'}
          </h2>

          <p>
            {isSignUp
              ? 'Start turning voice recordings into concise, actionable AI notes.'
              : 'Sign in to access your voice notes, transcripts, and smart summaries.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="auth-form-body"
          autoComplete="off"
        >
          {isSignUp && (
            <div className="input-group-row">
              <label htmlFor="signup-name">
                Full Name
              </label>

              <div className="input-with-icon">
                <User
                  size={18}
                  className="input-adornment-icon"
                />

                <input
                  id="signup-name"
                  type="text"
                  name="signup-full-name"
                  placeholder="Enter your name"
                  autoComplete="off"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  required
                />
              </div>
            </div>
          )}

          <div className="input-group-row">
            <label htmlFor="login-email">
              Email Address
            </label>

            <div className="input-with-icon">
              <Mail
                size={18}
                className="input-adornment-icon"
              />

              <input
                id="login-email"
                type="email"
                name="login-email"
                placeholder="name@example.com"
                autoComplete="off"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />
            </div>
          </div>

          <div className="input-group-row">
            <div className="password-label-row">
              <label htmlFor="login-password">
                Password
              </label>
            </div>

            <div className="input-with-icon">
              <Lock
                size={18}
                className="input-adornment-icon"
              />

              <input
                id="login-password"
                type="password"
                name="login-password"
                placeholder={
                  isSignUp
                    ? 'At least 8 characters'
                    : 'Enter your password'
                }
                autoComplete="new-password"
                minLength={isSignUp ? 8 : undefined}
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />
            </div>
          </div>

          {formError && (
            <p
              className="auth-form-error"
              role="alert"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="login-primary-gradient-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-dot-loading">
                {isSignUp
                  ? 'Creating account...'
                  : 'Logging in...'}
              </span>
            ) : (
              <>
                <span>
                  {isSignUp ? 'Sign Up' : 'Log In'}
                </span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-toggle-footer">
          <span>
            {isSignUp
              ? 'Already have an account?'
              : "Don't have an account yet?"}
          </span>

          <button
            type="button"
            className="toggle-link-btn"
            onClick={toggleAuthMode}
          >
            {isSignUp ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <div className="login-security-tag">
          <Shield
            size={14}
            color="#10B981"
          />

          <span>
            AES-256 Encrypted Voice Transcription &amp; AI Storage
          </span>
        </div>
      </div>
    </div>
  );
}