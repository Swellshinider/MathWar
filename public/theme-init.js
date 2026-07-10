(function () {
  try {
    var preference = localStorage.getItem('math-war.theme') || 'system';
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = preference === 'system' ? (dark ? 'dark' : 'light') : preference;
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  } catch (_) {
    // CSS media queries provide the fallback when storage is unavailable.
  }
})();
