import React from 'react';
import { Feather, HelpCircle, Cpu, Globe, Moon, Sun } from 'lucide-react';

export default function Header({ fontSize: _fontSize, setFontSize, language, setLanguage, theme, setTheme }) {
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <>
      {/* TheRavens Top Utility Bar */}
      <div className="eci-top-bar" id="theravens-top-bar">
        <div className="top-bar-left">
          <span className="top-bar-brand">
            <Feather size={13} /> TheRavens Group
          </span>
          <span className="top-bar-divider">|</span>
          <span>Electoral Intelligence & Voter Analytics Platform</span>
        </div>

        <div className="top-bar-right">
          {/* Theme Toggle Button */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? (
              <><Moon size={13} /> <span>Dark Mode</span></>
            ) : (
              <><Sun size={13} /> <span>Light Mode</span></>
            )}
          </button>

          <div className="font-resizer">
            <span>Aa</span>
            <button onClick={() => setFontSize('14px')} aria-label="Decrease font size">A-</button>
            <button onClick={() => setFontSize('16px')} aria-label="Reset font size">A</button>
            <button onClick={() => setFontSize('18px')} aria-label="Increase font size">A+</button>
          </div>

          <select
            className="lang-select-top"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Language selector"
          >
            <option value="ENGLISH">English</option>
            <option value="TAMIL">தமிழ் (Tamil)</option>
            <option value="HINDI">हिंदी (Hindi)</option>
          </select>

          <a href="#" className="top-bar-link">
            <HelpCircle size={13} /> Support
          </a>
        </div>
      </div>

      {/* Main TheRavens Header */}
      <header className="eci-main-header" id="theravens-main-header">
        <div className="eci-branding">
          <div className="ravens-emblem-logo" aria-label="TheRavens Logo">
            <Feather size={28} />
          </div>
          <div className="eci-titles">
            <h1>TheRavens Electoral Intelligence</h1>
            <h2>
              <Globe size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              E-Roll Search & Voter Directory Portal
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="portal-badge">
            <Cpu size={13} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }} />
            Engine v2.6
          </div>
        </div>
      </header>
    </>
  );
}
