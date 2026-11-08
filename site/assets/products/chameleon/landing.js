// The product pages' one script: light or dark before the first paint, and the header's Light / Dark switch.
// Light for anyone who has not chosen. The choice is kept in this browser (localStorage 'landing.theme').
const THEME_KEY = 'landing.theme';
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.content = theme === 'dark' ? '#0E1A2B' : '#FBF6EC'; // the page ground of each palette (landing.css)
}
setTheme(savedTheme());

function themeSwitch() {
  const button = document.getElementById('theme-switch');
  if (!button) return;
  const label = () => {
    const name = document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark';
    button.setAttribute('aria-label', name);
    button.title = name;
  };
  label();
  button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // no storage: the choice lasts for this visit
    }
    label();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', themeSwitch); else themeSwitch();
