// This script runs before the page renders to prevent flash of wrong theme
(function () {
  const theme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (theme === "dark" || (!theme && prefersDark)) {
    document.documentElement.classList.add("theme-dark");
  } else {
    document.documentElement.classList.remove("theme-dark");
  }
})();
