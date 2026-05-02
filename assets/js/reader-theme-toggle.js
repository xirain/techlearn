(() => {
  const storageKey = 'reader-theme';
  const html = document.documentElement;
  const modeToggle = document.getElementById('mode-toggle');

  if (!modeToggle || !modeToggle.parentElement) {
    return;
  }

  const getStoredTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch (err) {
      return null;
    }
  };

  const storeTheme = (theme) => {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (err) {
      return;
    }
  };

  const setTheme = (theme) => {
    html.dataset.readerTheme = theme;
    storeTheme(theme);

    const enabled = theme === 'typography';
    toggleButton.setAttribute('aria-pressed', String(enabled));
    toggleButton.setAttribute('aria-label', enabled ? '切换到默认主题' : '切换到阅读主题');
    toggleButton.title = enabled ? '阅读主题' : '默认主题';

    const icon = toggleButton.querySelector('i');
    icon.className = enabled ? 'fas fa-book-open' : 'fas fa-layer-group';
  };

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.id = 'reader-theme-toggle';
  toggleButton.className = modeToggle.className;
  toggleButton.innerHTML = '<i class="fas fa-book-open"></i>';

  modeToggle.insertAdjacentElement('afterend', toggleButton);
  setTheme(getStoredTheme() || html.dataset.readerTheme || 'typography');

  toggleButton.addEventListener('click', () => {
    setTheme(html.dataset.readerTheme === 'typography' ? 'classic' : 'typography');
  });
})();
